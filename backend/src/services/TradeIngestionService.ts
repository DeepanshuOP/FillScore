import { BinanceClient } from './BinanceClient';
import { BybitClient } from './BybitClient';
import { OKXClient } from './OKXClient';
import { BinanceRawTrade, NormalisedTrade, FetchTradesOptions } from '../types';
import { Trade } from '../models/Trade';
import crypto from 'crypto';
import { VALID_DEMO_USERS } from '../middleware/resolveAccount';
import { MarketDataService } from './MarketDataService';
import { computeFeeUsd } from '../scoring/fees';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type StoreOutcome = 'inserted' | 'existing' | 'raced';

/**
 * Insert a trade unless it is stored. Two writers can race for the same (userId, exchange, symbol, tradeId): the loser's
 * upsert can fail with a duplicate-key error (code 11000). That means "already stored", so it is reported as `raced` and
 * counted by the caller, never thrown. Any other error still propagates.
 */
export async function storeTradeIfAbsent(filter: Record<string, unknown>, doc: Record<string, unknown>): Promise<StoreOutcome> {
    try {
        const r = await Trade.updateOne(filter, { $setOnInsert: doc }, { upsert: true });
        return r.upsertedCount > 0 ? 'inserted' : 'existing';
    } catch (e: any) {
        if (e?.code === 11000) return 'raced';
        throw e;
    }
}

export class TradeIngestionService {
    private marketData = new MarketDataService();

    /**
     * F-10: attach the fee in USD. Third-asset fees (e.g. BNB) are priced with the 1m kline close at
     * execution time. If that price cannot be fetched the trade is still stored, without feeUsd.
     */
    public async withFeeUsd<T extends NormalisedTrade>(trade: T): Promise<T> {
        try {
            const feeUsd = await computeFeeUsd(trade, (pair, ts) => this.marketData.fetchClosePrice(pair, ts));
            return { ...trade, feeUsd };
        } catch (e: any) {
            console.error(`[Ingest] feeUsd unavailable for ${trade.exchange} ${trade.tradeId} (${trade.feeAsset}): ${e?.message ?? e}`);
            return trade;
        }
    }

    public async fetchAllTrades(
        options: FetchTradesOptions,
        client: BinanceClient
    ): Promise<BinanceRawTrade[]> {
        const { symbol, startTime, endTime } = options;

        const recentTrades = await client.fetchRecentTrades(symbol, 1000);
        const oldestTime = recentTrades.length > 0
            ? Math.min(...recentTrades.map(t => t.time))
            : Infinity;

        if (recentTrades.length < 1000 || oldestTime <= startTime) {
            return recentTrades.filter(t => t.time >= startTime && t.time <= endTime);
        }

        console.log(`[Ingest] >1000 trades for ${symbol} within window; falling back to 24h day-loop.`);

        const allTrades: BinanceRawTrade[] = [];
        const seenTrades = new Set<number>();

        let currentStart = startTime;
        while (currentStart < endTime) {
            let currentEnd = currentStart + MS_PER_DAY;
            if (currentEnd > endTime) {
                currentEnd = endTime;
            }

            const chunkTrades = await client.fetchTradesForWindow(symbol, currentStart, currentEnd);

            for (const trade of chunkTrades) {
                if (!seenTrades.has(trade.id)) {
                    seenTrades.add(trade.id);
                    allTrades.push(trade);
                }
            }

            currentStart = currentEnd;

            if (currentStart < endTime) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        return allTrades;
    }

    public normaliseTrade(raw: BinanceRawTrade, userId: string): NormalisedTrade {
        return {
            userId,
            exchange: 'binance',
            symbol: raw.symbol,
            tradeId: raw.id.toString(),
            orderId: raw.orderId.toString(),
            side: raw.isBuyer ? 'BUY' : 'SELL',
            // In Maker/Taker paradigm: a maker order provides liquidity (always LIMIT). 
            // If it aggressively took liquidity, we classify it as MARKET (though technically it could be an aggressive limit).
            orderType: raw.isMaker ? 'LIMIT' : 'MARKET',
            isMaker: raw.isMaker,
            executionPrice: parseFloat(raw.price),
            quantity: parseFloat(raw.qty),
            notional: parseFloat(raw.quoteQty),
            fee: parseFloat(raw.commission),
            feeAsset: raw.commissionAsset,
            executedAt: new Date(raw.time)
        };
    }

    public async ingestForUser(
        userId: string,
        apiKey: string,
        apiSecret: string,
        symbol: string,
        daysBack: number
    ): Promise<{ inserted: number; skipped: number; raced?: number }> {
        // Instantiate a dedicated client to avoid any concurrency/singleton side-effects
        const client = new BinanceClient(apiKey, apiSecret);

        const endTime = Date.now();
        const startTime = endTime - (daysBack * MS_PER_DAY);
        let windowStart = startTime;

        const latest = await Trade.findOne(
            { userId, exchange: 'binance', symbol },
            { executedAt: 1 },
            { sort: { executedAt: -1 } }
        );

        if (latest && latest.executedAt.getTime() >= startTime && latest.executedAt.getTime() <= endTime) {
            windowStart = latest.executedAt.getTime();
            console.log(`[Ingest] Resuming from last known trade: ${latest.executedAt.toISOString()}`);
        }

        // Orchestration step 1: Fetch
        const rawTrades = await this.fetchAllTrades({
            symbol,
            startTime: windowStart,
            endTime,
            userId
        }, client);

        let inserted = 0;
        let skipped = 0;
        let raced = 0;

        // Orchestration step 2 & 3: Normalise & Upsert
        for (const raw of rawTrades) {
            const normalised = await this.withFeeUsd(this.normaliseTrade(raw, userId));

            const filter = {
                userId: normalised.userId,
                exchange: normalised.exchange,
                symbol: normalised.symbol,
                tradeId: normalised.tradeId
            };

            // $setOnInsert prevents us from unnecessarily overwriting existing trade fields
            // which allows future enrichments (scores, metrics) to not be destroyed by re-ingestion.
            const outcome = await storeTradeIfAbsent(filter, { ...normalised, accountId: userId, dataSource: VALID_DEMO_USERS.has(userId) ? 'synthetic-demo' : 'real-user' });
            if (outcome === 'inserted') {
                inserted++;
            } else {
                skipped++;
                if (outcome === 'raced') raced++;
            }
        }

        return { inserted, skipped, raced };
    }

    public async ingestBybitForUser(
        userId: string,
        apiKey: string,
        apiSecret: string,
        symbol: string,
        daysBack: number
    ): Promise<{ inserted: number; skipped: number; raced?: number }> {
        // Instantiate a dedicated Bybit client — avoids singleton/concurrency side-effects
        const bybitClient = new BybitClient(apiKey, apiSecret);

        const endTime = Date.now();
        const startTime = endTime - (daysBack * MS_PER_DAY);

        let windowStart = startTime;
        const latest = await Trade.findOne(
            { userId, exchange: 'bybit', symbol },
            { executedAt: 1 },
            { sort: { executedAt: -1 } }
        );

        if (latest && latest.executedAt.getTime() >= startTime && latest.executedAt.getTime() <= endTime) {
            windowStart = latest.executedAt.getTime();
            console.log(`[Ingest] Resuming from last known trade: ${latest.executedAt.toISOString()}`);
        }

        const totalDays = Math.ceil((endTime - windowStart) / MS_PER_DAY);

        let inserted = 0;
        let skipped = 0;
        let raced = 0;

        let dayIndex = 1;

        // Chunk the full date range into 24-hour windows to stay inside Bybit's
        // per-request time range limits and to keep memory usage bounded.
        while (windowStart < endTime) {
            let windowEnd = windowStart + MS_PER_DAY;
            if (windowEnd > endTime) {
                windowEnd = endTime;
            }

            const rawTrades = await bybitClient.fetchTradesForWindow(symbol, windowStart, windowEnd);

            console.log(`[Bybit Ingest] Day ${dayIndex}/${totalDays}: fetched ${rawTrades.length} trades for ${symbol}`);

            // Normalise and upsert each trade; $setOnInsert prevents re-ingestion
            // from overwriting downstream enrichments (scores, metrics).
            for (const raw of rawTrades) {
                const normalised = await this.withFeeUsd(bybitClient.normaliseBybitTrade(raw, userId));

                const outcome = await storeTradeIfAbsent(
                    { userId, exchange: 'bybit', symbol: normalised.symbol, tradeId: raw.execId },
                    { ...normalised, accountId: userId, dataSource: VALID_DEMO_USERS.has(userId) ? 'synthetic-demo' : 'real-user' },
                );

                if (outcome === 'inserted') {
                    inserted++;
                } else {
                    // already stored (or a racing writer stored it first) — skip it
                    skipped++;
                    if (outcome === 'raced') raced++;
                }
            }

            windowStart = windowEnd;
            dayIndex++;

            // 200 ms breathing room between chunks to respect Bybit rate limits
            if (windowStart < endTime) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        return { inserted, skipped, raced };
    }

    public async ingestOKXForUser(
        userId: string,
        apiKey: string,
        apiSecret: string,
        passphrase: string,
        instId: string,
        daysBack: number
    ): Promise<{ inserted: number; skipped: number; raced?: number }> {
        const okxClient = new OKXClient(apiKey, apiSecret, passphrase);

        const endTime = Date.now();
        const startTime = endTime - (daysBack * MS_PER_DAY);

        const symbol = instId.replace('-', '');
        let windowStart = startTime;
        const latest = await Trade.findOne(
            { userId, exchange: 'okx', symbol },
            { executedAt: 1 },
            { sort: { executedAt: -1 } }
        );

        if (latest && latest.executedAt.getTime() >= startTime && latest.executedAt.getTime() <= endTime) {
            windowStart = latest.executedAt.getTime();
            console.log(`[OKX Ingest] Resuming from last known trade: ${latest.executedAt.toISOString()}`);
        }

        const totalDays = Math.ceil((endTime - windowStart) / MS_PER_DAY);

        let inserted = 0;
        let skipped = 0;
        let raced = 0;
        let dayIndex = 1;

        while (windowStart < endTime) {
            let windowEnd = windowStart + MS_PER_DAY;
            if (windowEnd > endTime) {
                windowEnd = endTime;
            }

            const rawTrades = await okxClient.fetchTradesForWindow(instId, windowStart, windowEnd);

            console.log(`[OKX Ingest] Day ${dayIndex}/${totalDays}: fetched ${rawTrades.length} trades for ${instId}`);

            for (const raw of rawTrades) {
                const normalised = await this.withFeeUsd(okxClient.normaliseOKXTrade(raw, userId));

                const outcome = await storeTradeIfAbsent(
                    { userId, exchange: 'okx', symbol: normalised.symbol, tradeId: raw.billId },
                    { ...normalised, accountId: userId, dataSource: VALID_DEMO_USERS.has(userId) ? 'synthetic-demo' : 'real-user' },
                );

                if (outcome === 'inserted') {
                    inserted++;
                } else {
                    skipped++;
                    if (outcome === 'raced') raced++;
                }
            }

            windowStart = windowEnd;
            dayIndex++;

            if (windowStart < endTime) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        return { inserted, skipped, raced };
    }
}

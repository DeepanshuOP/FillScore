import { BinanceClient } from './BinanceClient';
import { BybitClient } from './BybitClient';
import { OKXClient } from './OKXClient';
import { BinanceRawTrade, NormalisedTrade, FetchTradesOptions } from '../types';
import { Trade } from '../models/Trade';
import crypto from 'crypto';
import { VALID_DEMO_USERS } from '../middleware/resolveAccount';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class TradeIngestionService {

    public async fetchAllTrades(
        options: FetchTradesOptions,
        client: BinanceClient
    ): Promise<BinanceRawTrade[]> {
        const { symbol, startTime, endTime } = options;
        const allTrades: BinanceRawTrade[] = [];

        // We deduct seen trades by ID to prevent overlap/duplicates at exact chunk boundaries
        const seenTrades = new Set<number>();

        const duration = endTime - startTime;
        const totalDays = Math.ceil(duration / MS_PER_DAY);

        let currentStart = startTime;
        let dayIndex = 1;

        while (currentStart < endTime) {
            // Chunk must not exceed 24 hours, nor should it exceed the requested exact endTime.
            let currentEnd = currentStart + MS_PER_DAY;
            if (currentEnd > endTime) {
                currentEnd = endTime;
            }

            // Fetch from API wrapper
            const chunkTrades = await client.fetchTradesForWindow(symbol, currentStart, currentEnd);

            let newInChunk = 0;
            for (const trade of chunkTrades) {
                if (!seenTrades.has(trade.id)) {
                    seenTrades.add(trade.id);
                    allTrades.push(trade);
                    newInChunk++;
                }
            }

            console.log(`[Ingest] Day ${dayIndex}/${totalDays}: fetched ${newInChunk} trades for ${symbol}`);

            currentStart = currentEnd;
            dayIndex++;

            // Delay between requests to safely stay inside rate limits
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
    ): Promise<{ inserted: number; skipped: number }> {
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

        // Orchestration step 2 & 3: Normalise & Upsert
        for (const raw of rawTrades) {
            const normalised = this.normaliseTrade(raw, userId);

            const filter = {
                userId: normalised.userId,
                exchange: normalised.exchange,
                tradeId: normalised.tradeId
            };

            // $setOnInsert prevents us from unnecessarily overwriting existing trade fields
            // which allows future enrichments (scores, metrics) to not be destroyed by re-ingestion.
            const updateResult = await Trade.updateOne(
                filter,
                { $setOnInsert: { ...normalised, accountId: userId, dataSource: VALID_DEMO_USERS.has(userId) ? 'synthetic-demo' : 'real-user' } },
                { upsert: true }
            );

            if (updateResult.upsertedCount > 0) {
                inserted++;
            } else {
                skipped++;
            }
        }

        return { inserted, skipped };
    }

    public async ingestBybitForUser(
        userId: string,
        apiKey: string,
        apiSecret: string,
        symbol: string,
        daysBack: number
    ): Promise<{ inserted: number; skipped: number }> {
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
                const normalised = bybitClient.normaliseBybitTrade(raw, userId);

                const updateResult = await Trade.updateOne(
                    { userId, exchange: 'bybit', tradeId: raw.execId },
                    { $setOnInsert: { ...normalised, accountId: userId, dataSource: VALID_DEMO_USERS.has(userId) ? 'synthetic-demo' : 'real-user' } },
                    { upsert: true }
                );

                if (updateResult.upsertedCount > 0) {
                    inserted++;
                } else {
                    // matchedCount > 0 means the document already existed — skip it
                    skipped++;
                }
            }

            windowStart = windowEnd;
            dayIndex++;

            // 200 ms breathing room between chunks to respect Bybit rate limits
            if (windowStart < endTime) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        return { inserted, skipped };
    }

    public async ingestOKXForUser(
        userId: string,
        apiKey: string,
        apiSecret: string,
        passphrase: string,
        instId: string,
        daysBack: number
    ): Promise<{ inserted: number; skipped: number }> {
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
        let dayIndex = 1;

        while (windowStart < endTime) {
            let windowEnd = windowStart + MS_PER_DAY;
            if (windowEnd > endTime) {
                windowEnd = endTime;
            }

            const rawTrades = await okxClient.fetchTradesForWindow(instId, windowStart, windowEnd);

            console.log(`[OKX Ingest] Day ${dayIndex}/${totalDays}: fetched ${rawTrades.length} trades for ${instId}`);

            for (const raw of rawTrades) {
                const normalised = okxClient.normaliseOKXTrade(raw, userId);

                const updateResult = await Trade.updateOne(
                    { userId, exchange: 'okx', tradeId: raw.billId },
                    { $setOnInsert: { ...normalised, accountId: userId, dataSource: VALID_DEMO_USERS.has(userId) ? 'synthetic-demo' : 'real-user' } },
                    { upsert: true }
                );

                if (updateResult.upsertedCount > 0) {
                    inserted++;
                } else {
                    skipped++;
                }
            }

            windowStart = windowEnd;
            dayIndex++;

            if (windowStart < endTime) {
                await new Promise(r => setTimeout(r, 200));
            }
        }

        return { inserted, skipped };
    }
}

import { BinanceClient } from './BinanceClient';
import { BinanceRawTrade, NormalisedTrade, FetchTradesOptions } from '../types';
import { Trade } from '../models/Trade';

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

        // Orchestration step 1: Fetch
        const rawTrades = await this.fetchAllTrades({
            symbol,
            startTime,
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
                { $setOnInsert: normalised },
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
}

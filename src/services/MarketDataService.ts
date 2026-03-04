import axios from 'axios';
import { MarketCache } from '../models/MarketCache';
import { Trade, EnrichedTradeDocument } from '../models/Trade';
import { BinanceKline } from '../types';

export class MarketDataService {
    /**
     * Helper to fetch klines with caching mechanism
     */
    private async getKlineData(symbol: string, startTime: number, endTime: number, limit: number): Promise<BinanceKline[]> {
        // Round to nearest minute for uniform cache keys
        const minuteStart = Math.floor(startTime / 60000) * 60000;
        const key = `${symbol}_${minuteStart}_${limit}`;

        const cached = await MarketCache.findOne({ key }).lean();
        if (cached) {
            return cached.data as unknown as BinanceKline[];
        }

        const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=${limit}`;
        const response = await axios.get<BinanceKline[]>(url);
        const data = response.data;

        if (data && data.length > 0) {
            await MarketCache.updateOne(
                { key },
                { $set: { data, cachedAt: new Date() } },
                { upsert: true }
            );
        }

        return data;
    }

    public async fetchArrivalPrice(symbol: string, tradeTimestampMs: number): Promise<number> {
        const startTime = tradeTimestampMs - 60000;
        const endTime = tradeTimestampMs;

        const klines = await this.getKlineData(symbol, startTime, endTime, 1);

        if (!klines || klines.length === 0) {
            throw new Error(`No arrival kline data found for ${symbol}`);
        }

        return parseFloat(klines[0][1] as string);
    }

    public async fetchVwap5min(symbol: string, tradeTimestampMs: number): Promise<number> {
        const startTime = tradeTimestampMs - 300000;
        const endTime = tradeTimestampMs + 300000;

        const candles = await this.getKlineData(symbol, startTime, endTime, 10);

        if (!candles || candles.length === 0) {
            throw new Error(`No vwap kline data found for ${symbol}`);
        }

        // Compute VWAP: sum(close * volume) / sum(volume)
        const numerator = candles.reduce((s, c) => s + (parseFloat(c[4] as string) * parseFloat(c[5] as string)), 0);
        const denominator = candles.reduce((s, c) => s + parseFloat(c[5] as string), 0);

        if (denominator === 0) return 0;

        return numerator / denominator;
    }

    public estimateSpreadBps(high: number, low: number): number {
        // 0.15 is an empirical approximation scaling factor used to reflect that the actual executed
        // spread is typically tighter than the extreme high/low wicks of a 1-minute candle,
        // which represent the absolute limits of liquidity taken rather than the sustained bid-ask spread.
        const mid = (high + low) / 2;
        if (mid === 0) return 0;
        return ((high - low) / mid) * 10000 * 0.15;
    }

    public async enrichTrade(trade: EnrichedTradeDocument): Promise<void> {
        const timestampMs = trade.executedAt.getTime();

        const [arrivalPriceProxy, vwap5min] = await Promise.all([
            this.fetchArrivalPrice(trade.symbol, timestampMs),
            this.fetchVwap5min(trade.symbol, timestampMs)
        ]);

        // To calculate spread we need the high and low from the arrival kline.
        const startTime = timestampMs - 60000;
        const endTime = timestampMs;
        const klines = await this.getKlineData(trade.symbol, startTime, endTime, 1);

        if (!klines || klines.length === 0) {
            throw new Error(`Could not find kline to compute spread for trade ${trade.tradeId}`);
        }

        const high = parseFloat(klines[0][2] as string);
        const low = parseFloat(klines[0][3] as string);
        const spreadBps = this.estimateSpreadBps(high, low);

        await Trade.findByIdAndUpdate(trade._id, {
            $set: {
                arrivalPriceProxy,
                vwap5min,
                spreadBps
            }
        });
    }

    public async enrichAllPendingTrades(userId: string): Promise<{ enriched: number; failed: number }> {
        const pendingTrades = await Trade.find({
            userId,
            $or: [
                { arrivalPriceProxy: { $exists: false } },
                { arrivalPriceProxy: null }
            ]
        });

        let enriched = 0;
        let failed = 0;

        const BATCH_SIZE = 50;
        const totalBatches = Math.ceil(pendingTrades.length / BATCH_SIZE);

        if (totalBatches === 0) {
            return { enriched: 0, failed: 0 };
        }

        for (let i = 0; i < totalBatches; i++) {
            const batch = pendingTrades.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);

            let batchEnriched = 0;
            let batchFailed = 0;

            await Promise.all(batch.map(async (trade) => {
                try {
                    await this.enrichTrade(trade);
                    batchEnriched++;
                } catch (error) {
                    console.error(`Failed to enrich trade ${trade.tradeId}:`, error);
                    batchFailed++;
                }
            }));

            enriched += batchEnriched;
            failed += batchFailed;

            console.log(`[Enrichment] Batch ${i + 1}/${totalBatches}: enriched ${batchEnriched} trades`);

            if (i < totalBatches - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        return { enriched, failed };
    }
}

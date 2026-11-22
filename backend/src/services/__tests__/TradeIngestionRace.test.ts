import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
import { TradeIngestionService, storeTradeIfAbsent } from '../TradeIngestionService';
import { BinanceHistorySync } from '../BinanceHistorySync';
import { Trade } from '../../models/Trade';
import { loadEnv } from '../../config/env';

loadEnv();

const mockFetchRecentTrades = vi.fn();
vi.mock('../BinanceClient', () => ({
    BinanceClient: class {
        fetchRecentTrades = mockFetchRecentTrades;
        fetchTradesForWindow = vi.fn();
    },
}));

const raw = (id: number) => ({
    symbol: 'BTCUSDT', id, orderId: 1000 + id, price: '50000.00', qty: '1.0', quoteQty: '50000.00',
    commission: '5.00', commissionAsset: 'USDT', time: Date.now() - 60_000, isBuyer: true, isMaker: true, isBestMatch: true,
});

// Hand arithmetic. 50 distinct trades fetched by two writers at the same moment: every trade is stored exactly once, so
// inserted_a + inserted_b = 50 and, because each writer meets the other's rows or its own insert, skipped_a + skipped_b = 100 - 50 = 50.
// A duplicate-key error (code 11000) from a racing insert means "already stored": it is counted in `skipped` and in `raced`.
describe('trade ingestion: a racing duplicate insert is "already stored", never a failed sync', () => {
    let service: TradeIngestionService;
    let uid: string;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error('MONGODB_URI not set');
        await mongoose.connect(uri);
        await Trade.init();                       // the unique index (userId, exchange, symbol, tradeId) must exist for the race
        service = new TradeIngestionService();
        uid = new ObjectId().toString();
    });
    afterAll(async () => {
        await mongoose.disconnect();
    });
    afterEach(async () => {
        await Trade.deleteMany({});
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('two concurrent writers of the same 50 trades: no error, 50 rows, every trade inserted once', async () => {
        const trades = Array.from({ length: 50 }, (_, i) => raw(i + 1));
        mockFetchRecentTrades.mockResolvedValue(trades);
        const [a, b] = await Promise.all([
            service.ingestForUser(uid, 'k', 's', 'BTCUSDT', 1),
            service.ingestForUser(uid, 'k', 's', 'BTCUSDT', 1),
        ]);
        expect(await Trade.countDocuments({ userId: uid })).toBe(50);
        expect(a.inserted + b.inserted).toBe(50);
        expect(a.skipped + b.skipped).toBe(50);
        expect((a.raced ?? 0) + (b.raced ?? 0)).toBeLessThanOrEqual(50);
    });

    it('a duplicate-key error from the database is counted as raced and skipped, and the sync goes on', async () => {
        mockFetchRecentTrades.mockResolvedValue([raw(1), raw(2)]);
        const real = Trade.updateOne.bind(Trade);
        let n = 0;
        // the other writer wins the insert of trade 1: this writer's call stores nothing and the server answers 11000
        vi.spyOn(Trade, 'updateOne').mockImplementation(((...args: Parameters<typeof Trade.updateOne>) => {
            if (n++ === 0) {
                return real(...args).then(() => { throw Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }); });
            }
            return real(...args);
        }) as unknown as typeof Trade.updateOne);
        const r = await service.ingestForUser(uid, 'k', 's', 'BTCUSDT', 1);
        expect(r).toMatchObject({ inserted: 1, skipped: 1, raced: 1 });
        expect(await Trade.countDocuments({ userId: uid })).toBe(2);
    });

    it('any other database error still fails the call', async () => {
        vi.spyOn(Trade, 'updateOne').mockImplementation((() => Promise.reject(Object.assign(new Error('network'), { code: 6 }))) as unknown as typeof Trade.updateOne);
        await expect(storeTradeIfAbsent({ userId: uid, exchange: 'binance', symbol: 'BTCUSDT', tradeId: '9' }, {})).rejects.toThrow('network');
    });

    it('the history sync counts a racing duplicate the same way', async () => {
        const sync = new BinanceHistorySync('k', 's', uid, { lookbackDays: 1 });
        const real = Trade.updateOne.bind(Trade);
        let n = 0;
        vi.spyOn(Trade, 'updateOne').mockImplementation(((...args: Parameters<typeof Trade.updateOne>) => {
            if (n++ === 0) return real(...args).then(() => { throw Object.assign(new Error('E11000'), { code: 11000 }); });
            return real(...args);
        }) as unknown as typeof Trade.updateOne);
        const acc = { inserted: 0, skipped: 0, raced: 0 };
        await (sync as unknown as { ingestRaw(r: unknown, a: typeof acc): Promise<void> }).ingestRaw(raw(7), acc);
        await (sync as unknown as { ingestRaw(r: unknown, a: typeof acc): Promise<void> }).ingestRaw(raw(8), acc);
        expect(acc).toEqual({ inserted: 1, skipped: 1, raced: 1 });
        expect(await Trade.countDocuments({ userId: uid })).toBe(2);
    });
});

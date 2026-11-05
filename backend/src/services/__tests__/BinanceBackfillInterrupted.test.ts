import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { BinanceHistorySync } from '../BinanceHistorySync';
import { Trade } from '../../models/Trade';
import { loadEnv } from '../../config/env';

loadEnv();

const UID = 'real-backfill-interrupted';
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const DAY = 86_400_000;
// ids -> age in days: 1:300 2:250 3:200 4:150 5:100 6:20 7:10 8:5
const AGES: Record<number, number> = { 1: 300, 2: 250, 3: 200, 4: 150, 5: 100, 6: 20, 7: 10, 8: 5 };
const ALL = Object.entries(AGES).map(([id, age]) => ({
    symbol: 'BTCUSDT', id: Number(id), orderId: Number(id), price: '100', qty: '1', quoteQty: '100', commission: '0.1',
    commissionAsset: 'USDT', time: NOW - age * DAY, isBuyer: true, isMaker: false, isBestMatch: true,
}));
const INFO = {
    rateLimits: [{ rateLimitType: 'REQUEST_WEIGHT', interval: 'MINUTE', intervalNum: 1, limit: 6000 }],
    symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true }],
};
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
let visible: Set<number>;
const run = (days: number) =>
    new BinanceHistorySync('k', 's', UID, { lookbackDays: days, extraSymbols: ['BTCUSDT'], sleep: async () => {}, now: () => NOW }).run();

// State left by an interrupted backfill: the OLDEST ids (1, 2) were stored, ids 3-5 were not.
// Hand count: run 1 (30d) stores 6,7,8 = 3. Run 2 (365d, only ids 1,2,6,7,8 exist upstream) stores 1,2 = 2 (total 5).
// Run 3 (365d, all 8 exist, no coverage): must fill the hole 3,4,5 = 3 more (total 8).
// The old stop condition "stop at the oldest stored id" stops at id 1 immediately and leaves 3-5 missing.
describe('a backfill that was interrupted leaves no permanent hole', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await Trade.syncIndexes(); });
    beforeEach(() => {
        visible = new Set(Object.keys(AGES).map(Number));
        global.fetch = vi.fn(async (url: string) => {
            const u = new URL(url);
            if (u.pathname === '/api/v3/exchangeInfo') return json(INFO);
            if (u.pathname === '/api/v3/account') return json({ balances: [] });
            const q = u.searchParams;
            const from = q.get('fromId') ? Number(q.get('fromId')) : 0;
            const start = q.get('startTime') ? Number(q.get('startTime')) : 0;
            return json(ALL.filter(t => visible.has(t.id) && t.id >= from && t.time >= start).slice(0, 1000));
        }) as any;
    });
    afterEach(async () => { await Trade.deleteMany({ userId: UID }); });

    it('fills ids 3-5 on the next sync', async () => {
        expect((await run(30)).inserted).toBe(3);
        visible = new Set([1, 2, 6, 7, 8]);
        expect((await run(365)).inserted).toBe(2);
        expect(await Trade.countDocuments({ userId: UID })).toBe(5);
        visible = new Set(Object.keys(AGES).map(Number));
        expect((await run(365)).inserted).toBe(3);
        expect(await Trade.countDocuments({ userId: UID })).toBe(8);
    });
});

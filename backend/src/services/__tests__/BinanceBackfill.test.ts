import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { BinanceHistorySync } from '../BinanceHistorySync';
import { Trade } from '../../models/Trade';
import { loadEnv } from '../../config/env';

loadEnv();

const UID = 'real-backfill-1';
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const DAY = 86_400_000;
// Fixture (BTCUSDT), id -> age in days:
//   1:300  2:250  3:200  4:150  5:100   (older than 30d)
//   6:20   7:10   8:5                   (inside 30d)
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
let calls: URLSearchParams[];

const run = (days: number, coverage?: Record<string, number>) =>
    new BinanceHistorySync('k', 's', UID, { lookbackDays: days, extraSymbols: ['BTCUSDT'], coverage, sleep: async () => {}, now: () => NOW }).run();

describe('Binance lookback backfill', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await Trade.syncIndexes(); });
    beforeEach(() => {
        calls = [];
        global.fetch = vi.fn(async (url: string) => {
            const u = new URL(url);
            if (u.pathname === '/api/v3/exchangeInfo') return json(INFO);
            if (u.pathname === '/api/v3/account') return json({ balances: [] });
            // M1 Part B: orders and commission are fetched after each symbol; this file counts myTrades calls only.
            if (u.pathname === '/api/v3/allOrders') return json([]);
            if (u.pathname === '/api/v3/account/commission') return new Response('{}', { status: 400 });
            calls.push(u.searchParams);
            const q = u.searchParams;
            const from = q.get('fromId') ? Number(q.get('fromId')) : 0;
            const start = q.get('startTime') ? Number(q.get('startTime')) : 0;
            return json(ALL.filter(t => t.id >= from && t.time >= start).slice(0, 1000));
        }) as any;
    });
    afterEach(async () => { await Trade.deleteMany({ userId: UID }); });

    it('30d stored, then 365d: adds ids 1-5 only, no duplicates, newest resume at fromId=9', async () => {
        const r1 = await run(30);
        expect(r1.inserted).toBe(3); // ids 6,7,8
        expect(r1.coverage!.BTCUSDT).toBe(NOW - 30 * DAY);
        calls = [];

        const r2 = await run(365, r1.coverage);
        // backfill: startTime=NOW-365d returns 1..8; ids >= oldest stored (6) are not re-ingested -> 5 inserted
        expect(r2.inserted).toBe(5);
        expect(await Trade.countDocuments({ userId: UID })).toBe(8);
        const startCalls = calls.filter(c => c.get('startTime'));
        expect(startCalls).toHaveLength(1);
        expect(startCalls[0].get('startTime')).toBe(String(NOW - 365 * DAY));
        // forward resume unchanged: newest stored id 8 -> fromId 9
        expect(calls.filter(c => c.get('fromId')).map(c => c.get('fromId'))).toEqual(['9']);
        expect(r2.coverage!.BTCUSDT).toBe(NOW - 365 * DAY);
    });

    it('repeat 365d with stored coverage makes 0 backfill requests (only the forward resume)', async () => {
        const r1 = await run(365);
        expect(r1.inserted).toBe(8);
        calls = [];
        const r2 = await run(365, r1.coverage);
        expect(r2.inserted).toBe(0);
        expect(calls.filter(c => c.get('startTime'))).toHaveLength(0);
        expect(calls.map(c => c.get('fromId'))).toEqual(['9']);
    });

    it('legacy data without stored coverage still backfills when cutoff predates the oldest stored trade', async () => {
        await run(30); // coverage deliberately discarded
        calls = [];
        const r = await run(365);
        expect(r.inserted).toBe(5);
        expect(calls.filter(c => c.get('startTime'))).toHaveLength(1);
    });

    it('stops with partialReason time_cap once the wall-clock deadline has passed', async () => {
        const r = await new BinanceHistorySync('k', 's', UID, { lookbackDays: 30, extraSymbols: ['BTCUSDT'], sleep: async () => {}, now: () => NOW, deadlineMs: NOW - 1 }).run();
        expect(r.partial).toBe(true);
        expect(r.partialReason).toBe('time_cap');
    });
});

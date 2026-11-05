import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { BinanceHistorySync } from '../BinanceHistorySync';
import { Trade } from '../../models/Trade';
import { loadEnv } from '../../config/env';

loadEnv();

const UID = 'real-hist-1';
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const DAY = 86_400_000;

const INFO = {
    rateLimits: [{ rateLimitType: 'REQUEST_WEIGHT', interval: 'MINUTE', intervalNum: 1, limit: 6000 }],
    symbols: ['BTCUSDT', 'BTCFDUSD', 'DOGEUSDT', 'ETHUSDT', 'SOLUSDT'].map(s => {
        const quote = ['USDT', 'FDUSD'].find(q => s.endsWith(q))!;
        return { symbol: s, baseAsset: s.slice(0, -quote.length), quoteAsset: quote, status: 'TRADING', isSpotTradingAllowed: true };
    }),
};
const ACCOUNT = { balances: [{ asset: 'BTC', free: '1', locked: '0' }, { asset: 'ETH', free: '0', locked: '0' }] };

const raw = (id: number, time: number) => ({
    symbol: 'BTCUSDT', id, orderId: id, price: '50000', qty: '1', quoteQty: '50000', commission: '0.1',
    commissionAsset: 'USDT', time, isBuyer: true, isMaker: false, isBestMatch: true,
});
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

let fetchMock: ReturnType<typeof vi.fn>;
let myTradesCalls: URLSearchParams[];
const sleeps: number[] = [];
const sleep = async (ms: number) => { sleeps.push(ms); };

function route(myTrades: (q: URLSearchParams) => Response) {
    fetchMock.mockImplementation(async (url: string) => {
        const u = new URL(url);
        if (u.pathname === '/api/v3/exchangeInfo') return json(INFO);
        if (u.pathname === '/api/v3/account') return json(ACCOUNT);
        if (u.pathname === '/api/v3/myTrades') { myTradesCalls.push(u.searchParams); return myTrades(u.searchParams); }
        throw new Error('unexpected ' + u.pathname);
    });
}
const run = (lookbackDays: number, extra: string[] = [], maxRequests?: number) =>
    new BinanceHistorySync('k', 's', UID, { lookbackDays, extraSymbols: extra, sleep, now: () => NOW, maxRequests }).run();

describe('BinanceHistorySync', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    beforeEach(() => { fetchMock = vi.fn(); global.fetch = fetchMock as any; myTradesCalls = []; sleeps.length = 0; });
    afterEach(async () => { await Trade.deleteMany({ userId: UID }); });

    it('pages 1000 + 1000 + 500 trades via fromId, stores all 2500, and a second run adds none', async () => {
        // ids 1..2500, all one day old. Page 1 comes from startTime, later pages from fromId.
        const all = Array.from({ length: 2500 }, (_, i) => raw(i + 1, NOW - DAY + (i + 1) * 1000));
        route(q => {
            if (q.get('symbol') !== 'BTCUSDT') return json([]); // BTCFDUSD is also scanned (BTC balance), no trades
            const from = q.get('fromId') ? Number(q.get('fromId')) : 1;
            return json(all.filter(t => t.id >= from).slice(0, 1000));
        });
        const r1 = await run(365);
        // 1000 + 1000 + 500 = 2500 inserted over exactly three myTrades calls
        expect(r1.inserted).toBe(2500);
        myTradesCalls = myTradesCalls.filter(q => q.get('symbol') === 'BTCUSDT');
        expect(myTradesCalls).toHaveLength(3);
        expect(myTradesCalls[0].get('startTime')).toBe(String(NOW - 365 * DAY));
        expect(myTradesCalls[0].get('fromId')).toBeNull();
        expect(myTradesCalls.slice(1).map(q => q.get('fromId'))).toEqual(['1001', '2001']);
        expect(r1.partial).toBe(false);
        expect(await Trade.countDocuments({ userId: UID })).toBe(2500);

        myTradesCalls = [];
        const r2 = await run(365);
        // incremental: resumes at last stored id 2500 -> fromId 2501, empty page
        expect(myTradesCalls.filter(q => q.get('symbol') === 'BTCUSDT').map(q => q.get('fromId'))).toEqual(['2501']);
        expect(r2.inserted).toBe(0);
        expect(await Trade.countDocuments({ userId: UID })).toBe(2500);
    }, 60_000);

    it('respects the lookback cutoff', async () => {
        // 30-day lookback; trades 40d, 31d and 10d old -> only the 10d trade is inside
        route(() => json([raw(1, NOW - 40 * DAY), raw(2, NOW - 31 * DAY), raw(3, NOW - 10 * DAY)]));
        const r = await run(30);
        expect(myTradesCalls[0].get('startTime')).toBe(String(NOW - 30 * DAY));
        expect(r.inserted).toBe(1);
        expect((await Trade.find({ userId: UID }).lean()).map(t => t.tradeId)).toEqual(['3']);
    });

    it('backs off on 429 using Retry-After, then reports a partial sync', async () => {
        route(() => json({ code: -1003, msg: 'too many' }, 429, { 'retry-after': '2' }));
        const r = await run(365);
        // exchangeInfo + account + 3 myTrades attempts = 5 requests; three 2s back-offs
        expect(sleeps).toEqual([2000, 2000, 2000]);
        expect(r.requests).toBe(5);
        expect(r.partial).toBe(true);
        expect(r.partialReason).toBe('rate_limited');
        expect(r.message).toMatch(/Sync again/);
    });

    it('recovers when a single 429 is followed by success', async () => {
        let n = 0;
        route(() => (n++ === 0 ? json({}, 429, { 'retry-after': '1' }) : json([raw(1, NOW - DAY)])));
        const r = await run(365);
        expect(sleeps).toEqual([1000]);
        expect(r.partial).toBe(false);
        expect(r.inserted).toBe(1);
    });

    it('stops at once on a 418 ban', async () => {
        route(() => json({}, 418, { 'retry-after': '120' }));
        const r = await run(365);
        expect(r.partialReason).toBe('banned');
        expect(sleeps).toEqual([]);
    });

    it('stops with a partial status at the hard request cap', async () => {
        route(() => json([]));
        // cap 2 = exchangeInfo + account, third request (myTrades) is refused
        const r = await run(365, [], 2);
        expect(r.partial).toBe(true);
        expect(r.partialReason).toBe('request_cap');
        expect(r.requests).toBe(2);
    });

    it('waits out the minute when the used-weight header passes 50% of the limit', async () => {
        // limit 6000 -> budget 3000; header reports 2990 used, next call (+20) would exceed it
        fetchMock.mockImplementation(async (url: string) => {
            const u = new URL(url);
            if (u.pathname === '/api/v3/exchangeInfo') return json(INFO, 200, { 'x-mbx-used-weight-1m': '2990' });
            if (u.pathname === '/api/v3/account') return json(ACCOUNT, 200, { 'x-mbx-used-weight-1m': '1' });
            return json([]);
        });
        await run(365);
        expect(sleeps).toEqual([61_000]);
    });

    describe('discoverSymbols', () => {
        it('uses non-zero balances x quote assets plus a validated user list, rejecting unknown symbols', () => {
            const bal = [
                { asset: 'BTC', free: '1', locked: '0' },
                { asset: 'ETH', free: '0', locked: '0' }, // zero balance: skipped
                { asset: 'DOGE', free: '0', locked: '5' }, // locked counts
            ];
            const { symbols, invalid } = BinanceHistorySync.discoverSymbols(INFO.symbols, bal, ['solusdt', 'FAKEUSDT'], ['LUNAUSDT']);
            // BTC -> BTCUSDT, BTCFDUSD (no BTCUSDC/BTCBTC in exchangeInfo); DOGE -> DOGEUSDT;
            // user list adds SOLUSDT; stored symbol LUNAUSDT kept; FAKEUSDT rejected
            expect(symbols).toEqual(['BTCFDUSD', 'BTCUSDT', 'DOGEUSDT', 'LUNAUSDT', 'SOLUSDT']);
            expect(invalid).toEqual(['FAKEUSDT']);
        });
    });
});

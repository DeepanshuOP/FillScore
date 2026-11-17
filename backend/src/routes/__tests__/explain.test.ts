import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';
import { Order } from '../../models/Order';
import { OrderMeasurement } from '../../models/OrderMeasurement';
import { ExceptionReview } from '../../models/ExceptionReview';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { loadEnv } from '../../config/env';

// M4 routes: the exception queue with review states, the replay of one order, noise-aware rankings, the venue comparison.
// Seed for account A: 22 measured BTCUSDT orders o1..o22 with total cost 1..22 bps (intended notional 10,000 USD each), and
// 5 ETHUSDT orders. p90 of the 22 BTCUSDT + 5 ETHUSDT totals... the queue works over all 27 measured orders:
//   totals: 1..22 and five of 2.0  ->  sorted, n = 27, position 0.9 x 26 = 23.4 between the 24th and 25th value.
//   (the exact threshold is read from the response; the test fixes which orders are above it: o22, o21 and o20)
loadEnv();
const app = createApp();

const sf = (total: number) => ({ executionBps: total, spreadBps: total / 2, impactTimingBps: total / 2, opportunityBps: 0, feesBps: 0, totalBps: total, intendedNotional: 10000, fillRatio: 1 });
const meas = (accountId: string, symbol: string, orderId: string, total: number, arrivalMs: number) => ({
    accountId, exchange: 'binance', symbol, orderId, version: '1.0.0', side: 1, tradeIds: [`t-${orderId}`], arrivalMs, endMs: null, endBasis: 'filled',
    arrivalMid: 40000, endMid: null, shortfall: sf(total), unmeasuredReason: null, measuredAt: new Date('2024-03-01'),
    marketDataRefs: [{ source: 'data.binance.vision', dataset: 'spot/daily/aggTrades', symbol, date: '2024-01-15', window: null, sha256: 'a'.repeat(64) }],
});
const ord = (accountId: string, symbol: string, orderId: string) => ({
    accountId, exchange: 'binance', symbol, orderId, side: 'BUY', type: 'LIMIT', origQty: 0.5, executedQty: 0.5, status: 'FILLED', restingMs: 1500,
    createdAt: new Date('2024-01-15T14:00:00Z'), updatedAt: new Date('2024-01-15T14:00:02Z'), dataSource: 'real-user',
});
const trade = (accountId: string, symbol: string, orderId: string, exchange: string, cost: number | null, notional = 5000) => ({
    accountId, userId: accountId, dataSource: 'real-user', exchange, symbol, tradeId: `t-${orderId}-${exchange}`, orderId, side: 'BUY', orderType: 'LIMIT', isMaker: true,
    quantity: 0.1, executionPrice: notional / 0.1, notional, fee: 1, feeUsd: 1, feeAsset: 'USDT', executedAt: new Date('2024-01-15T14:00:01Z'),
    ...(cost === null ? {} : { measurement: { version: '1.0.0', effHalfBps: cost } }),
});

describe('explain routes', () => {
    let tokenA = '', tokenB = '', idA = '', idB = '';
    const headers = (t: string) => ({ Authorization: `Bearer ${t}` });

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const a = await User.create({ email: 'ex-a@example.com', emailVerified: true });
        const b = await User.create({ email: 'ex-b@example.com', emailVerified: true });
        idA = a._id.toString(); idB = b._id.toString();
        tokenA = (await issueTokenPair(idA)).accessToken; tokenB = (await issueTokenPair(idB)).accessToken;
        const hour = (h: number) => Date.UTC(2024, 0, 15, h, 0, 0);
        const ms = [], os = [];
        for (let i = 1; i <= 22; i++) { ms.push(meas(idA, 'BTCUSDT', `o${i}`, i, hour(i % 2 ? 14 : 3))); os.push(ord(idA, 'BTCUSDT', `o${i}`)); }
        for (let i = 1; i <= 5; i++) { ms.push(meas(idA, 'ETHUSDT', `e${i}`, 2, hour(14))); os.push(ord(idA, 'ETHUSDT', `e${i}`)); }
        await OrderMeasurement.collection.insertMany(ms as any);
        await Order.collection.insertMany(os as any);
        await Trade.collection.insertMany([
            trade(idA, 'BTCUSDT', 'o22', 'binance', 1.5), ...Array.from({ length: 22 }, (_, i) => trade(idA, 'BTCUSDT', `v${i}`, 'binance', 1.0)),
        ] as any);
        // account B: its own order with an id that account A also has
        await OrderMeasurement.collection.insertOne(meas(idB, 'BTCUSDT', 'o22', 99, hour(14)) as any);
        await Order.collection.insertOne(ord(idB, 'BTCUSDT', 'o22') as any);
    });
    afterAll(async () => {
        for (const m of [Trade, Order, OrderMeasurement, ExceptionReview]) await (m as any).deleteMany({ accountId: { $in: [idA, idB, 'demo-moderate'] } });
        await User.deleteMany({ _id: { $in: [idA, idB] } });
    });

    it('the queue lists the orders above the account\'s own 90th percentile, all open at first, each with its one-line finding', async () => {
        const res = await request(app).get('/api/audit/exceptions').set(headers(tokenA));
        expect(res.status).toBe(200);
        expect(res.body.items.map((i: any) => i.orderId)).toEqual(['o22', 'o21', 'o20']);
        expect(res.body.items.every((i: any) => i.state === 'open' && typeof i.finding === 'string' && i.finding.startsWith("This order's total cost was"))).toBe(true);
        expect(res.body.thresholds.minOrders).toBe(20);
        expect(res.body.checked).toBe(27);
        expect(res.body.reviewCounts).toEqual({ open: 3, reviewed: 0, dismissed: 0 });
    });

    it('a review state is stored per account and order, and the queue shows it; dismissed items are hidden unless asked for', async () => {
        const r1 = await request(app).patch('/api/audit/exceptions/o22?symbol=BTCUSDT').set(headers(tokenA)).send({ state: 'reviewed' });
        expect(r1.status).toBe(200);
        expect(r1.body).toMatchObject({ orderId: 'o22', symbol: 'BTCUSDT', state: 'reviewed' });
        const r2 = await request(app).patch('/api/audit/exceptions/o21?symbol=BTCUSDT').set(headers(tokenA)).send({ state: 'dismissed' });
        expect(r2.status).toBe(200);
        const q = await request(app).get('/api/audit/exceptions').set(headers(tokenA));
        expect(q.body.items.map((i: any) => [i.orderId, i.state])).toEqual([['o22', 'reviewed'], ['o20', 'open']]);
        expect(q.body.reviewCounts).toEqual({ open: 1, reviewed: 1, dismissed: 1 });
        const all = await request(app).get('/api/audit/exceptions?includeDismissed=1').set(headers(tokenA));
        expect(all.body.items.map((i: any) => [i.orderId, i.state])).toEqual([['o22', 'reviewed'], ['o21', 'dismissed'], ['o20', 'open']]);
        const reopen = await request(app).patch('/api/audit/exceptions/o21?symbol=BTCUSDT').set(headers(tokenA)).send({ state: 'open' });
        expect(reopen.status).toBe(200);
    });

    it('refuses an unknown state, an unknown order, and another account\'s order; account B never changes account A\'s review', async () => {
        expect((await request(app).patch('/api/audit/exceptions/o22?symbol=BTCUSDT').set(headers(tokenA)).send({ state: 'fixed' })).status).toBe(400);
        expect((await request(app).patch('/api/audit/exceptions/nope?symbol=BTCUSDT').set(headers(tokenA)).send({ state: 'reviewed' })).status).toBe(404);
        const before = await ExceptionReview.countDocuments({ accountId: idA });
        // B has its own o22 (cost 99): its review is B's, A's stays as it was
        const rb = await request(app).patch('/api/audit/exceptions/o22?symbol=BTCUSDT').set(headers(tokenB)).send({ state: 'dismissed' });
        expect(rb.status).toBe(200);
        expect(await ExceptionReview.countDocuments({ accountId: idA })).toBe(before);
        expect((await ExceptionReview.findOne({ accountId: idA, orderId: 'o22' }))!.state).toBe('reviewed');
        expect((await ExceptionReview.findOne({ accountId: idB, orderId: 'o22' }))!.state).toBe('dismissed');
    });

    it('needs a token to read or change; a demo account can be read but never changed', async () => {
        expect((await request(app).get('/api/audit/exceptions')).status).toBe(401);
        expect((await request(app).patch('/api/audit/exceptions/o22?symbol=BTCUSDT').send({ state: 'reviewed' })).status).toBe(401);
        const demoGet = await request(app).get('/api/audit/exceptions?userId=demo-moderate');
        expect(demoGet.status).toBe(200);
        expect(demoGet.body.items).toEqual([]);
        expect(demoGet.body.note).toMatch(/^Insufficient data/);
        const demoPatch = await request(app).patch('/api/audit/exceptions/o22?userId=demo-moderate&symbol=BTCUSDT').send({ state: 'reviewed' });
        expect(demoPatch.status).toBe(403);
        expect(demoPatch.body.error).toBe('demo_read_only');
    });

    it('the replay of an order: figures with their sources, the fills, and the public data files', async () => {
        const res = await request(app).get('/api/audit/orders/o22/replay?symbol=BTCUSDT').set(headers(tokenA));
        expect(res.status).toBe(200);
        const total = res.body.decomposition.find((d: any) => d.key === 'total');
        expect(total).toMatchObject({ bps: 22, source: { kind: 'order-measurement', field: 'shortfall.totalBps' } });
        expect(total.usd).toBeCloseTo(22, 9);                                                 // 22 bps x 10,000 / 10,000
        expect(res.body.fills.map((f: any) => f.tradeId)).toEqual(['t-o22-binance']);
        expect(res.body.sources[0].url).toBe('https://data.binance.vision/data/spot/daily/aggTrades/BTCUSDT/BTCUSDT-aggTrades-2024-01-15.zip');
        expect(res.body.order).toMatchObject({ orderId: 'o22', status: 'FILLED', restingMs: 1500 });
    });

    it('the replay never shows another account\'s order', async () => {
        const res = await request(app).get('/api/audit/orders/o22/replay?symbol=BTCUSDT').set(headers(tokenB));
        expect(res.status).toBe(200);
        expect(res.body.decomposition.find((d: any) => d.key === 'total').bps).toBe(99);     // B's own o22, not A's
        expect((await request(app).get('/api/audit/orders/e1/replay?symbol=ETHUSDT').set(headers(tokenB))).status).toBe(404);
        expect((await request(app).get('/api/audit/orders/o22/replay')).status).toBe(401);
    });

    it('rankings by symbol say "too few to tell" for ETHUSDT (5 orders) and rank BTCUSDT; by hour needs 20 orders per hour', async () => {
        const res = await request(app).get('/api/audit/rankings?by=symbol').set(headers(tokenA));
        expect(res.status).toBe(200);
        const by = Object.fromEntries(res.body.groups.map((g: any) => [g.key, g]));
        expect(by.BTCUSDT).toMatchObject({ status: 'ranked', n: 22, median: 11.5, rank: 1 });
        expect(by.ETHUSDT).toMatchObject({ status: 'too-few', n: 5, median: null, rank: null });
        const hours = await request(app).get('/api/audit/rankings?by=hour').set(headers(tokenA));
        expect(hours.body.groups.every((g: any) => g.status === 'too-few')).toBe(true);        // 11+11 BTC orders at hour 14 / 3 plus 5 ETH: none has 20
        expect((await request(app).get('/api/audit/rankings?by=planet').set(headers(tokenA))).status).toBe(400);
    });

    describe('another account with the same order id on two symbols, and fills on two venues (review test gaps)', () => {
        let idC = '', tokenC = '';
        beforeAll(async () => {
            const c = await User.create({ email: 'ex-c@example.com', emailVerified: true });
            idC = c._id.toString(); tokenC = (await issueTokenPair(idC)).accessToken;
            await OrderMeasurement.collection.insertMany([meas(idC, 'BTCUSDT', 'dup', 3, Date.UTC(2024, 0, 15, 14)), meas(idC, 'ETHUSDT', 'dup', 4, Date.UTC(2024, 0, 15, 14))] as any);
            await Order.collection.insertMany([ord(idC, 'BTCUSDT', 'dup'), ord(idC, 'ETHUSDT', 'dup')] as any);
            await Trade.collection.insertMany([
                ...Array.from({ length: 20 }, (_, i) => trade(idC, 'BTCUSDT', `x${i}`, 'binance', 1.0)),
                ...Array.from({ length: 20 }, (_, i) => trade(idC, 'BTCUSDT', `y${i}`, 'bybit', 3.0)),
            ] as any);
        });
        afterAll(async () => {
            for (const m of [Trade, Order, OrderMeasurement, ExceptionReview]) await (m as any).deleteMany({ accountId: idC });
            await User.deleteMany({ _id: idC });
        });

        it('PATCH and replay ask for the symbol when an order id exists on two (409), and work once it is sent', async () => {
            const h = { Authorization: `Bearer ${tokenC}` };
            expect((await request(app).patch('/api/audit/exceptions/dup').set(h).send({ state: 'reviewed' })).status).toBe(409);
            expect((await request(app).get('/api/audit/orders/dup/replay').set(h)).status).toBe(409);
            expect((await request(app).patch('/api/audit/exceptions/dup?symbol=ETHUSDT').set(h).send({ state: 'reviewed' })).status).toBe(200);
            const r = await request(app).get('/api/audit/orders/dup/replay?symbol=ETHUSDT').set(h);
            expect(r.status).toBe(200);
            expect(r.body.decomposition.find((d: any) => d.key === 'total').bps).toBe(4);       // ETHUSDT's own dup (BTCUSDT's is 3)
        });

        it('a malformed or repeated symbol is a 400, never a query', async () => {
            const h = { Authorization: `Bearer ${tokenC}` };
            expect((await request(app).get('/api/audit/orders/dup/replay?symbol=btc%20usdt').set(h)).status).toBe(400);
            expect((await request(app).get('/api/audit/orders/dup/replay?symbol=BTCUSDT&symbol=ETHUSDT').set(h)).status).toBe(400);
            expect((await request(app).patch('/api/audit/exceptions/dup?symbol=%7B%22%24ne%22%3Anull%7D').set(h).send({ state: 'open' })).status).toBe(400);
        });

        it('with fills on two venues the comparison ranks them in the matched bucket; account A still sees one venue', async () => {
            const res = await request(app).get('/api/audit/venue-comparison').set({ Authorization: `Bearer ${tokenC}` });
            expect(res.body.available).toBe(true);
            expect(res.body.buckets).toHaveLength(1);
            expect(res.body.buckets[0].venues.map((v: any) => [v.key, v.rank, v.median])).toEqual([['binance', 1, 1], ['bybit', 2, 3]]);
            const a = await request(app).get('/api/audit/venue-comparison').set(headers(tokenA));
            expect(a.body.available).toBe(false);                                                // C's bybit fills never reach A
        });
    });

    it('the venue comparison says there is nothing to compare when all fills are on one venue', async () => {
        const res = await request(app).get('/api/audit/venue-comparison').set(headers(tokenA));
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ available: false, buckets: [] });
        expect(res.body.note).toMatch(/one venue only/);
    });
});

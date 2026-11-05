/**
 * F-01 end-to-end: a real (non-demo) user goes register → connect → sync → run audit, and every
 * reader (analytics, coach, attribution, PDF report, CSV export) returns non-empty real-user data.
 *
 * Only the outside world is mocked: the exchange key validator, the Binance account client
 * (a fixed set of three fills) and the Binance public kline endpoint (axios). Everything else —
 * routes, ingestion, enrichment, scoring, Mongo writes — is the real code against mongodb-memory-server.
 *
 * ── Hand-computed fixture ────────────────────────────────────────────────────────────────────
 * Every BTCUSDT kline the mock serves: open 50000, high 50010, low 49990, close 50005, vol 10.
 *   arrivalPriceProxy = open = 50000
 *   spreadBps = (high-low)/mid × 10000 × 0.15 = (20/50000) × 10000 × 0.15 = 4 × 0.15 = 0.6  → exchangeScore 100 (≤ 1.5)
 * Weights: slippage .35, fee .25, timing .25, exchange .15.
 *
 * T1  BUY taker 0.1 @ 50010 at 10:00:30 UTC (quoteQty 5001)
 *     arrivalSlippageBps = (50010-50000)/50000 × 10000 = +2      → slippageScore 100 (< 5 bps)
 *     feeScore 0 (taker) · timing 10h ∈ [7,16) → 95 (HIGH)
 *     fillScore = 100×.35 + 0×.25 + 95×.25 + 100×.15 = 35 + 0 + 23.75 + 15 = 73.75 → C
 * T2  SELL maker 0.2 @ 49995 at 03:00:30 UTC (quoteQty 9999)
 *     arrivalSlippageBps = (50000-49995)/50000 × 10000 = +1      → slippageScore 100
 *     feeScore 100 (maker) · timing 3h → 20 (LOW)
 *     fillScore = 35 + 25 + 5 + 15 = 80 → B
 * T3  BUY taker 0.05 @ 50000 at 17:00:30 UTC (quoteQty 2500)
 *     arrivalSlippageBps = 0                                     → slippageScore 100
 *     feeScore 0 · timing 17h ∈ [16,22) → 70 (MEDIUM)
 *     fillScore = 35 + 0 + 17.5 + 15 = 67.5 → C
 * Fees (F-10, feeUsd at ingest; BNBUSDT 1m close served by the mock = 600):
 *   T1 5.001 USDT (quote)  → 5.001            feeDragBps = 5.001/5001 × 1e4 = 10
 *   T2 0.00002 BTC (base)  → 0.00002 × 49995 = 0.9999   feeDragBps = 0.9999/9999 × 1e4 = 1
 *   T3 0.004 BNB (third)   → 0.004 × 600     = 2.4      feeDragBps = 2.4/2500 × 1e4 = 9.6
 *   attribution feeCost = round2(5.001 + 0.9999 + 2.4 = 8.4009) = 8.4
 *   audit avgFeeDragBps = Σfee/Σnotional × 1e4 = 8.4009/17500 × 1e4 = 4.800514285714286
 * Audit avgFillScore (notional-weighted) = (73.75×5001 + 80×9999 + 67.5×2500) / 17500
 *                                        = (368823.75 + 799920 + 168750) / 17500 = 1337493.75 / 17500
 *                                        = 76.42821428571428… → B
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

vi.mock('../services/keyValidation', () => ({
    validateBinanceKey: vi.fn().mockResolvedValue(undefined),
    validateBybitKey: vi.fn().mockResolvedValue(undefined),
    validateOKXKey: vi.fn().mockResolvedValue(undefined),
}));

const DAY_MS = 24 * 60 * 60 * 1000;
const base = new Date(Date.now() - 2 * DAY_MS);
const at = (h: number) => Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, 0, 30);

const FILLS = [
    { id: 1001, orderId: 9001, symbol: 'BTCUSDT', price: '50010', qty: '0.1', quoteQty: '5001', commission: '5.001', commissionAsset: 'USDT', time: at(10), isBuyer: true, isMaker: false, isBestMatch: true },
    { id: 1002, orderId: 9002, symbol: 'BTCUSDT', price: '49995', qty: '0.2', quoteQty: '9999', commission: '0.00002', commissionAsset: 'BTC', time: at(3), isBuyer: false, isMaker: true, isBestMatch: true },
    { id: 1003, orderId: 9003, symbol: 'BTCUSDT', price: '50000', qty: '0.05', quoteQty: '2500', commission: '0.004', commissionAsset: 'BNB', time: at(17), isBuyer: true, isMaker: false, isBestMatch: true },
];

// Binance history sync talks to the exchange through global fetch (mocked HTTP): one BTC balance -> BTCUSDT
const jsonRes = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
global.fetch = (async (url: string) => {
    const u = new URL(String(url));
    if (u.pathname === '/api/v3/exchangeInfo') return jsonRes({ symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true }] });
    if (u.pathname === '/api/v3/account') return jsonRes({ balances: [{ asset: 'BTC', free: '1', locked: '0' }] });
    if (u.pathname === '/api/v3/myTrades') return jsonRes(FILLS.filter(f => f.symbol === u.searchParams.get('symbol')));
    throw new Error('unexpected ' + u.pathname);
}) as any;

// Binance public klines: [openTime, open, high, low, close, volume, closeTime, ...]
vi.mock('axios', () => {
    const get = vi.fn(async (url: string) => {
        const symbol = /symbol=([A-Z]+)/.exec(url)?.[1];
        const start = Number(/startTime=(\d+)/.exec(url)?.[1] ?? 0);
        const t = Math.floor(start / 60000) * 60000;
        if (symbol === 'BTCUSDT') return { data: [[t, '50000', '50010', '49990', '50005', '10', t + 59999, '0', 1, '0', '0', '0']] };
        if (symbol === 'BNBUSDT') return { data: [[t, '599', '601', '598', '600', '5', t + 59999, '0', 1, '0', '0', '0']] };
        return { data: [] };
    });
    return { default: { get }, get };
});

import { createApp } from '../app';
import { Trade } from '../models/Trade';

const app = createApp();

describe('F-01 real-user path end to end', () => {
    let token: string;
    let userId: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);

        const reg = await request(app).post('/api/auth/register').send({ email: 'real@user.test', password: 'Password123!' });
        expect(reg.status).toBe(201);
        token = reg.body.accessToken;
        userId = reg.body.userId;

        const conn = await request(app).post('/api/onboarding/connect').set('Authorization', `Bearer ${token}`)
            .send({ exchange: 'binance', apiKey: 'k'.repeat(64), apiSecret: 's'.repeat(64) });
        expect(conn.status).toBe(200);

        const sync = await request(app).post('/api/onboarding/sync').set('Authorization', `Bearer ${token}`);
        expect(sync.status).toBe(200);
        expect(sync.body.tradesIngested).toBe(3);

        const run = await request(app).post('/api/audit/run').set('Authorization', `Bearer ${token}`);
        expect(run.status).toBe(200);
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });

    it('persists per-trade scores and metrics on the real-user trades', async () => {
        const trades = await Trade.find({ accountId: userId }).sort({ tradeId: 1 }).lean();
        expect(trades).toHaveLength(3);
        for (const t of trades) expect(t.dataSource).toBe('real-user');

        const [t1, t2, t3] = trades;
        expect(t1.fillScore).toBeCloseTo(73.75, 10);
        expect(t1.fillGrade).toBe('C');
        expect([t1.slippageScore, t1.feeScore, t1.timingScore, t1.exchangeScore]).toEqual([100, 0, 95, 100]);
        expect(t1.arrivalSlippageBps).toBeCloseTo(2, 10);
        expect(t1.liquidityWindow).toBe('HIGH');

        expect(t2.fillScore).toBeCloseTo(80, 10);
        expect(t2.fillGrade).toBe('B');
        expect([t2.slippageScore, t2.feeScore, t2.timingScore, t2.exchangeScore]).toEqual([100, 100, 20, 100]);
        expect(t2.arrivalSlippageBps).toBeCloseTo(1, 10);
        expect(t2.liquidityWindow).toBe('LOW');

        expect(t3.fillScore).toBeCloseTo(67.5, 10);
        expect(t3.fillGrade).toBe('C');
        expect(t3.arrivalSlippageBps).toBeCloseTo(0, 10);
        expect(t3.liquidityWindow).toBe('MEDIUM');
    });

    it('stores feeUsd at ingest and uses it for fee drag (F-10)', async () => {
        const [t1, t2, t3] = await Trade.find({ accountId: userId }).sort({ tradeId: 1 }).lean();
        expect([t1.fee, t1.feeAsset, t1.feeUsd]).toEqual([5.001, 'USDT', 5.001]);
        expect(t2.feeAsset).toBe('BTC');
        expect(t2.feeUsd).toBeCloseTo(0.9999, 12);
        expect(t3.feeAsset).toBe('BNB');
        expect(t3.feeUsd).toBeCloseTo(2.4, 12);
        expect(t1.feeDragBps).toBeCloseTo(10, 10);
        expect(t2.feeDragBps).toBeCloseTo(1, 10);
        expect(t3.feeDragBps).toBeCloseTo(9.6, 10);
    });

    it('audit summary is the notional-weighted score', async () => {
        const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.dataSource).toBe('real-user');
        expect(res.body.avgFillScore).toBeCloseTo(76.42821428571428, 9);
        expect(res.body.fillGrade).toBe('B');
        expect(res.body.breakdown.avgFeeDragBps).toBeCloseTo(4.800514285714286, 9);
    });

    it('analytics returns the three scored trades', async () => {
        const res = await request(app).get('/api/audit/analytics').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.totalTrades).toBe(3);
        expect(res.body.symbolBreakdown).toHaveLength(1);
        expect(res.body.symbolBreakdown[0].symbol).toBe('BTCUSDT');
        expect(res.body.symbolBreakdown[0].totalFees).toBeCloseTo(8.4009, 10);
    });

    it('attribution returns a non-empty breakdown', async () => {
        const res = await request(app).get('/api/attribution').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.tradeCount).toBe(3);
        expect(res.body.totalNotional).toBeCloseTo(17500, 6);
        expect(res.body.feeCost).toBe(8.4);
    });

    it('coach returns actions built from the scored trades', async () => {
        const res = await request(app).get('/api/audit/coach').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.actions)).toBe(true);
        expect(res.body.actions.length).toBeGreaterThan(0);
    });

    it('PDF report includes the scored trades', async () => {
        const res = await request(app).get('/api/audit/report').set('Authorization', `Bearer ${token}`)
            .buffer(true).parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect((res.body as Buffer).length).toBeGreaterThan(1000);
    });

    it('the audit run backfills feeUsd for a trade ingested without one (e.g. a kline outage at ingest)', async () => {
        // 0.001 BNB fee, BNBUSDT close 600 → feeUsd = 0.001 × 600 = 0.6 ; feeDragBps = 0.6 / 5000 × 1e4 = 1.2
        await Trade.create({
            userId, accountId: userId, dataSource: 'real-user', exchange: 'binance', symbol: 'BTCUSDT', tradeId: '1004', orderId: '9004',
            side: 'BUY', orderType: 'MARKET', isMaker: false, executionPrice: 50000, quantity: 0.1, notional: 5000,
            fee: 0.001, feeAsset: 'BNB', executedAt: new Date(at(11)),
        });
        const run = await request(app).post('/api/audit/run').set('Authorization', `Bearer ${token}`);
        expect(run.status).toBe(200);
        const t4 = await Trade.findOne({ accountId: userId, tradeId: '1004' }).lean();
        expect(t4!.feeUsd).toBeCloseTo(0.6, 12);
        expect(t4!.feeDragBps).toBeCloseTo(1.2, 10);
        await Trade.deleteOne({ accountId: userId, tradeId: '1004' });
        await request(app).post('/api/audit/run').set('Authorization', `Bearer ${token}`);
    });

    it('CSV export lists every trade with its score and grade', async () => {
        const res = await request(app).get('/api/audit/trades/export').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        const rows = res.text.trim().split('\n').slice(1);
        expect(rows).toHaveLength(3);
        const byId = Object.fromEntries(rows.map(r => [r.split(',')[0], r.split(',')]));
        expect(byId['1001'][11]).toBe('73.75');
        expect(byId['1001'][12]).toBe('C');
        expect(byId['1002'][12]).toBe('B');
        // Fee (USD) column (index 9) carries feeUsd, not the native BNB amount
        expect(Number(byId['1003'][9])).toBeCloseTo(2.4, 12);
        expect(Number(byId['1002'][9])).toBeCloseTo(0.9999, 12);
    });
});

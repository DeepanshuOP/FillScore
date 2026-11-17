import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { PDFParse } from 'pdf-parse';
import { createApp } from '../app';
import { ReportService } from '../services/ReportService';
import { buildMeasuredReport } from '../services/reportMeasured';
import { summariseOrders } from '../services/orderSummary';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';
import { Order } from '../models/Order';
import { OrderMeasurement } from '../models/OrderMeasurement';
import { loadEnv } from '../config/env';

// 2026-11-17 architect order: for a rebuilt demo the PDF's component rows came from the v1 audit of the deleted trades.
// They are built from current data now: the v2.3.0 components and the shortfall totals. The v1 grade stays, labelled.
//
// Hand-computed fixture (two filled orders, intended notional 10,000 and 20,000 USD, so 30,000 together):
//   term          order 1  order 2   USD = bps x notional / 10,000                bps of 30,000
//   execution        2        4      2*1 + 4*2 = 2 + 8   = 10.00                  10/30000*1e4 = 3.33 -> "3.3 bps"
//   spread           1       1.5     1*1 + 1.5*2 = 1 + 3 =  4.00                  1.33 -> "1.3 bps"
//   impactTiming     1       2.5     1*1 + 2.5*2 = 1 + 5 =  6.00                  2.00 -> "2.0 bps"
//   opportunity     0.5       1      0.5*1 + 1*2 = 0.5 + 2 = 2.50                 0.83 -> "0.83 bps"
//   fees            7.5      7.5     7.5*1 + 7.5*2 = 22.50                        7.50 -> "7.5 bps"
//   total (e+o+f)   10      12.5     10*1 + 12.5*2 = 35.00                        11.67 -> "11.7 bps"
// Resting times 1000 and 3000 ms: median 2000 ms; p90 = 1000 + 0.9*(3000-1000) = 2800 ms.
const SF = (n: number, e: number, s: number, i: number, o: number, f: number, t: number) =>
    ({ intendedNotional: n, executionBps: e, spreadBps: s, impactTimingBps: i, opportunityBps: o, feesBps: f, totalBps: t });
const ORDERS = [
    { orderId: '1', exchange: 'binance', symbol: 'BTCUSDT', type: 'LIMIT', origQty: 1, executedQty: 1, status: 'FILLED', restingMs: 1000 },
    { orderId: '2', exchange: 'binance', symbol: 'BTCUSDT', type: 'LIMIT', origQty: 1, executedQty: 1, status: 'FILLED', restingMs: 3000 },
];
const MEAS = [
    { orderId: '1', exchange: 'binance', symbol: 'BTCUSDT', shortfall: SF(10000, 2, 1, 1, 0.5, 7.5, 10) },
    { orderId: '2', exchange: 'binance', symbol: 'BTCUSDT', shortfall: SF(20000, 4, 1.5, 2.5, 1, 7.5, 12.5) },
];
const V2 = {
    scoringVersion: 'v2.3.0',
    result: {
        grade: 'A', composite: 93.40556873724222, band: [92.5442687785745, 94.10902429587611],
        components: { execution: { score: 83.67975649398413, measured: 607, unmeasured: 0, reason: null },
                      fees: { score: 100.00000000000016, measured: 607, unmeasured: 0, reason: null },
                      unfilled: { score: 96.53694971774237, measured: 245, unmeasured: 0, reason: null } },
        timing: { scored: false, fills: 607, message: 'No material difference between hours.' }, fills: 607, orders: 245,
    },
};
const V1_AUDIT = { fillGrade: 'C', avgFillScore: 60.67469266790485, breakdown: { avgSlippageBps: 9, makerRatio: 0.2, avgFeeDragBps: 12,
    bestHour: 11, worstHour: 3, bestSymbol: 'OLDSYM', worstSymbol: 'OLDSYM2' }, recommendations: ['Old v1 line about earlier trades. Detail.'],
    totalTrades: 313, totalNotional: 99999 };

async function text(audit: any, attribution: any = null, worst: any[] = []): Promise<string> {
    const doc = ReportService.generateReport(audit, attribution, worst, undefined as any);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    await new Promise<void>(r => { doc.on('end', () => r()); });
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const out = (await parser.getText()).text;
    await parser.destroy();
    return out;
}
const measured = (over: any = {}) => buildMeasuredReport({ v2: V2, orders: summariseOrders(ORDERS as any, MEAS as any), demo: true,
    v1: { grade: V1_AUDIT.fillGrade, score: V1_AUDIT.avgFillScore }, ...over });

describe('buildMeasuredReport (pure)', () => {
    it('carries the v2 grade, components, timing note and the hand-computed shortfall totals', () => {
        const m = measured();
        expect(m.v2).toMatchObject({ scoringVersion: 'v2.3.0', grade: 'A' });
        expect(m.components.map(c => [c.key, c.score])).toEqual([['execution', 83.67975649398413], ['fees', 100.00000000000016], ['unfilled', 96.53694971774237]]);
        expect(m.timingNote).toBe('Timing, not scored: No material difference between hours.');
        const t = m.shortfall!.totals!;
        expect(t.execution.usd).toBeCloseTo(10, 9); expect(t.execution.bps).toBeCloseTo(10 / 30000 * 1e4, 9);
        expect(t.spread.usd).toBeCloseTo(4, 9);
        expect(t.impactTiming.usd).toBeCloseTo(6, 9);
        expect(t.opportunity.usd).toBeCloseTo(2.5, 9);
        expect(t.fees.usd).toBeCloseTo(22.5, 9);
        expect(t.total.usd).toBeCloseTo(35, 9); expect(t.total.bps).toBeCloseTo(35 / 3, 9);
        expect(m.shortfall!.n).toBe(2);
        expect(m.restingMs).toEqual({ n: 2, medianMs: 2000, p90Ms: 2800 });
    });
    it('a demo marks fees not independently measured; the v1 grade is labelled as published', () => {
        const m = measured();
        expect(m.demo).toBe(true);
        expect(m.v1Published).toEqual({ grade: 'C', score: 60.67469266790485 });
    });
    it('without a v2 grade or without measurements, nothing is invented', () => {
        const m = buildMeasuredReport({ v2: null, orders: null, demo: false, v1: { grade: 'C', score: 60.67469266790485 } });
        expect(m.v2).toBeNull(); expect(m.components).toEqual([]); expect(m.shortfall).toBeNull(); expect(m.restingMs).toBeNull();
    });
});

describe('PDF of a rebuilt demo', () => {
    it('component rows, cost breakdown and key figures come from the measured data, not the v1 audit', async () => {
        const t = await text({ ...V1_AUDIT, current: { fills: 607, orders: 245, notionalUsd: 123456.7, makerRatio: 0.66 }, measured: measured() });
        expect(t).toMatch(/COMPONENT SCORES.*v2\.3\.0/s);
        expect(t).toMatch(/EXECUTION COST\s+33%\s+84/);
        expect(t).toMatch(/FEES\s+33%\s+100/);
        expect(t).toMatch(/UNFILLED ORDERS\s+33%\s+97/);
        expect(t).toContain('not independently measured');
        expect(t).toContain('Timing, not scored: No material difference between hours.');
        // cost breakdown: USD and bps of intended notional, per term, with the order count
        expect(t).toMatch(/Execution\s*:\s*\$10\.00\s*\(3\.3 bps\)/);
        expect(t).toMatch(/Spread\s*:\s*\$4\.00\s*\(1\.3 bps\)/);
        expect(t).toMatch(/Impact and timing\s*:\s*\$6\.00\s*\(2\.0 bps\)/);
        expect(t).toMatch(/Unfilled orders\s*:\s*\$2\.50\s*\(0\.83 bps\)/);
        expect(t).toMatch(/Fees\s*:\s*\$22\.50\s*\(7\.5 bps\)/);
        expect(t).toMatch(/TOTAL\s*:\s*\$35\.00\s*\(11\.7 bps\)/);
        expect(t).toContain('2 orders');
        // nothing from the v1 audit of the deleted trades
        for (const old of ['SLIPPAGE', 'Slippage cost', 'OLDSYM', 'Best Hour', 'Worst Hour', 'Best Symbol', 'Old v1 line']) expect(t).not.toContain(old);
        expect(t).not.toContain('Trades Analysed');
    }, 30000);

    it('the cover labels the v1 grade as published and shows the v2 grade beside it', async () => {
        const t = await text({ ...V1_AUDIT, current: { fills: 607, orders: 245, notionalUsd: 1, makerRatio: 0.1 }, measured: measured() });
        expect(t).toMatch(/Published grade of the earlier demo data \(scoring v1\), kept unchanged/);
        expect(t).toMatch(/Scoring v2\.3\.0 \(measured, current data\)\s*:\s*A\s+93\.4/);
    }, 30000);

    it('order outcomes replace the stored v1 recommendation lines', async () => {
        const t = await text({ ...V1_AUDIT, current: { fills: 607, orders: 245, notionalUsd: 1, makerRatio: 0.1 }, measured: measured() });
        expect(t).toContain('ORDER OUTCOMES');
        expect(t).toMatch(/2 orders: 2 filled, 0 partly filled, 0 unfilled, 0 open/);
        expect(t).toMatch(/Limit orders rested a median of 2\.0 s \(90th percentile 2\.8 s\)/);
    }, 30000);

    it('shortfall totals that cannot be computed read "insufficient data", never $0.00', async () => {
        const m = measured({ orders: summariseOrders(ORDERS as any, MEAS.map(x => ({ ...x, shortfall: { ...x.shortfall, intendedNotional: undefined } })) as any) });
        const t = await text({ ...V1_AUDIT, current: { fills: 607, orders: 245, notionalUsd: 1, makerRatio: 0.1 }, measured: m });
        expect(t).toMatch(/insufficient data/i);
        expect(t).not.toMatch(/\$0\.00/);
    }, 30000);

    it('an account without the measured block prints the v1 rows exactly as before', async () => {
        const t = await text({ ...V1_AUDIT });
        expect(t).toContain('SLIPPAGE');
        expect(t).not.toContain('v2.3.0');
    }, 30000);
});

describe('GET /api/audit/report for a rebuilt demo', () => {
    loadEnv();
    const app = createApp();
    const A = 'demo-moderate';
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        for (const m of [Trade, Order, OrderMeasurement]) await (m as any).deleteMany({ accountId: A });
        await Audit.collection.deleteMany({ accountId: A });
        await Trade.collection.insertMany([1, 2].map(i => ({ accountId: A, userId: A, dataSource: 'synthetic-demo', exchange: 'binance', symbol: 'BTCUSDT',
            tradeId: `m${i}`, orderId: String(i), side: 'BUY', orderType: 'LIMIT', isMaker: true, quantity: 0.01, executionPrice: 42000, notional: 420,
            fee: 0.42, feeUsd: 0.42, feeAsset: 'USDT', executedAt: new Date('2024-01-15T14:00:00.500Z') })) as any);
        await Audit.collection.insertOne({ accountId: A, dataSource: 'synthetic-demo', createdAt: new Date('2026-11-01'), ...V1_AUDIT } as any);
        await Order.collection.insertMany(ORDERS.map(o => ({ ...o, accountId: A, side: 'BUY', createdAt: new Date(), updatedAt: new Date(), dataSource: 'synthetic-demo' })) as any);
        await OrderMeasurement.collection.insertMany(MEAS.map(m => ({ ...m, accountId: A, version: '1.0.0', side: 1, arrivalMs: 1, unmeasuredReason: null, measuredAt: new Date() })) as any);
    });
    afterAll(async () => {
        for (const m of [Trade, Order, OrderMeasurement]) await (m as any).deleteMany({ accountId: A });
        await Audit.collection.deleteMany({ accountId: A });
    });

    it('serves a PDF whose rows are the measured components and whose cover labels the v1 grade', async () => {
        const res = await request(app).get(`/api/audit/report?userId=${A}`).buffer(true).parse((r, cb) => {
            const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c)));
        });
        expect(res.status).toBe(200);
        const parser = new PDFParse({ data: new Uint8Array(res.body as Buffer) });
        const t = (await parser.getText()).text;
        await parser.destroy();
        expect(t).toMatch(/EXECUTION COST\s+33%/);
        expect(t).toMatch(/Published grade of the earlier demo data/);
        expect(t).toMatch(/TOTAL\s*:\s*\$35\.00/);
        expect(t).not.toContain('OLDSYM');
    }, 60000);
});

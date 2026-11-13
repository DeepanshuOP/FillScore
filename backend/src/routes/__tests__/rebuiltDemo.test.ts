import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { Order } from '../../models/Order';
import { OrderMeasurement } from '../../models/OrderMeasurement';
import { loadEnv } from '../../config/env';

// M2 closing task (decision 11, option A): a rebuilt demo's trades carry no per-trade v1 fields (fillScore,
// arrivalSlippageBps, ...). Every v1-only view then says "not computed for this data": never 0, never blank-as-zero.
// The measured views (orders, resting time, shortfall, unfilled) take their place.
loadEnv();
const app = createApp();
const REBUILT = 'demo-aggressive';     // trades below have NO v1 fields
const ENRICHED = 'demo-moderate';      // control: a trade with v1 fields keeps today's behaviour

const base = { exchange: 'binance', symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET', isMaker: false, dataSource: 'synthetic-demo',
    quantity: 0.01, executionPrice: 42000, notional: 420, fee: 0.42, feeAsset: 'USDT', feeUsd: 0.42 };
const t = (accountId: string, tradeId: string, extra = {}) => ({ ...base, accountId, userId: accountId, tradeId, orderId: `o-${tradeId}`,
    executedAt: new Date('2024-01-15T14:00:00.500Z'), ...extra });
const ord = (id: string, type: string, origQty: number, executedQty: number, status: string, restingMs: number | null) =>
    ({ accountId: REBUILT, exchange: 'binance', symbol: 'BTCUSDT', orderId: id, side: 'BUY', type, origQty, executedQty, status,
       restingMs, createdAt: new Date('2024-01-15T14:00:00Z'), updatedAt: new Date('2024-01-15T14:00:05Z'), dataSource: 'synthetic-demo' });
const meas = (id: string, shortfall: Record<string, number | null> | null, reason: string | null = null) =>
    ({ accountId: REBUILT, exchange: 'binance', symbol: 'BTCUSDT', orderId: id, version: '1.0.0', side: 1, arrivalMs: 1, shortfall,
       unmeasuredReason: reason, measuredAt: new Date('2024-03-01') });

describe('rebuilt demo (no per-trade v1 fields)', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        for (const m of [Trade, Order, OrderMeasurement]) await (m as any).deleteMany({ accountId: { $in: [REBUILT, ENRICHED] } });
        await Trade.collection.insertMany([t(REBUILT, 'r1'), t(REBUILT, 'r2'), t(REBUILT, 'r3'),
            t(ENRICHED, 'e1', { fillScore: 80, fillGrade: 'B', arrivalSlippageBps: 4.2, arrivalPriceProxy: 41998, spreadBps: 1.1 }),
            t(ENRICHED, 'e2', { fillScore: 70, fillGrade: 'C', arrivalSlippageBps: 0, arrivalPriceProxy: 42000, spreadBps: 1.1 })] as any);
        // The frozen v1 audit (the published grade of the earlier demo data) stays beside the rebuilt trades.
        await Audit.collection.deleteMany({ accountId: REBUILT });
        await Audit.collection.insertOne({ accountId: REBUILT, dataSource: 'synthetic-demo', createdAt: new Date('2026-11-01'),
            avgFillScore: 60.67469266790485, fillGrade: 'C', breakdown: { makerRatio: 0.2 }, recommendations: [] } as any);
        await Order.collection.insertMany([
            ord('1', 'LIMIT', 1, 1, 'FILLED', 1000), ord('2', 'LIMIT', 2, 2, 'FILLED', 3000), ord('3', 'MARKET', 1, 1, 'FILLED', null),
            ord('4', 'LIMIT', 1, 0, 'CANCELED', null), ord('5', 'LIMIT', 1, 0.5, 'CANCELED', 5000)] as any);
        await OrderMeasurement.collection.insertMany([
            meas('1', { executionBps: 2, spreadBps: 1, impactTimingBps: 1, opportunityBps: 0, totalBps: 2.5 }),
            meas('2', { executionBps: 4, spreadBps: 1, impactTimingBps: 3, opportunityBps: 0, totalBps: 4.5 }),
            meas('4', { executionBps: 0, spreadBps: null, impactTimingBps: null, opportunityBps: 7, totalBps: 7 }),
            meas('5', null, 'no_quote_at_arrival')] as any);
    });
    afterAll(async () => {
        for (const m of [Trade, Order, OrderMeasurement]) await (m as any).deleteMany({ accountId: { $in: [REBUILT, ENRICHED] } });
        await Audit.collection.deleteMany({ accountId: REBUILT });
    });

    it('/score: the frozen v1 audit is served unchanged, flagged as having no per-trade v1 fields', async () => {
        const res = await request(app).get(`/api/audit/score?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        expect(res.body.avgFillScore).toBe(60.67469266790485);
        expect(res.body.fillGrade).toBe('C');
        expect(res.body.v1Computed).toBe(false);
        expect(res.body.breakdown.componentMeans).toBeNull();      // not 0: the dashboard shows "not computed"
    });

    it('/trades: slippage is null (not 0) and the response says v1 is not computed', async () => {
        const res = await request(app).get(`/api/audit/trades?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        expect(res.body.v1Computed).toBe(false);
        expect(res.body.trades).toHaveLength(3);
        for (const row of res.body.trades) expect(row.slippageBps).toBeNull();
    });

    it('/trades: a v1-enriched account keeps its slippage, including a stored 0', async () => {
        const res = await request(app).get(`/api/audit/trades?userId=${ENRICHED}`);
        expect(res.body.v1Computed).toBe(true);
        const bySlip = Object.fromEntries(res.body.trades.map((r: any) => [r.tradeId, r.slippageBps]));
        expect(bySlip).toEqual({ e1: 4.2, e2: 0 });
    });

    it('/trades/export: the slippage cell is empty, not 0', async () => {
        const res = await request(app).get(`/api/audit/trades/export?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        const rows = res.text.trim().split('\n').slice(1);
        expect(rows).toHaveLength(3);
        for (const r of rows) expect(r.split(',')[10]).toBe('');          // column "Slippage (bps)"
        const enriched = (await request(app).get(`/api/audit/trades/export?userId=${ENRICHED}`)).text.trim().split('\n').slice(1);
        expect(enriched.map(r => r.split(',')[10]).sort()).toEqual(['0', '4.2']);
    });

    it('/analytics: 200 with notComputed, not a 404 and not a grid of zeros', async () => {
        const res = await request(app).get(`/api/audit/analytics?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ notComputed: true, reason: 'not_computed_for_this_data', totalTrades: 3 });
    });

    it('/analytics/exchange-comparison: notComputed, no venue spread of 0', async () => {
        const res = await request(app).get(`/api/audit/analytics/exchange-comparison?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        expect(res.body.notComputed).toBe(true);
        expect(res.body.exchanges).toEqual([]);
        expect(res.body.venueAlphaBps).toBeNull();
    });

    it('/coach: notComputed when the account has trades but no v1 fields', async () => {
        const res = await request(app).get(`/api/audit/coach?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        expect(res.body.notComputed).toBe(true);
        expect(res.body.actions).toEqual([]);
    });

    it('/analytics/whale-correlation: not available for data that was never whale-enriched', async () => {
        const res = await request(app).get(`/api/audit/analytics/whale-correlation?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(false);
        expect(res.body.reason).toBe('not_computed_for_this_data');
    });

    it('/orders-summary: outcomes, resting time, shortfall medians and unfilled opportunity', async () => {
        const res = await request(app).get(`/api/audit/orders-summary?userId=${REBUILT}`);
        expect(res.status).toBe(200);
        expect(res.body.orders).toEqual({ total: 5, filled: 3, partial: 1, unfilled: 1, open: 0 });
        expect(res.body.restingMs).toEqual({ n: 3, medianMs: 3000, p90Ms: 4600 });
        // measured: orders 1, 2, 4 (order 5 is unmeasured and counted). execution [2, 4, 0] -> 2; spread [1, 1] -> 1;
        // impact [1, 3] -> 2; opportunity [0, 0, 7] -> 0; total [2.5, 4.5, 7] -> 4.5
        expect(res.body.shortfall).toEqual({ n: 3, unmeasured: 1,
            medianBps: { execution: 2, spread: 1, impactTiming: 2, opportunity: 0, total: 4.5 } });
        expect(res.body.unfilled).toEqual({ n: 1, medianOpportunityBps: 7 });
    });

    it('/orders-summary: an account with no orders gets available false, never zeros', async () => {
        const res = await request(app).get(`/api/audit/orders-summary?userId=${ENRICHED}`);
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(false);
    });

    it('a REAL account with trades not yet enriched keeps its earlier answers and is never called "not computed"', async () => {
        const { User } = await import('../../models/User');
        const { issueTokenPair } = await import('../../services/authService');
        const u = await User.create({ email: 'rebuilt-real@example.com', emailVerified: true });
        const id = u._id.toString();
        const token = (await issueTokenPair(id)).accessToken;
        try {
            await Trade.collection.insertOne({ ...t(id, 'real1'), dataSource: 'real-user' } as any);
            const auth = { Authorization: `Bearer ${token}` };
            expect((await request(app).get('/api/audit/analytics').set(auth)).status).toBe(404);
            const trades = await request(app).get('/api/audit/trades').set(auth);
            expect(trades.body.v1Computed).toBe(true);
            const coach = await request(app).get('/api/audit/coach').set(auth);
            expect(JSON.stringify(coach.body)).not.toContain('notComputed');
            const venue = await request(app).get('/api/audit/analytics/exchange-comparison').set(auth);
            expect(JSON.stringify(venue.body)).not.toContain('notComputed');
        } finally {
            await Trade.deleteMany({ accountId: id });
            await User.deleteMany({ email: 'rebuilt-real@example.com' });
        }
    });

    it('/orders-summary needs an identity like every audit route', async () => {
        expect((await request(app).get('/api/audit/orders-summary')).status).toBe(401);
    });
});

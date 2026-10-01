import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';

const app = createApp();

const trade = (tradeId: string, hourUtc: number, fillScore: number, notional: number) => ({
    userId: 'demo-disciplined', accountId: 'demo-disciplined', dataSource: 'synthetic-demo',
    exchange: 'binance', tradeId, orderId: `o-${tradeId}`, symbol: 'BTCUSDT', side: 'BUY',
    orderType: 'MARKET', isMaker: false, quantity: 1, executionPrice: 50000, notional,
    fee: 5, feeAsset: 'USDT', executedAt: new Date(Date.UTC(2026, 8, 10, hourUtc, 15)),
    arrivalPriceProxy: 50000, vwap5min: 50000, spreadBps: 1, fillScore, fillGrade: 'B',
});

describe('GET /api/audit/coach', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        await Audit.create({
            userId: 'demo-disciplined', accountId: 'demo-disciplined', dataSource: 'synthetic-demo',
            period: { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-30T00:00:00Z') },
            exchange: 'binance', totalTrades: 4, totalNotional: 40000, avgFillScore: 70, fillGrade: 'C',
            estimatedLossUSD: 10,
            breakdown: { avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0.1, bestHour: 10, worstHour: 3, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' },
        });
        await Trade.create([
            trade('c1', 10, 92, 10000), trade('c2', 10, 88, 10000),
            trade('c3', 3, 40, 10000), trade('c4', 3, 44, 10000),
        ]);
    });

    afterAll(async () => {
        await Trade.deleteMany({});
        await Audit.deleteMany({});
    });

    it('backs the best and worst window text with the measured average and trade count', async () => {
        const res = await request(app).get('/api/audit/coach?userId=demo-disciplined');
        expect(res.status).toBe(200);
        expect(res.body.bestWindow).toEqual({ hour: '10:00 UTC', reason: 'avg score 90 across 2 trades' });
        expect(res.body.worstWindow).toEqual({ hour: '03:00 UTC', reason: 'avg score 42 across 2 trades' });
    });

    it('states the audited period instead of claiming a monthly figure', async () => {
        const res = await request(app).get('/api/audit/coach?userId=demo-disciplined');
        const timing = res.body.actions.find((a: any) => a.category === 'TIMING');
        expect(timing.estimatedImpact).toMatch(/^~\$\d+ over 29 days \(modelled\)$/);
        expect(JSON.stringify(res.body)).not.toMatch(/\/month/);
    });

    it('contains none of the old unsourced market claims', async () => {
        const res = await request(app).get('/api/audit/coach?userId=demo-disciplined');
        const text = JSON.stringify(res.body).toLowerCase();
        expect(text).not.toContain('2-4x');
        expect(text).not.toContain('deepest liquidity');
        expect(text).not.toContain('tightest spreads');
    });
});

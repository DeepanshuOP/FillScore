import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';

const app = createApp();

describe('audit route input validation', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        await Trade.create({
            userId: 'demo-disciplined', accountId: 'demo-disciplined', dataSource: 'synthetic-demo',
            exchange: 'binance', tradeId: 'v1', orderId: 'o1', symbol: 'BTCUSDT', side: 'BUY',
            orderType: 'MARKET', isMaker: false, quantity: 1, executionPrice: 50000, notional: 50000,
            fee: 10, feeAsset: 'USDT', executedAt: new Date(),
        });
    });

    afterAll(async () => {
        await Trade.deleteMany({});
    });

    it.each(['-1', '999999', '0', 'abc'])('POST /run rejects daysBack=%s with 400', async (v) => {
        const res = await request(app).post(`/api/audit/run?userId=demo-disciplined&daysBack=${v}`);
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_request');
        expect(JSON.stringify(res.body.details)).toContain('daysBack');
    });

    it('GET /trades rejects an oversized limit', async () => {
        const res = await request(app).get('/api/audit/trades?userId=demo-disciplined&limit=10001');
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('invalid_request');
    });

    it('GET /trades rejects a non-numeric page instead of returning NaN pagination', async () => {
        const res = await request(app).get('/api/audit/trades?userId=demo-disciplined&page=abc');
        expect(res.status).toBe(400);
    });

    it('GET /trades still serves the 1000-row stats fetch', async () => {
        const res = await request(app).get('/api/audit/trades?userId=demo-disciplined&limit=1000');
        expect(res.status).toBe(200);
        expect(res.body.trades).toHaveLength(1);
        expect(res.body.page).toBe(1);
    });

    it('GET /trades/export rejects a regex in the exchange filter', async () => {
        const res = await request(app).get('/api/audit/trades/export?userId=demo-disciplined&exchange=.*');
        expect(res.status).toBe(400);
    });

    it('GET /trades/export matches the exchange exactly, case-insensitively', async () => {
        const hit = await request(app).get('/api/audit/trades/export?userId=demo-disciplined&exchange=BINANCE');
        expect(hit.status).toBe(200);
        expect(hit.text).toContain('v1');
        const miss = await request(app).get('/api/audit/trades/export?userId=demo-disciplined&exchange=okx');
        expect(miss.status).toBe(200);
        expect(miss.text).toContain('No trades found');
    });

    it('PATCH /trades/:id/note rejects a non-string note', async () => {
        const res = await request(app)
            .patch('/api/audit/trades/v1/note?userId=demo-disciplined')
            .send({ note: { $ne: 1 } });
        expect(res.status).toBe(400);
    });
});

describe('GET /api/audit/history', () => {
    it('returns an empty list rather than an error when an account has no history', async () => {
        const res = await request(app).get('/api/audit/history?userId=demo-okx');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ points: [] });
    });

    it.each(['0', '1000', 'abc'])('rejects limit=%s', async (v) => {
        const res = await request(app).get(`/api/audit/history?userId=demo-okx&limit=${v}`);
        expect(res.status).toBe(400);
    });

    it('refuses an unauthenticated real-account request', async () => {
        const res = await request(app).get('/api/audit/history');
        expect(res.status).toBe(401);
    });
});

/**
 * F-08: demo accounts are read-only. Anonymous callers could rewrite the locked demo Audit with
 * POST /audit/run?userId=demo-* and write notes onto demo trades. Every mutating request that
 * resolves to a demo account now answers 403 and leaves the data untouched; reads still work.
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';

const app = createApp();
const LOCKED_SCORE = 95.88542572161496;

describe('F-08 demo accounts are read-only', () => {
    let realToken: string;
    let realId: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const base = {
            exchange: 'binance', orderId: 'o', symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET', isMaker: false,
            quantity: 1, executionPrice: 50000, notional: 50000, fee: 10, feeAsset: 'USDT', executedAt: new Date(),
        };
        await Trade.create({ ...base, userId: 'demo-disciplined', accountId: 'demo-disciplined', dataSource: 'synthetic-demo', tradeId: 'd1', note: 'seeded' });
        await Audit.create({
            userId: 'demo-disciplined', accountId: 'demo-disciplined', dataSource: 'synthetic-demo',
            period: { start: new Date(), end: new Date() }, exchange: 'binance', totalTrades: 1, totalNotional: 50000,
            avgFillScore: LOCKED_SCORE, fillGrade: 'A', estimatedLossUSD: 0,
            breakdown: { avgSlippageBps: 0, avgFeeDragBps: 0, makerRatio: 0, bestHour: 10, worstHour: 3, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' },
        });
        const user = await User.create({ email: 'ro@example.com', emailVerified: true });
        realId = user._id.toString();
        realToken = (await issueTokenPair(realId)).accessToken;
        await Trade.create({ ...base, userId: realId, accountId: realId, dataSource: 'real-user', tradeId: 'r1' });
    });

    afterAll(async () => {
        await mongoose.connection.dropDatabase();
        await mongoose.disconnect();
    });

    it.each(['demo-disciplined', 'demo-moderate', 'demo-aggressive'])(
        'POST /api/audit/run?userId=%s answers 403', async (id) => {
            const res = await request(app).post(`/api/audit/run?userId=${id}`);
            expect(res.status).toBe(403);
            expect(res.body.error).toBe('demo_read_only');
        });

    // 4R-0b: the rolling demos are hidden; a write attempt is refused with 404 before it can reach the audit run.
    it.each(['demo-bybit', 'demo-okx', 'demo-multi'])(
        'POST /api/audit/run?userId=%s answers 404 demo_unavailable', async (id) => {
            const res = await request(app).post(`/api/audit/run?userId=${id}`);
            expect(res.status).toBe(404);
            expect(res.body.error).toBe('demo_unavailable');
        });

    it.each(['demo-bybit', 'demo-okx', 'demo-multi'])(
        'GET /api/audit/share/%s answers 404 demo_unavailable', async (id) => {
            const res = await request(app).get(`/api/audit/share/${id}`);
            expect(res.status).toBe(404);
            expect(res.body.error).toBe('demo_unavailable');
        });

    it('the locked demo audit is unchanged after a run attempt', async () => {
        await request(app).post('/api/audit/run?userId=demo-disciplined');
        const audit = await Audit.findOne({ accountId: 'demo-disciplined' }).lean();
        expect(audit!.avgFillScore).toBe(LOCKED_SCORE);
        expect(await Audit.countDocuments({ accountId: 'demo-disciplined' })).toBe(1);
    });

    it('a demo id passed in the body is refused too', async () => {
        const res = await request(app).post('/api/audit/run').send({ userId: 'demo-moderate' });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('demo_read_only');
    });

    it('PATCH a note on a demo trade answers 403 and leaves the note', async () => {
        const res = await request(app).patch('/api/audit/trades/d1/note?userId=demo-disciplined').send({ note: 'vandal' });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('demo_read_only');
        const t = await Trade.findOne({ accountId: 'demo-disciplined', tradeId: 'd1' }).lean();
        expect(t!.note).toBe('seeded');
    });

    it('demo reads still work', async () => {
        expect((await request(app).get('/api/audit?userId=demo-disciplined')).status).toBe(200);
        expect((await request(app).get('/api/audit/trades?userId=demo-disciplined')).status).toBe(200);
    });

    it('a signed-in user can still write notes on their own trades', async () => {
        const res = await request(app).patch('/api/audit/trades/r1/note')
            .set('Authorization', `Bearer ${realToken}`).send({ note: 'mine' });
        expect(res.status).toBe(200);
        const t = await Trade.findOne({ accountId: realId, tradeId: 'r1' }).lean();
        expect(t!.note).toBe('mine');
    });
});

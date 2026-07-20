import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import { authRouter } from '../auth';
import { auditRouter } from '../audit';
import { User } from '../../models/User';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { loadEnv } from '../../config/env';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';

loadEnv();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/audit', auditRouter);

describe('Audit Route Read-Only and POST /run Tests', () => {
    let tokenA: string;
    let userIdA: string;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);

        // Register User A
        const resA = await request(app).post('/api/auth/register').send({ email: 'a@readonly.com', password: 'Password123!' });
        tokenA = resA.body.accessToken;
        const userA = await User.findOne({ email: 'a@readonly.com' });
        userIdA = userA!._id.toString();

        // Seed data for A
        await Audit.create({
            accountId: userIdA, userId: userIdA, period: { start: new Date(), end: new Date() }, exchange: 'binance', totalTrades: 1, totalNotional: 1000, avgFillScore: 99.9, fillGrade: 'A', estimatedLossUSD: 0, breakdown: { avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 1, bestHour: 10, worstHour: 2, bestSymbol: 'BTCUSDT', worstSymbol: 'ETHUSDT' }, createdAt: new Date(), updatedAt: new Date()
        });

        // Seed data for demo-disciplined
        await Trade.create([
            { accountId: 'demo-disciplined', userId: 'demo-disciplined', exchange: 'binance', tradeId: 'DX1', orderId: 'O_DX1', symbol: 'BTCUSDT', side: 'BUY', orderType: 'LIMIT', isMaker: true, quantity: 1, executionPrice: 50000, notional: 50000, fee: 10, feeAsset: 'USDT', realizedPnl: 0, executedAt: new Date(), arrivalPriceProxy: 50000, vwap5min: 50000, spreadBps: 1.0 },
            { accountId: 'demo-disciplined', userId: 'demo-disciplined', exchange: 'binance', tradeId: 'DX2', orderId: 'O_DX2', symbol: 'BTCUSDT', side: 'SELL', orderType: 'MARKET', isMaker: false, quantity: 1, executionPrice: 50000, notional: 50000, fee: 20, feeAsset: 'USDT', realizedPnl: 0, executedAt: new Date(), arrivalPriceProxy: 50000, vwap5min: 50000, spreadBps: 1.0 }
        ]);

        await Audit.create({
            accountId: 'demo-disciplined', userId: 'demo-disciplined', period: { start: new Date(), end: new Date() }, exchange: 'binance', totalTrades: 2, totalNotional: 100000, avgFillScore: 88.88, fillGrade: 'B', estimatedLossUSD: 0, breakdown: { avgSlippageBps: 1, avgFeeDragBps: 2, makerRatio: 0.5, bestHour: 10, worstHour: 2, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' }, createdAt: new Date(), updatedAt: new Date()
        });

        // Ensure demo-moderate has no audits but has trades
        await Trade.create({
            accountId: 'demo-moderate', userId: 'demo-moderate', exchange: 'binance', tradeId: 'DY1', orderId: 'O_DY1', symbol: 'ETHUSDT', side: 'BUY', orderType: 'LIMIT', isMaker: true, quantity: 10, executionPrice: 3000, notional: 30000, fee: 5, feeAsset: 'USDT', realizedPnl: 0, executedAt: new Date(), arrivalPriceProxy: 3000, vwap5min: 3000, spreadBps: 1.5
        });
    });

    afterAll(async () => {
        await User.deleteMany({});
        await Trade.deleteMany({});
        await Audit.deleteMany({});
    });

    it('1. GET /api/audit?userId=demo-disciplined returns 200 with the EXISTING saved audit, creates nothing', async () => {
        const initialCount = await Audit.countDocuments({ accountId: 'demo-disciplined' });
        const res = await request(app).get('/api/audit?userId=demo-disciplined');
        
        expect(res.status).toBe(200);
        expect(res.body.avgFillScore).toBe(88.88); // Persisted score
        
        const finalCount = await Audit.countDocuments({ accountId: 'demo-disciplined' });
        expect(finalCount).toBe(initialCount); // No new doc created
    });

    it('2. GET /api/audit?userId=demo-disciplined called 3 times returns IDENTICAL avgFillScore all 3 times, doc count stays constant', async () => {
        const initialCount = await Audit.countDocuments({ accountId: 'demo-disciplined' });
        
        const res1 = await request(app).get('/api/audit?userId=demo-disciplined');
        const res2 = await request(app).get('/api/audit?userId=demo-disciplined');
        const res3 = await request(app).get('/api/audit?userId=demo-disciplined');

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);
        expect(res3.status).toBe(200);

        expect(res1.body.avgFillScore).toBe(88.88);
        expect(res2.body.avgFillScore).toBe(88.88);
        expect(res3.body.avgFillScore).toBe(88.88);

        const finalCount = await Audit.countDocuments({ accountId: 'demo-disciplined' });
        expect(finalCount).toBe(initialCount);
    });

    it('3. GET /api/audit for account with NO existing audit -> 404 with clear message, creates nothing', async () => {
        const initialCount = await Audit.countDocuments({ accountId: 'demo-moderate' });
        const res = await request(app).get('/api/audit?userId=demo-moderate');
        
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('No audit found — run an audit first');

        const finalCount = await Audit.countDocuments({ accountId: 'demo-moderate' });
        expect(finalCount).toBe(initialCount);
    });

    it('4. POST /api/audit/run?userId=demo-disciplined computes, upserts SINGLE canonical audit, returns summary', async () => {
        const initialCount = await Audit.countDocuments({ accountId: 'demo-disciplined' });
        
        const res1 = await request(app).post('/api/audit/run?userId=demo-disciplined');
        expect(res1.status).toBe(200);
        
        const countAfterOne = await Audit.countDocuments({ accountId: 'demo-disciplined' });
        expect(countAfterOne).toBe(initialCount); // UPSERT means it replaced the 1 existing doc, count shouldn't increase
        
        const res2 = await request(app).post('/api/audit/run?userId=demo-disciplined');
        expect(res2.status).toBe(200);
        
        const countAfterTwo = await Audit.countDocuments({ accountId: 'demo-disciplined' });
        expect(countAfterTwo).toBe(initialCount); // Still exactly 1 doc
        
        // Assert it updated the score from the static seed to a computed value
        // Note: the computed value will be different from 88.88 because it runs the real scoring engine.
        expect(res1.body.avgFillScore).not.toBe(88.88);
        expect(res2.body.avgFillScore).toBe(res1.body.avgFillScore);
    });

    it('5. Real-user isolation still holds: As token on GET /api/audit returns As saved audit only', async () => {
        const res = await request(app).get('/api/audit').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(200);
        expect(res.body.accountId).toBe(userIdA);
        expect(res.body.avgFillScore).toBe(99.9); // Only A's data
    });
});

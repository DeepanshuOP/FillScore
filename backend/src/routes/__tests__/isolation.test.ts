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

describe('Data Isolation and Routing Tests', () => {
    let tokenA: string;
    let tokenB: string;
    let userIdA: string;
    let userIdB: string;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);

        // We assume MongoMemoryServer is already hooked up by global test setup or similar
        // Register User A
        const resA = await request(app).post('/api/auth/register').send({ email: 'a@a.com', password: 'Password123!' });
        tokenA = resA.body.accessToken;
        const userA = await User.findOne({ email: 'a@a.com' });
        userIdA = userA!._id.toString();

        // Register User B
        const resB = await request(app).post('/api/auth/register').send({ email: 'b@b.com', password: 'Password123!' });
        tokenB = resB.body.accessToken;
        const userB = await User.findOne({ email: 'b@b.com' });
        userIdB = userB!._id.toString();

        // Seed data for A
        await Trade.create([
            { accountId: userIdA, userId: userIdA, exchange: 'binance', tradeId: 'A1', orderId: 'O_A1', symbol: 'BTCUSDT', side: 'BUY', orderType: 'LIMIT', isMaker: true, quantity: 1, executionPrice: 50000, notional: 50000, fee: 10, feeAsset: 'USDT', realizedPnl: 0, executedAt: new Date() },
            { accountId: userIdA, userId: userIdA, exchange: 'binance', tradeId: 'A2', orderId: 'O_A2', symbol: 'ETHUSDT', side: 'SELL', orderType: 'MARKET', isMaker: false, quantity: 10, executionPrice: 3000, notional: 30000, fee: 5, feeAsset: 'USDT', realizedPnl: 100, executedAt: new Date() }
        ]);
        await Audit.create({
            accountId: userIdA, userId: userIdA, period: { start: new Date(), end: new Date() }, exchange: 'binance', totalTrades: 2, totalNotional: 80000, avgFillScore: 90, fillGrade: 'A', estimatedLossUSD: 0, breakdown: { avgSlippageBps: 1, avgFeeDragBps: 2, makerRatio: 0.5, bestHour: 10, worstHour: 2, bestSymbol: 'BTCUSDT', worstSymbol: 'ETHUSDT' }, createdAt: new Date(), updatedAt: new Date()
        });

        // Seed data for B
        await Trade.create([
            { accountId: userIdB, userId: userIdB, exchange: 'binance', tradeId: 'B1', orderId: 'O_B1', symbol: 'SOLUSDT', side: 'BUY', orderType: 'LIMIT', isMaker: true, quantity: 100, executionPrice: 20, notional: 2000, fee: 1, feeAsset: 'USDT', realizedPnl: 0, executedAt: new Date() },
            { accountId: userIdB, userId: userIdB, exchange: 'binance', tradeId: 'B2', orderId: 'O_B2', symbol: 'LUNAUSDT', side: 'SELL', orderType: 'MARKET', isMaker: false, quantity: 50, executionPrice: 100, notional: 5000, fee: 2, feeAsset: 'USDT', realizedPnl: -50, executedAt: new Date() }
        ]);
        await Audit.create({
            accountId: userIdB, userId: userIdB, period: { start: new Date(), end: new Date() }, exchange: 'binance', totalTrades: 2, totalNotional: 7000, avgFillScore: 80, fillGrade: 'B', estimatedLossUSD: 0, breakdown: { avgSlippageBps: 1, avgFeeDragBps: 2, makerRatio: 0.5, bestHour: 10, worstHour: 2, bestSymbol: 'SOLUSDT', worstSymbol: 'LUNAUSDT' }, createdAt: new Date(), updatedAt: new Date()
        });

        // Seed demo data
        await Trade.create({
            accountId: 'demo-disciplined', userId: 'demo-disciplined', exchange: 'binance', tradeId: 'D1', orderId: 'O_D1', symbol: 'DOGEUSDT', side: 'BUY', orderType: 'LIMIT', isMaker: true, quantity: 1000, executionPrice: 0.1, notional: 100, fee: 0, feeAsset: 'USDT', realizedPnl: 0, executedAt: new Date()
        });
        await Audit.create({
            accountId: 'demo-disciplined', userId: 'demo-disciplined', period: { start: new Date(), end: new Date() }, exchange: 'binance', totalTrades: 1, totalNotional: 100, avgFillScore: 90, fillGrade: 'A', estimatedLossUSD: 0, breakdown: { avgSlippageBps: 1, avgFeeDragBps: 2, makerRatio: 1, bestHour: 10, worstHour: 2, bestSymbol: 'DOGEUSDT', worstSymbol: 'DOGEUSDT' }, createdAt: new Date(), updatedAt: new Date()
        });
    });

    afterAll(async () => {
        await User.deleteMany({});
        await Trade.deleteMany({});
        await Audit.deleteMany({});
    });

    it('1. A token on GET /api/audit/trades returns ONLY As 2 trades', async () => {
        const res = await request(app).get('/api/audit/trades').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(200);
        expect(res.body.trades.length).toBe(2);
        const hasB = res.body.trades.some((t: any) => t.accountId === userIdB || t.userId === userIdB);
        expect(hasB).toBe(false);
    });

    it('2. A token on GET /api/audit/score (audit summary) never includes Bs data', async () => {
        const res = await request(app).get('/api/audit/score').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(200);
        expect(res.body.accountId).toBe(userIdA);
    });

    it('3. A token + ?userId=<Bs userId> -> 403, Bs data is NOT returned', async () => {
        const res = await request(app).get(`/api/audit/score?userId=${userIdB}`).set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(403);
    });

    it('4. A token + ?userId=<As own userId> -> 403', async () => {
        const res = await request(app).get(`/api/audit/score?userId=${userIdA}`).set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(403);
    });

    it('5. No token, no userId -> 401', async () => {
        const res = await request(app).get('/api/audit/score');
        expect(res.status).toBe(401);
    });

    it('6. ?userId=demo-disciplined with no token -> 200 and returns ONLY demo data', async () => {
        const res = await request(app).get('/api/audit/trades?userId=demo-disciplined');
        expect(res.status).toBe(200);
        expect(res.body.trades.length).toBe(1);
        expect(res.body.trades[0].accountId).toBe('demo-disciplined');
    });

    it('7. B token on same endpoints returns ONLY Bs data', async () => {
        const resTrades = await request(app).get('/api/audit/trades').set('Authorization', `Bearer ${tokenB}`);
        expect(resTrades.status).toBe(200);
        expect(resTrades.body.trades.length).toBe(2);
        const hasA = resTrades.body.trades.some((t: any) => t.accountId === userIdA || t.userId === userIdA);
        expect(hasA).toBe(false);

        const resAudit = await request(app).get('/api/audit/score').set('Authorization', `Bearer ${tokenB}`);
        expect(resAudit.status).toBe(200);
        expect(resAudit.body.accountId).toBe(userIdB);
    });

    // Share route tests (Step 3)
    it('Share of a demo user -> 200', async () => {
        const res = await request(app).get('/api/audit/share/demo-disciplined');
        expect(res.status).toBe(200);
    });

    it('Share of a real users id -> 404', async () => {
        const res = await request(app).get(`/api/audit/share/${userIdA}`);
        expect(res.status).toBe(404);
    });
});

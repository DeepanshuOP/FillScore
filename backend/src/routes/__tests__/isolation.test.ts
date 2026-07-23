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
    const NOW = Date.now();

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
            { userId: userA!._id.toString(), accountId: userA!._id.toString(), dataSource: 'real-user', exchange: 'binance', symbol: 'BTCUSDT', tradeId: 'A1', orderId: 'O1', side: 'BUY', orderType: 'MARKET', isMaker: false, executionPrice: 50000, quantity: 1, notional: 50000, fee: 10, feeAsset: 'USDT', executedAt: new Date(NOW - 1000) },
            { userId: userA!._id.toString(), accountId: userA!._id.toString(), dataSource: 'real-user', exchange: 'binance', symbol: 'BTCUSDT', tradeId: 'A2', orderId: 'O2', side: 'SELL', orderType: 'MARKET', isMaker: false, executionPrice: 51000, quantity: 1, notional: 51000, fee: 10, feeAsset: 'USDT', executedAt: new Date() }
        ]);
        await Audit.create({
            userId: userA!._id.toString(), accountId: userA!._id.toString(), dataSource: 'real-user', period: { start: new Date(NOW - 2000), end: new Date() },
            exchange: 'binance', totalTrades: 2, totalNotional: 101000, avgFillScore: 85, fillGrade: 'B', estimatedLossUSD: 5,
            breakdown: { avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0, bestHour: 10, worstHour: 12, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' }, createdAt: new Date(), updatedAt: new Date()
        });

        // Seed data for B
        await Trade.create([
            { userId: userB!._id.toString(), accountId: userB!._id.toString(), dataSource: 'real-user', exchange: 'binance', symbol: 'ETHUSDT', tradeId: 'B1', orderId: 'O3', side: 'BUY', orderType: 'MARKET', isMaker: false, executionPrice: 3000, quantity: 10, notional: 30000, fee: 5, feeAsset: 'USDT', executedAt: new Date(NOW - 500) },
            { accountId: userIdB, userId: userIdB, dataSource: 'real-user', exchange: 'binance', tradeId: 'B2', orderId: 'O_B2', symbol: 'LUNAUSDT', side: 'SELL', orderType: 'MARKET', isMaker: false, quantity: 50, executionPrice: 100, notional: 5000, fee: 2, feeAsset: 'USDT', realizedPnl: -50, executedAt: new Date() }
        ]);
        await Audit.create({
            accountId: userIdB, userId: userIdB, dataSource: 'real-user', period: { start: new Date(), end: new Date() }, exchange: 'binance', totalTrades: 2, totalNotional: 7000, avgFillScore: 80, fillGrade: 'B', estimatedLossUSD: 0, breakdown: { avgSlippageBps: 1, avgFeeDragBps: 2, makerRatio: 0.5, bestHour: 10, worstHour: 2, bestSymbol: 'SOLUSDT', worstSymbol: 'LUNAUSDT' }, createdAt: new Date(), updatedAt: new Date()
        });

        // Seed demo data
        await Trade.create({
            userId: 'demo-disciplined', accountId: 'demo-disciplined', dataSource: 'synthetic-demo', exchange: 'binance', symbol: 'SOLUSDT', tradeId: 'D1', orderId: 'O4', side: 'SELL', orderType: 'MARKET', isMaker: false, executionPrice: 100, quantity: 50, notional: 5000, fee: 1, feeAsset: 'USDT', executedAt: new Date(NOW - 100)
        });
        await Audit.create({
            userId: 'demo-disciplined', accountId: 'demo-disciplined', dataSource: 'synthetic-demo', period: { start: new Date(NOW - 500), end: new Date() },
            exchange: 'binance', totalTrades: 1, totalNotional: 5000, avgFillScore: 99, fillGrade: 'A', estimatedLossUSD: 0.1,
            breakdown: { avgSlippageBps: 0.1, avgFeeDragBps: 0.1, makerRatio: 0, bestHour: 9, worstHour: 9, bestSymbol: 'SOLUSDT', worstSymbol: 'SOLUSDT' }, createdAt: new Date(), updatedAt: new Date()
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

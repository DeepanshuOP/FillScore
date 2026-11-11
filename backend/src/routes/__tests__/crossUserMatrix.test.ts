import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { User } from '../../models/User';
import { Audit } from '../../models/Audit';
import { Trade } from '../../models/Trade';
import { issueTokenPair } from '../../services/authService';
import { loadEnv } from '../../config/env';

loadEnv();
const app = createApp();

// endpoint | resolved from. userId query is honoured only for the six demo ids; a real id (own or
// someone else's) is refused with 403; with no userId the account comes from the bearer token.
const GET_ENDPOINTS = [
    '/api/audit/score', '/api/audit/history', '/api/audit/trades', '/api/audit/analytics',
    '/api/audit/analytics/exchange-comparison', '/api/audit/coach', '/api/audit/analytics/whale-correlation',
    '/api/attribution', '/api/audit/report', '/api/audit', '/api/audit/v2', '/api/audit/verify',
];

describe('cross-user read matrix', () => {
    let tokenA: string;
    let idA: string;
    let idB: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const a = await User.create({ email: 'matrix-a@example.com', emailVerified: true });
        const b = await User.create({ email: 'matrix-b@example.com', emailVerified: true });
        idA = a._id.toString();
        idB = b._id.toString();
        tokenA = (await issueTokenPair(idA)).accessToken;
    });
    afterAll(async () => { await User.deleteMany({ email: /^matrix-/ }); });

    for (const path of GET_ENDPOINTS) {
        it(`${path}: A asking for B's id -> 403`, async () => {
            const res = await request(app).get(`${path}?userId=${idB}`).set('Authorization', `Bearer ${tokenA}`);
            expect(res.status).toBe(403);
        });
        it(`${path}: a demo id is allowed (never 401/403)`, async () => {
            const res = await request(app).get(`${path}?userId=demo-moderate`).set('Authorization', `Bearer ${tokenA}`);
            expect([401, 403]).not.toContain(res.status);
        });
        it(`${path}: no userId resolves from the token (A's own empty account is 200/404, not 401/403)`, async () => {
            const res = await request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
            expect([401, 403]).not.toContain(res.status);
        });
    }

    it('report: a download token for A cannot be combined with B\'s userId', async () => {
        const res = await request(app).get(`/api/audit/report?userId=${idB}&dl=whatever`);
        expect(res.status).toBe(403);
    });

    it('trades/export: A asking for B\'s id -> 403', async () => {
        const res = await request(app).get(`/api/audit/trades/export?userId=${idB}`).set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(403);
    });

    it('note PATCH: A cannot write a note on B\'s account via userId -> 403; a demo id is read-only -> 403', async () => {
        const b = await request(app).patch(`/api/audit/trades/1/note?userId=${idB}`).set('Authorization', `Bearer ${tokenA}`).send({ note: 'x' });
        expect(b.status).toBe(403);
        const d = await request(app).patch('/api/audit/trades/1/note?userId=demo-moderate').set('Authorization', `Bearer ${tokenA}`).send({ note: 'x' });
        expect(d.status).toBe(403);
    });

    it('demo ids are read-only: POST /audit/run with a demo id -> 403', async () => {
        const res = await request(app).post('/api/audit/run?userId=demo-moderate').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(403);
    });

    // V3b: own and demo reads succeed with the payload shape, using fixtures created here.
    describe('own and demo reads return 200 with the payload shape', () => {
        const seed = async (accountId: string, source: 'real-user' | 'synthetic-demo') => {
            for (let i = 0; i < 4; i++) {
                await Trade.create({
                    accountId, userId: accountId, dataSource: source, exchange: 'binance', symbol: 'BTCUSDT', tradeId: `mx${i}`, orderId: `mo${i}`,
                    side: 'BUY', orderType: 'MARKET', isMaker: false, executionPrice: 40100, quantity: 0.1, notional: 4010, fee: 4, feeUsd: 4, feeAsset: 'USDT',
                    executedAt: new Date(Date.UTC(2024, 0, 2 + i, 11, 0)), arrivalPriceProxy: 40000, spreadBps: 2, fillScore: 70, fillGrade: 'C', arrivalSlippageBps: 25,
                });
            }
            await Audit.create({
                accountId, userId: accountId, dataSource: source, period: { start: new Date('2024-01-02'), end: new Date('2024-01-31') },
                exchange: 'binance', totalTrades: 4, totalNotional: 16040, avgFillScore: 70, fillGrade: 'C', estimatedLossUSD: 80,
                breakdown: { avgSlippageBps: 25, avgFeeDragBps: 10, makerRatio: 0, bestHour: 11, worstHour: 11, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' },
                recommendations: ['You used market orders for 100% of trades, paying taker fees on each.'],
            } as any);
        };
        beforeAll(async () => { await seed('demo-moderate', 'synthetic-demo'); await seed(idA, 'real-user'); });
        afterAll(async () => {
            await Audit.deleteMany({ accountId: { $in: ['demo-moderate', idA] } });
            await Trade.deleteMany({ accountId: { $in: ['demo-moderate', idA] } });
        });

        const SHAPES: Array<[string, (b: any) => void]> = [
            ['/api/audit/score', b => { expect(b.avgFillScore).toBe(70); expect(b.fillGrade).toBe('C'); }],
            ['/api/audit/coach', b => { expect(typeof b.headline).toBe('string'); expect(Array.isArray(b.actions)).toBe(true); }],
            ['/api/audit/history', b => { expect(Array.isArray(b.points)).toBe(true) }],
        ];
        for (const [path, check] of SHAPES) {
            it(`${path}: demo id -> 200 with shape`, async () => {
                const res = await request(app).get(`${path}?userId=demo-moderate`).set('Authorization', `Bearer ${tokenA}`);
                expect(res.status).toBe(200);
                check(res.body);
            });
            it(`${path}: own account (no userId) -> 200 with shape`, async () => {
                const res = await request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
                expect(res.status).toBe(200);
                check(res.body);
            });
        }
    });
});

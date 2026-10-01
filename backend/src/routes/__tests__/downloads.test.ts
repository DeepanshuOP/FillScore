import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { signDownloadToken } from '../../utils/downloadToken';
import { loadEnv } from '../../config/env';

loadEnv();
const app = createApp();

const seedAccount = async (accountId: string, tradeId: string) => {
    await Audit.create({
        userId: accountId, accountId, dataSource: 'real-user',
        period: { start: new Date('2026-09-01T00:00:00Z'), end: new Date('2026-09-30T00:00:00Z') },
        exchange: 'binance', totalTrades: 1, totalNotional: 50000, avgFillScore: 88, fillGrade: 'B',
        estimatedLossUSD: 5,
        breakdown: { avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0.5, bestHour: 10, worstHour: 3, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' },
    });
    await Trade.create({
        userId: accountId, accountId, dataSource: 'real-user', exchange: 'binance', tradeId,
        orderId: `o-${tradeId}`, symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET', isMaker: false,
        quantity: 1, executionPrice: 50000, notional: 50000, fee: 50, feeAsset: 'USDT',
        executedAt: new Date('2026-09-10T10:00:00Z'), arrivalPriceProxy: 50000, vwap5min: 50000,
        spreadBps: 1, fillScore: 88, fillGrade: 'B',
    });
};

describe('authenticated downloads', () => {
    let aToken: string;
    let aId: string;
    let bId: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const a = await User.create({ email: 'dl-a@example.com', emailVerified: true });
        const b = await User.create({ email: 'dl-b@example.com', emailVerified: true });
        aId = a._id.toString();
        bId = b._id.toString();
        aToken = (await issueTokenPair(aId)).accessToken;
        await seedAccount(aId, 'trade-of-a');
        await seedAccount(bId, 'trade-of-b');
    });

    afterAll(async () => {
        await Trade.deleteMany({});
        await Audit.deleteMany({});
        await User.deleteMany({});
    });

    it('issues a token only to a signed-in user', async () => {
        const anon = await request(app).post('/api/audit/download-token').send({ kind: 'report' });
        expect(anon.status).toBe(401);

        const ok = await request(app)
            .post('/api/audit/download-token')
            .set('Authorization', `Bearer ${aToken}`)
            .send({ kind: 'report' });
        expect(ok.status).toBe(200);
        expect(typeof ok.body.token).toBe('string');
        expect(ok.body.expiresInSeconds).toBe(60);
    });

    it('rejects an unknown kind', async () => {
        const res = await request(app)
            .post('/api/audit/download-token')
            .set('Authorization', `Bearer ${aToken}`)
            .send({ kind: 'everything' });
        expect(res.status).toBe(400);
    });

    it('lets a real user download their own PDF with nothing but the link', async () => {
        const { body } = await request(app)
            .post('/api/audit/download-token')
            .set('Authorization', `Bearer ${aToken}`)
            .send({ kind: 'report' });

        const res = await request(app)
            .get(`/api/audit/report?dl=${body.token}`)
            .buffer(true)
            .parse((r, cb) => {
                const chunks: Buffer[] = [];
                r.on('data', (c: Buffer) => chunks.push(c));
                r.on('end', () => cb(null, Buffer.concat(chunks)));
            });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it('lets a real user download their own CSV, and only their own rows', async () => {
        const { body } = await request(app)
            .post('/api/audit/download-token')
            .set('Authorization', `Bearer ${aToken}`)
            .send({ kind: 'export' });

        const res = await request(app).get(`/api/audit/trades/export?dl=${body.token}`);
        expect(res.status).toBe(200);
        expect(res.text).toContain('trade-of-a');
        expect(res.text).not.toContain('trade-of-b');
    });

    it('does not let a report token fetch the export, or the reverse', async () => {
        const reportToken = signDownloadToken(aId, 'report');
        const exportToken = signDownloadToken(aId, 'export');
        expect((await request(app).get(`/api/audit/trades/export?dl=${reportToken}`)).status).toBe(401);
        expect((await request(app).get(`/api/audit/report?dl=${exportToken}`)).status).toBe(401);
    });

    it('rejects garbage and an ordinary access token in the dl parameter', async () => {
        expect((await request(app).get('/api/audit/report?dl=garbage')).status).toBe(401);
        expect((await request(app).get(`/api/audit/report?dl=${aToken}`)).status).toBe(401);
    });

    it('cannot be pointed at someone else: a user id next to a valid token is refused', async () => {
        const token = signDownloadToken(aId, 'export');
        const res = await request(app).get(`/api/audit/trades/export?dl=${token}&userId=${bId}`);
        expect(res.status).toBe(403);
    });

    it('leaves the demo flow untouched', async () => {
        const res = await request(app).get('/api/audit/trades/export?userId=demo-okx');
        expect(res.status).toBe(200);
    });
});

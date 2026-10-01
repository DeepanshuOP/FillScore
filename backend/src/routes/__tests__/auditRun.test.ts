import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import { authRouter } from '../auth';
import { auditRouter } from '../audit';
import { User } from '../../models/User';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { TradeIngestionService } from '../../services/TradeIngestionService';
import { encryptApiKey } from '../../utils/encryption';
import { loadEnv } from '../../config/env';

loadEnv();

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use('/api/auth', authRouter);
app.use('/api/audit', auditRouter);

describe('POST /api/audit/run for a real account', () => {
    let token: string;
    let accountId: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'runner@example.com', password: 'Password123!' });
        token = res.body.accessToken;
        accountId = (await User.findOne({ email: 'runner@example.com' }))!._id.toString();

        // onboarding stores connections by accountId only, never userId
        await ExchangeConnection.create({
            accountId,
            exchange: 'binance',
            encryptedApiKey: encryptApiKey('real-key'),
            encryptedApiSecret: encryptApiKey('real-secret'),
        });

        await Trade.create({
            userId: accountId, accountId, dataSource: 'real-user', exchange: 'binance',
            tradeId: 'r1', orderId: 'o1', symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET',
            isMaker: false, quantity: 1, executionPrice: 50000, notional: 50000, fee: 50,
            feeAsset: 'USDT', executedAt: new Date(), arrivalPriceProxy: 50000, vwap5min: 50000,
            spreadBps: 1.0,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    afterAll(async () => {
        await User.deleteMany({});
        await Trade.deleteMany({});
        await Audit.deleteMany({});
        await ExchangeConnection.deleteMany({});
    });

    it('finds the connection by accountId and runs the pipeline', async () => {
        const ingest = vi
            .spyOn(TradeIngestionService.prototype, 'ingestForUser')
            .mockResolvedValue({ inserted: 0, skipped: 0 });

        const res = await request(app)
            .post('/api/audit/run')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.accountId).toBe(accountId);
        expect(res.body.dataSource).toBe('real-user');
        expect(ingest).toHaveBeenCalled();
        expect(ingest.mock.calls[0][1]).toBe('real-key');
        expect(ingest.mock.calls[0][2]).toBe('real-secret');
    });

    it('returns 404 when the account has no exchange connection', async () => {
        await ExchangeConnection.deleteMany({ accountId });
        const res = await request(app)
            .post('/api/audit/run')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('No exchange connection found');
    });
});

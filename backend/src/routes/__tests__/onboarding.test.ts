import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import passport from '../../config/passport';
import { setupSecurity } from '../../middleware/security';
import { onboardingRouter } from '../onboarding';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { User } from '../../models/User';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import jwt from 'jsonwebtoken';
import { loadEnv } from '../../config/env';
import { encryptApiKey } from '../../utils/encryption';

loadEnv();

vi.mock('../../services/keyValidation', () => ({
    validateBinanceKey: vi.fn()
}));
import { validateBinanceKey } from '../../services/keyValidation';
const mockValidateBinanceKey = validateBinanceKey as any;

vi.mock('../../services/TradeIngestionService', () => {
    return {
        TradeIngestionService: class {
            ingestForUser = vi.fn().mockImplementation(async (accountId, k, s, symbol) => {
                const { Trade } = await import('../../models/Trade');
                await Trade.updateOne(
                    { accountId, tradeId: `mock_${symbol}` },
                    { $setOnInsert: {
                        accountId,
                        userId: accountId,
                        exchange: 'binance',
                        symbol,
                        tradeId: `mock_${symbol}`,
                        orderId: `order_${symbol}`,
                        side: 'BUY',
                        orderType: 'LIMIT',
                        isMaker: true,
                        executionPrice: 50000,
                        quantity: 1,
                        notional: 50000,
                        fee: 5,
                        feeAsset: 'USDT',
                        executedAt: new Date(),
                        dataSource: 'real-user'
                    }},
                    { upsert: true }
                );
                return { inserted: 1, skipped: 0 };
            })
        }
    };
});

// Mock executeAuditPipeline so it doesn't fail on perfectly shaping EnrichedTrades in tests
vi.mock('../audit', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return {
        ...actual,
        executeAuditPipeline: vi.fn().mockResolvedValue({
            savedAudit: { avgFillScore: 90, fillGrade: 'A' },
            tradesScored: 1,
            totalIngested: 1
        })
    };
});

// Mock MarketDataService to skip external price enrichment
vi.mock('../../services/MarketDataService', () => {
    return {
        MarketDataService: class {
            enrichAllPendingTrades = vi.fn().mockResolvedValue(true)
        }
    };
});

const app = express();
setupSecurity(app);
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.json());
app.use('/api/onboarding', onboardingRouter);

describe('Onboarding Routes', () => {
    let accessToken: string;
    let userId: string;

    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);

        const user = new User({
            email: `test_onboarding_${Date.now()}@example.com`,
            passwordHash: 'dummy'
        });
        await user.save();
        userId = user._id.toString();

        accessToken = jwt.sign(
            { userId },
            process.env.JWT_ACCESS_SECRET || 'test1',
            { expiresIn: '15m' }
        );
    });

    afterAll(async () => {
        await User.deleteMany({ email: { $regex: /^test_onboarding_/ } });
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await ExchangeConnection.deleteMany({ accountId: userId });
        await Trade.deleteMany({ accountId: userId });
        await Audit.deleteMany({ accountId: userId });
        vi.clearAllMocks();
    });

    describe('POST /api/onboarding/connect', () => {
        it('returns 401 if unauthenticated /connect', async () => {
            const res = await request(app).post('/api/onboarding/connect').send({
                exchange: 'binance',
                apiKey: 'test',
                apiSecret: 'test'
            });
            expect(res.status).toBe(401);
        });

        it('returns 400 for unsupported exchange (bybit/okx) until validation exists', async () => {
            const res = await request(app)
                .post('/api/onboarding/connect')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    exchange: 'bybit',
                    apiKey: 'test_key',
                    apiSecret: 'test_secret'
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('exchange_not_supported_yet');
            const count = await ExchangeConnection.countDocuments({ accountId: userId });
            expect(count).toBe(0);
        });

        it('returns 400 key_not_read_only if validation throws key_not_read_only and stores nothing', async () => {
            mockValidateBinanceKey.mockRejectedValueOnce(new Error('key_not_read_only'));

            const res = await request(app)
                .post('/api/onboarding/connect')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    exchange: 'binance',
                    apiKey: 'test_key',
                    apiSecret: 'test_secret'
                });

            expect(res.status).toBe(400);
            expect(res.body.error).toBe('key_not_read_only');
            const count = await ExchangeConnection.countDocuments({ accountId: userId });
            expect(count).toBe(0);
        });

        it('returns 401 invalid_key if validation throws invalid_key and stores nothing', async () => {
            mockValidateBinanceKey.mockRejectedValueOnce(new Error('invalid_key'));

            const res = await request(app)
                .post('/api/onboarding/connect')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    exchange: 'binance',
                    apiKey: 'test_key',
                    apiSecret: 'test_secret'
                });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('invalid_key');
            const count = await ExchangeConnection.countDocuments({ accountId: userId });
            expect(count).toBe(0);
        });
        
        it('returns 502 network_error on generic validation failure and stores nothing', async () => {
            mockValidateBinanceKey.mockRejectedValueOnce(new Error('network_error'));

            const res = await request(app)
                .post('/api/onboarding/connect')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    exchange: 'binance',
                    apiKey: 'test_key',
                    apiSecret: 'test_secret'
                });

            expect(res.status).toBe(502);
            expect(res.body.error).toBe('network_error');
            const count = await ExchangeConnection.countDocuments({ accountId: userId });
            expect(count).toBe(0);
        });

        it('returns 200, stores connection with accountId, asserts plaintext key is NOT in DB', async () => {
            mockValidateBinanceKey.mockResolvedValueOnce(undefined);

            const res = await request(app)
                .post('/api/onboarding/connect')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    exchange: 'binance',
                    apiKey: 'super_secret_plain_key',
                    apiSecret: 'super_secret_plain_secret'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const docs = await ExchangeConnection.find({ accountId: userId });
            expect(docs.length).toBe(1);
            
            const rawDoc = JSON.stringify(docs[0].toObject());
            expect(rawDoc).not.toContain('super_secret_plain_key');
            expect(rawDoc).not.toContain('super_secret_plain_secret');
        });
    });

    describe('POST /api/onboarding/sync', () => {
        it('returns 401 if unauthenticated /sync', async () => {
            const res = await request(app).post('/api/onboarding/sync');
            expect(res.status).toBe(401);
        });

        it('returns 400 (not 500) if no trades exist / no connection exists', async () => {
            const res = await request(app)
                .post('/api/onboarding/sync')
                .set('Authorization', `Bearer ${accessToken}`);
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('No exchange connections found');
        });

        it('successfully triggers sync and returns ingestion stats (route wiring verified)', async () => {
            await ExchangeConnection.create({
                accountId: userId,
                exchange: 'binance',
                encryptedApiKey: encryptApiKey('test_key'),
                encryptedApiSecret: encryptApiKey('test_secret')
            });

            const res = await request(app)
                .post('/api/onboarding/sync')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.tradesIngested).toBeGreaterThan(0);

            const trades = await Trade.find({ accountId: userId });
            expect(trades.length).toBeGreaterThan(0);
            trades.forEach(t => {
                expect(t.accountId).toBe(userId);
                expect(t.dataSource).toBe('real-user');
            });
        });

        it('does NOT touch demo account data', async () => {
            // Seed a demo trade
            await Trade.create({
                accountId: 'demo-test',
                userId: 'demo-test',
                exchange: 'binance',
                symbol: 'BTCUSDT',
                tradeId: 'demo_t1',
                orderId: 'demo_o1',
                side: 'SELL',
                orderType: 'MARKET',
                isMaker: false,
                executionPrice: 60000,
                quantity: 1,
                notional: 60000,
                fee: 10,
                feeAsset: 'USDT',
                executedAt: new Date(),
                dataSource: 'synthetic-demo'
            });

            mockValidateBinanceKey.mockResolvedValueOnce(undefined);
            await request(app)
                .post('/api/onboarding/connect')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({ exchange: 'binance', apiKey: 'test', apiSecret: 'test' });

            await request(app)
                .post('/api/onboarding/sync')
                .set('Authorization', `Bearer ${accessToken}`);

            // Ensure demo trade remains untouched
            const demoTrade = await Trade.findOne({ accountId: 'demo-test' });
            expect(demoTrade).not.toBeNull();
            expect(demoTrade?.dataSource).toBe('synthetic-demo');

            // Cleanup the manually seeded demo trade
            await Trade.deleteMany({ accountId: 'demo-test' });
        });
    });
});

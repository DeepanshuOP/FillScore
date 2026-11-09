import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';
import { User } from '../../models/User';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { issueTokenPair } from '../../services/authService';
import { encryptApiKey } from '../../utils/encryption';

loadEnv();

// External boundaries only: the exchange sync and the market-data fetch are stubbed.
vi.mock('../../services/SyncService', () => ({
    syncAccountTrades: vi.fn(async () => ({ inserted: 0, skipped: 0, failures: [], refused: [] })),
}));
vi.mock('../../services/MarketDataService', () => ({ MarketDataService: class { enrichAllPendingTrades = vi.fn().mockResolvedValue(true); } }));

const app = createApp();

describe('POST /api/audit/run when every trade is skipped (4R-0c B3)', () => {
    let token: string; let id: string;
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const u = await User.create({ email: `test_allskipped_${Date.now()}@example.com`, emailVerified: true });
        id = u._id.toString();
        token = (await issueTokenPair(id)).accessToken;
        await ExchangeConnection.create({ accountId: id, exchange: 'binance', encryptedApiKey: encryptApiKey('k'), encryptedApiSecret: encryptApiKey('s') });
        // arrivalPriceProxy present but no spreadBps: scoreTrade throws "missing spreadBps enrichment"
        for (const tradeId of ['s1', 's2']) {
            await Trade.create({
                userId: id, accountId: id, dataSource: 'real-user', exchange: 'binance', tradeId, orderId: 'o' + tradeId,
                symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET', isMaker: false, quantity: 1, executionPrice: 100,
                notional: 100, fee: 0.1, feeAsset: 'USDT', executedAt: new Date(), arrivalPriceProxy: 100, vwap5min: 100,
            });
        }
    });
    afterAll(async () => {
        await User.deleteMany({ email: /^test_allskipped_/ });
        await ExchangeConnection.deleteMany({ accountId: id });
        await Trade.deleteMany({ accountId: id });
        await Audit.deleteMany({ accountId: id });
    });

    it('2 trades, both invalid_spreadBps: 422 no_scorable_trades with the skip count and reasons', async () => {
        const res = await request(app).post('/api/audit/run').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(422);
        expect(res.body.error).toBe('no_scorable_trades');
        expect(res.body.skippedTrades).toEqual({ count: 2, reasons: { invalid_spreadBps: 2 } });
    });
});

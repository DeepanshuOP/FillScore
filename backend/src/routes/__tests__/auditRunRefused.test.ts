import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';
import { User } from '../../models/User';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { issueTokenPair } from '../../services/authService';
import { encryptApiKey } from '../../utils/encryption';

loadEnv();

// The exchange is an external boundary: SyncService is stubbed to return what it returns when the
// key re-check refuses a connection (see SyncService.ts refused[]).
let syncReport: any;
vi.mock('../../services/SyncService', () => ({
    syncAccountTrades: vi.fn(async () => syncReport),
}));
vi.mock('../../services/MarketDataService', () => ({ MarketDataService: class { enrichAllPendingTrades = vi.fn().mockResolvedValue(true); } }));

const app = createApp();

describe('POST /api/audit/run handles report.refused', () => {
    let token: string; let id: string;
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const u = await User.create({ email: `test_runrefused_${Date.now()}@example.com`, emailVerified: true });
        id = u._id.toString();
        token = (await issueTokenPair(id)).accessToken;
        await ExchangeConnection.create({ accountId: id, exchange: 'binance', encryptedApiKey: encryptApiKey('k'), encryptedApiSecret: encryptApiKey('s') });
    });
    afterAll(async () => { await User.deleteMany({ email: /^test_runrefused_/ }); await ExchangeConnection.deleteMany({ accountId: id }); });

    it('every connection refused: 409 key_not_read_only with the permission names, no audit generated', async () => {
        // One connection exists and one is refused: 1 === 1, so the run is refused as a whole.
        syncReport = { inserted: 0, skipped: 0, failures: [], refused: [{ exchange: 'binance', reason: 'key_not_read_only', disable: ['Withdrawals'], enable: [] }] };
        const res = await request(app).post('/api/audit/run').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(409);
        expect(res.body.error).toBe('key_not_read_only');
        expect(res.body.exchange).toBe('binance');
        expect(res.body.disable).toEqual(['Withdrawals']);
    });

    it('a network_error refusal is not a permission verdict: 502 with the reason', async () => {
        syncReport = { inserted: 0, skipped: 0, failures: [], refused: [{ exchange: 'binance', reason: 'network_error' }] };
        const res = await request(app).post('/api/audit/run').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(502);
        expect(res.body.error).toBe('network_error');
    });
});

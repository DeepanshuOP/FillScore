import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { loadEnv } from '../../config/env';
import { setupSecurity } from '../../middleware/security';
import { onboardingRouter } from '../onboarding';
import { User } from '../../models/User';
import { SyncJob } from '../../models/SyncJob';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { encryptApiKey } from '../../utils/encryption';

loadEnv();

let release!: () => void;
let gate: Promise<void>;
let progressCb: ((p: any) => void) | undefined;
vi.mock('../../services/SyncService', () => ({
    syncAccountTrades: vi.fn(async (_id: string, _d: number, opts: any) => {
        progressCb = opts?.onProgress;
        opts?.onProgress?.({ symbolsDone: 1, symbolsTotal: 4, tradesAdded: 7 });
        await gate;
        return { inserted: 7, skipped: 0, failures: [], lookbackDays: 365, effectiveDays: { binance: 365 } };
    }),
}));
vi.mock('../../services/MarketDataService', () => ({ MarketDataService: class { enrichAllPendingTrades = vi.fn().mockResolvedValue(true); } }));
vi.mock('../audit', async (orig) => ({
    ...(await orig() as any),
    executeAuditPipeline: vi.fn().mockResolvedValue({ savedAudit: { avgFillScore: 90, fillGrade: 'A' }, tradesScored: 7, totalIngested: 7 }),
}));

const app = express();
setupSecurity(app);
app.use(cookieParser());
app.use(passport.initialize());
app.use(express.json());
app.use('/api/onboarding', onboardingRouter);

describe('POST /onboarding/sync is a background job', () => {
    let token: string; let userId: string;
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        await SyncJob.syncIndexes();
        const u = await User.create({ email: `test_syncjob_${Date.now()}@example.com`, passwordHash: 'x' });
        userId = u._id.toString();
        token = jwt.sign({ userId, typ: 'access' }, process.env.JWT_ACCESS_SECRET || 'test1', { expiresIn: '15m' });
        await ExchangeConnection.create({ accountId: userId, exchange: 'binance', encryptedApiKey: encryptApiKey('k'), encryptedApiSecret: encryptApiKey('s'), lookbackDays: 365 });
    });
    afterEach(async () => { release?.(); await new Promise(r => setTimeout(r, 100)); await SyncJob.deleteMany({ accountId: userId }); });
    afterAll(async () => { await User.deleteMany({ email: /^test_syncjob_/ }); await ExchangeConnection.deleteMany({ accountId: userId }); await mongoose.disconnect(); });

    const post = () => request(app).post('/api/onboarding/sync').set('Authorization', `Bearer ${token}`);
    const status = () => request(app).get('/api/onboarding/sync/status').set('Authorization', `Bearer ${token}`);

    it('concurrent POSTs: one 202 with a syncId, one 409 carrying the current status; status shows progress then done', async () => {
        gate = new Promise<void>(r => { release = r; });
        const [a, b] = await Promise.all([post(), post()]);
        const codes = [a.status, b.status].sort();
        expect(codes).toEqual([202, 409]);
        const ok = a.status === 202 ? a : b; const conflict = a.status === 409 ? a : b;
        expect(ok.body.syncId).toBeTruthy();
        expect(conflict.body.error).toBe('sync_in_progress');
        expect(conflict.body.status.state).toBe('running');

        await new Promise(r => setTimeout(r, 150));
        const mid = await status();
        expect(mid.body).toMatchObject({ state: 'running', symbolsDone: 1, symbolsTotal: 4, tradesAdded: 7, lookbackDays: 365, syncId: ok.body.syncId });

        release(); await new Promise(r => setTimeout(r, 200));
        const end = await status();
        expect(end.body.state).toBe('done');
        expect(end.body.result).toMatchObject({ tradesIngested: 7, fillScore: 90, grade: 'A' });
    });

    it('status requires auth and an idle account reports its stored lookback', async () => {
        expect((await request(app).get('/api/onboarding/sync/status')).status).toBe(401);
        const s = await status();
        expect(s.body).toMatchObject({ state: 'idle', lookbackDays: 365 });
    });
});

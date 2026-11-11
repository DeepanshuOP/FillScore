import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { User } from '../../models/User';
import { ScoreV2 } from '../../models/ScoreV2';
import { issueTokenPair } from '../../services/authService';
import { loadEnv } from '../../config/env';

loadEnv();
const app = createApp();

const doc = (accountId: string, hash: string) => ({
    accountId, scoringVersion: 'v2.0.0', versionFileSha256: 'f'.repeat(64), measureVersion: '1.0.0', integrityHash: hash,
    inputKeys: ['fill:BTCUSDT:1'], computedAt: new Date('2026-11-01T00:00:00Z'),
    result: { components: { spread: { score: 80, measured: 25, unmeasured: 0, reason: null } }, composite: null, grade: null,
        band: [60, 70], reason: 'fewer than 20 measured fills', orders: 5, fills: 5 },
});

describe('GET /api/audit/v2 and /api/audit/verify', () => {
    let tokenA: string, idA: string, idB: string;
    const oldFetch = global.fetch;
    const oldUrl = process.env.ML_SERVICE_URL;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const a = await User.create({ email: 'v2-a@example.com', emailVerified: true });
        const b = await User.create({ email: 'v2-b@example.com', emailVerified: true });
        idA = a._id.toString(); idB = b._id.toString();
        tokenA = (await issueTokenPair(idA)).accessToken;
    });
    afterEach(async () => {
        await ScoreV2.deleteMany({ accountId: { $in: [idA, idB] } });
        global.fetch = oldFetch;
        if (oldUrl === undefined) delete process.env.ML_SERVICE_URL; else process.env.ML_SERVICE_URL = oldUrl;
    });
    afterAll(async () => { await User.deleteMany({ email: /^v2-/ }); });

    it('404 with a reason when no v2 score is stored', async () => {
        const res = await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('no_v2_score');
    });

    it('returns the latest own score with its label, version and hash; never another account', async () => {
        await ScoreV2.create([doc(idA, 'a'.repeat(64)), doc(idB, 'b'.repeat(64))]);
        await ScoreV2.create({ ...doc(idA, 'c'.repeat(64)), computedAt: new Date('2026-11-02T00:00:00Z') });
        const res = await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(200);
        expect(res.body.label).toBe('v2 (measured)');
        expect(res.body.integrityHash).toBe('c'.repeat(64));
        expect(res.body.scoringVersion).toBe('v2.0.0');
        expect(res.body.result.grade).toBeNull();
        expect(res.body.result.reason).toBe('fewer than 20 measured fills');
        expect(res.body.accountId).toBeUndefined();
        const other = await request(app).get(`/api/audit/v2?userId=${idB}`).set('Authorization', `Bearer ${tokenA}`);
        expect(other.status).toBe(403);
    });

    it('demo accounts: v2 not available yet, said plainly', async () => {
        const res = await request(app).get('/api/audit/v2?userId=demo-moderate');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('v2_not_available_for_demo');
    });

    it('verify: asks the ml-service with a measure token for the caller\'s own account', async () => {
        process.env.ML_SERVICE_URL = 'http://ml.test';
        let seen: { url: string; body: any; auth: string } | undefined;
        global.fetch = (async (url: string, init: any) => {
            seen = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
            return new Response(JSON.stringify({ match: true, storedHash: 'h', recomputedHash: 'h', scoringVersion: 'v2.0.0' }), { status: 200, headers: { 'content-type': 'application/json' } });
        }) as any;
        const res = await request(app).get('/api/audit/verify').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ match: true, storedHash: 'h', recomputedHash: 'h', scoringVersion: 'v2.0.0' });
        expect(seen!.url).toBe('http://ml.test/internal/verify-v2');
        expect(seen!.body).toEqual({ accountId: idA });
        const jwt = await import('jsonwebtoken');
        expect((jwt.decode(seen!.auth.split(' ')[1]) as any).typ).toBe('measure');
    });

    it('verify: 404 when the ml-service has no stored score, 503 when it is not configured or down', async () => {
        process.env.ML_SERVICE_URL = 'http://ml.test';
        global.fetch = (async () => new Response('{}', { status: 404 })) as any;
        expect((await request(app).get('/api/audit/verify').set('Authorization', `Bearer ${tokenA}`)).status).toBe(404);
        global.fetch = (async () => { throw new Error('down'); }) as any;
        expect((await request(app).get('/api/audit/verify').set('Authorization', `Bearer ${tokenA}`)).status).toBe(503);
        delete process.env.ML_SERVICE_URL;
        expect((await request(app).get('/api/audit/verify').set('Authorization', `Bearer ${tokenA}`)).status).toBe(503);
    });

    it('verify: demo accounts are not verifiable, and another account is refused', async () => {
        expect((await request(app).get('/api/audit/verify?userId=demo-moderate')).status).toBe(404);
        expect((await request(app).get(`/api/audit/verify?userId=${idB}`).set('Authorization', `Bearer ${tokenA}`)).status).toBe(403);
    });
});

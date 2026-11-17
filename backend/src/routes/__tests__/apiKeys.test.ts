/**
 * Personal API keys for the read-only MCP server (item 15, approved 2026-11-18 with constraints): read-only scope only, shown once,
 * stored as a SHA-256 hash with a visible prefix, 90-day default expiry, revocable, at most 5 active per user, a rate limit per key,
 * lastUsedAt, account-isolated, and cross-user tests (this file).
 */
import crypto from 'crypto';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { ApiKey } from '../../models/ApiKey';
import { ScoreV2 } from '../../models/ScoreV2';
import { apiKeyRateLimiter } from '../../services/apiKeys';
import { keyManagementLimiter } from '../apiKeys';

const app = createApp();
const PASSWORD = 'Password123!';
const KEY_FORMAT = /^fsk_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const DAY = 24 * 3600 * 1000;

const scoreDoc = (accountId: string, hash: string) => ({
    accountId, scoringVersion: 'v2.3.0', versionFileSha256: 'f'.repeat(64), measureVersion: '1.0.0', integrityHash: hash,
    inputKeys: [], computedAt: new Date('2026-11-01T00:00:00Z'),
    result: { components: {}, composite: null, grade: null, band: null, reason: 'x', orders: 1, fills: 1 },
});

describe('personal API keys', () => {
    let tokenA: string, idA: string, tokenB: string, idB: string;

    async function mint(token: string, body: Record<string, unknown> = {}) {
        return request(app).post('/api/keys').set('Authorization', `Bearer ${token}`).send({ name: 'claude desktop', password: PASSWORD, ...body });
    }

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const a = await request(app).post('/api/auth/register').send({ email: 'keys-a@example.com', password: PASSWORD });
        const b = await request(app).post('/api/auth/register').send({ email: 'keys-b@example.com', password: PASSWORD });
        tokenA = a.body.accessToken; idA = a.body.userId; tokenB = b.body.accessToken; idB = b.body.userId;
        await ScoreV2.create([scoreDoc(idA, 'a'.repeat(64)), scoreDoc(idB, 'b'.repeat(64))]);
    });
    afterEach(async () => { await ApiKey.deleteMany({ userId: { $in: [idA, idB] } }); keyManagementLimiter.reset(); apiKeyRateLimiter.reset(); apiKeyRateLimiter.configure({ limit: 60 }); });
    afterAll(async () => { await ScoreV2.deleteMany({ accountId: { $in: [idA, idB] } }); });

    describe('creating', () => {
        it('needs a login token', async () => {
            expect((await request(app).post('/api/keys').send({ name: 'x', password: PASSWORD })).status).toBe(401);
        });
        it('needs the password again (a stolen 15-minute token must not mint a 90-day key)', async () => {
            // 403, not 401: the web client treats a 401 as an expired login token and retries after a refresh, which would run the password
            // check twice and spend the request limit twice (review 2026-11-18)
            const none = await mint(tokenA, { password: undefined });
            expect(none.status).toBe(403); expect(none.body.error).toBe('reauth_required');
            const wrong = await mint(tokenA, { password: 'Wrong-password1!' });
            expect(wrong.status).toBe(403); expect(wrong.body.error).toBe('reauth_required');
            expect(await ApiKey.countDocuments({ userId: idA })).toBe(0);
        });
        it('returns the key once; stores only its SHA-256 and a visible prefix; read scope; 90 days by default', async () => {
            const res = await mint(tokenA);
            expect(res.status).toBe(201);
            expect(res.headers['cache-control']).toMatch(/no-store/);
            const { key, id, prefix, scope, expiresAt, name } = res.body;
            expect(key).toMatch(KEY_FORMAT);
            expect(prefix).toBe(key.slice(0, 12));
            expect(scope).toBe('read'); expect(name).toBe('claude desktop');
            expect(Math.abs(new Date(expiresAt).getTime() - (Date.now() + 90 * DAY))).toBeLessThan(60_000);
            const doc = await ApiKey.findById(id).lean();
            expect(doc!.keyHash).toBe(sha256(key));
            expect(doc!.prefix).toBe(prefix);
            expect(JSON.stringify(doc)).not.toContain(key.slice(13));        // the secret part is nowhere in the database
            expect(doc!.userId).toBe(idA);
        });
        it('keeps the expiry between 1 and 365 days and the name between 1 and 40 characters', async () => {
            for (const expiresInDays of [0, 366, 1.5, 'x']) expect((await mint(tokenA, { expiresInDays })).status).toBe(400);
            for (const name of ['', '   ', 'n'.repeat(41), 5]) expect((await mint(tokenA, { name })).status).toBe(400);
            const ok = await mint(tokenA, { expiresInDays: 30 });
            expect(ok.status).toBe(201);
            expect(Math.abs(new Date(ok.body.expiresAt).getTime() - (Date.now() + 30 * DAY))).toBeLessThan(60_000);
        });
        it('allows at most 5 active keys per user; a revoked key frees a place; another user is not affected', async () => {
            const ids: string[] = [];
            for (let i = 0; i < 5; i++) { const r = await mint(tokenA, { name: `k${i}` }); expect(r.status).toBe(201); ids.push(r.body.id); }
            const sixth = await mint(tokenA, { name: 'k5' });
            expect(sixth.status).toBe(409); expect(sixth.body.error).toBe('max_keys');
            expect(await ApiKey.countDocuments({ userId: idA })).toBe(5);
            expect((await mint(tokenB)).status).toBe(201);
            await request(app).delete(`/api/keys/${ids[0]}`).set('Authorization', `Bearer ${tokenA}`);
            expect((await mint(tokenA, { name: 'again' })).status).toBe(201);
        });
        it('an expired key does not count against the limit', async () => {
            for (let i = 0; i < 5; i++) await mint(tokenA, { name: `k${i}` });
            await ApiKey.updateOne({ userId: idA }, { expiresAt: new Date(Date.now() - 1000) });
            expect((await mint(tokenA, { name: 'new' })).status).toBe(201);
        });
    });

    it('lists at most the 50 newest keys', async () => {
        const base = { userId: idA, name: 'k', prefix: 'fsk_00000000', scope: 'read', expiresAt: new Date(Date.now() + DAY) };
        await ApiKey.insertMany(Array.from({ length: 60 }, (_, i) => ({ ...base, keyHash: `${i}`.padStart(64, '0'), createdAt: new Date(Date.now() - i * 1000), revokedAt: new Date() })));
        const res = await request(app).get('/api/keys').set('Authorization', `Bearer ${tokenA}`);
        expect(res.body.keys).toHaveLength(50);
    });

    describe('listing and revoking', () => {
        it('lists the caller\'s keys only, with prefix, dates and lastUsedAt, never the key or its hash', async () => {
            const a = await mint(tokenA, { name: 'mine' }); const b = await mint(tokenB, { name: 'theirs' });
            const res = await request(app).get('/api/keys').set('Authorization', `Bearer ${tokenA}`);
            expect(res.status).toBe(200);
            expect(res.body.keys).toHaveLength(1);
            const k = res.body.keys[0];
            expect(k).toMatchObject({ id: a.body.id, name: 'mine', prefix: a.body.prefix, scope: 'read', lastUsedAt: null, revokedAt: null });
            expect(Object.keys(k).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'lastUsedAt', 'name', 'prefix', 'revokedAt', 'scope']);
            const text = JSON.stringify(res.body);
            expect(text).not.toContain(a.body.key); expect(text).not.toContain(sha256(a.body.key)); expect(text).not.toContain(b.body.prefix);
        });
        it('revokes an own key at once; another user\'s key cannot be revoked (404) and keeps working', async () => {
            const a = await mint(tokenA); const b = await mint(tokenB);
            expect((await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${a.body.key}`)).status).toBe(200);
            const other = await request(app).delete(`/api/keys/${b.body.id}`).set('Authorization', `Bearer ${tokenA}`);
            expect(other.status).toBe(404);
            expect((await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${b.body.key}`)).status).toBe(200);
            const own = await request(app).delete(`/api/keys/${a.body.id}`).set('Authorization', `Bearer ${tokenA}`);
            expect(own.status).toBe(200);
            expect((await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${a.body.key}`)).status).toBe(401);
            expect((await request(app).delete('/api/keys/not-an-id').set('Authorization', `Bearer ${tokenA}`)).status).toBe(404);
        });
        it('key management cannot be reached with an API key (a key can never create, list or revoke keys)', async () => {
            const a = await mint(tokenA);
            const bearer = { Authorization: `Bearer ${a.body.key}` };
            expect((await request(app).get('/api/keys').set(bearer)).status).toBe(401);
            expect((await request(app).post('/api/keys').set(bearer).send({ name: 'x', password: PASSWORD })).status).toBe(401);
            expect((await request(app).delete(`/api/keys/${a.body.id}`).set(bearer)).status).toBe(401);
            expect((await request(app).get('/api/account/export').set(bearer)).status).toBe(401);
        });
    });

    describe('using a key', () => {
        it('reads the owner\'s data and never another account\'s', async () => {
            const a = await mint(tokenA); const b = await mint(tokenB);
            const ra = await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${a.body.key}`);
            const rb = await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${b.body.key}`);
            expect(ra.body.integrityHash).toBe('a'.repeat(64));
            expect(rb.body.integrityHash).toBe('b'.repeat(64));
            const cross = await request(app).get(`/api/audit/v2?userId=${idB}`).set('Authorization', `Bearer ${a.body.key}`);
            expect(cross.status).toBe(403);
            expect(JSON.stringify(cross.body)).not.toContain('b'.repeat(64));
        });
        it('serves the tools of the MCP server and nothing else (read-only scope)', async () => {
            const k = (await mint(tokenA)).body.key;
            const h = { Authorization: `Bearer ${k}` };
            for (const p of ['/api/audit/orders-summary', '/api/audit/exceptions', '/api/audit/rankings?by=symbol', '/api/audit/venue-comparison', '/api/audit/orders/1/replay']) {
                const r = await request(app).get(p).set(h);
                expect([200, 404], p).toContain(r.status);                       // allowed through the key check; the data may be absent
                expect(r.body.error, p).not.toBe('api_key_scope');
            }
            for (const p of ['/api/audit/trades', '/api/audit/report', '/api/audit/trades/export', '/api/audit/coach', '/api/audit/analytics']) {
                const r = await request(app).get(p).set(h);
                expect(r.status, p).toBe(403); expect(r.body.error, p).toBe('api_key_scope');
            }
        });
        it('never writes: any method other than GET or HEAD is refused', async () => {
            const k = (await mint(tokenA)).body.key;
            const h = { Authorization: `Bearer ${k}` };
            // the three routes that write and answer through resolveAccount: review state, a new audit run, a trade note
            for (const [m, p] of [['patch', '/api/audit/exceptions/o1'], ['post', '/api/audit/run'], ['patch', '/api/audit/trades/t1/note']] as const) {
                const r = await (request(app) as any)[m](p).set(h).send({});
                expect(r.status, `${m} ${p}`).toBe(403); expect(r.body.error, `${m} ${p}`).toBe('api_key_read_only');
            }
        });
        it('refuses an unknown, malformed, revoked or expired key with the same answer', async () => {
            const a = await mint(tokenA);
            const bad = ['fsk_', 'fsk_zzzzzzzz_' + 'A'.repeat(43), a.body.key.slice(0, -1) + (a.body.key.endsWith('A') ? 'B' : 'A'), 'fsk_00000000_' + 'A'.repeat(43)];
            for (const k of bad) {
                const r = await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${k}`);
                expect(r.status).toBe(401); expect(r.body.error).toBe('invalid_api_key');
            }
            await ApiKey.updateOne({ _id: a.body.id }, { expiresAt: new Date(Date.now() - 1000) });
            const expired = await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${a.body.key}`);
            expect(expired.status).toBe(401); expect(expired.body.error).toBe('invalid_api_key');
        });
        it('records lastUsedAt, at most once a minute', async () => {
            const a = await mint(tokenA);
            expect((await ApiKey.findById(a.body.id).lean())!.lastUsedAt ?? null).toBeNull();
            await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${a.body.key}`);
            const first = (await ApiKey.findById(a.body.id).lean())!.lastUsedAt!;
            expect(Math.abs(first.getTime() - Date.now())).toBeLessThan(10_000);
            const tenSecondsAgo = new Date(Date.now() - 10_000);
            await ApiKey.updateOne({ _id: a.body.id }, { lastUsedAt: tenSecondsAgo });
            await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${a.body.key}`);
            expect((await ApiKey.findById(a.body.id).lean())!.lastUsedAt!.getTime()).toBe(tenSecondsAgo.getTime());   // inside the minute: no write
            const twoMinutesAgo = new Date(Date.now() - 120_000);
            await ApiKey.updateOne({ _id: a.body.id }, { lastUsedAt: twoMinutesAgo });
            await request(app).get('/api/audit/v2').set('Authorization', `Bearer ${a.body.key}`);
            expect((await ApiKey.findById(a.body.id).lean())!.lastUsedAt!.getTime()).toBeGreaterThan(twoMinutesAgo.getTime());
        });
        it('has a rate limit of its own per key: one key at its limit does not slow another', async () => {
            apiKeyRateLimiter.configure({ limit: 3 });
            const a = await mint(tokenA); const b = await mint(tokenB);
            const get = (k: string) => request(app).get('/api/audit/v2').set('Authorization', `Bearer ${k}`);
            for (let i = 0; i < 3; i++) expect((await get(a.body.key)).status).toBe(200);
            const blocked = await get(a.body.key);
            expect(blocked.status).toBe(429);
            expect(blocked.body.error).toBe('api_key_rate_limited');
            expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
            expect((await get(b.body.key)).status).toBe(200);
        });
    });
});

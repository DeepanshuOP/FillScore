import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../../app';
import { loadEnv } from '../../config/env';

// M5: the pack and verify routes are heavier than a read (a database read, a hash of every file, a signature), so each has its own
// limiter, counted per IP before the account is looked up. 20 packs and 30 verifications per 15 minutes.
loadEnv();
const app = createApp();

describe('evidence route limits', () => {
    it('the 21st pack request in the window is refused with 429, the 20 before it were answered by the route (401 here: no token)', async () => {
        const codes: number[] = [];
        for (let i = 0; i < 21; i++) codes.push((await request(app).get('/api/evidence/pack')).status);
        expect(codes.slice(0, 20).every(c => c === 401)).toBe(true);
        expect(codes[20]).toBe(429);
    });

    it('the 31st verify request in the window is refused with 429; earlier ones are validated (400 for an empty body)', async () => {
        const codes: number[] = [];
        for (let i = 0; i < 31; i++) codes.push((await request(app).post('/api/evidence/verify').send({})).status);
        expect(codes.slice(0, 30).every(c => c === 400)).toBe(true);
        expect(codes[30]).toBe(429);
    });

    it('the public key route is not under the pack limiter', async () => {
        const codes: number[] = [];
        for (let i = 0; i < 25; i++) codes.push((await request(app).get('/api/evidence/public-key')).status);
        expect(codes.every(c => c === 503 || c === 200)).toBe(true);         // 503 when no key is configured; never 429 within the general limit
    });
});

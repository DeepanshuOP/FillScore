import request from 'supertest';
import { describe, it, expect } from 'vitest';
import express from 'express';
import { requireTrustedOrigin } from '../csrf';

const buildApp = (allowed: string[]) => {
    const app = express();
    app.post('/mutate', requireTrustedOrigin(() => allowed), (_req, res) => {
        res.json({ ok: true });
    });
    return app;
};

describe('requireTrustedOrigin', () => {
    const app = buildApp(['https://app.fillscore.dev', 'http://localhost:3000']);

    it('lets an allowed Origin through', async () => {
        const res = await request(app).post('/mutate').set('Origin', 'https://app.fillscore.dev');
        expect(res.status).toBe(200);
    });

    it('rejects a foreign Origin with 403', async () => {
        const res = await request(app).post('/mutate').set('Origin', 'https://evil.example');
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('csrf_origin_rejected');
    });

    it('rejects look-alike origins that only share a prefix or suffix', async () => {
        for (const origin of [
            'https://app.fillscore.dev.evil.example',
            'https://evilapp.fillscore.dev',
            'http://app.fillscore.dev',
        ]) {
            const res = await request(app).post('/mutate').set('Origin', origin);
            expect(res.status).toBe(403);
        }
    });

    it('falls back to the Referer origin when Origin is absent', async () => {
        const ok = await request(app).post('/mutate').set('Referer', 'https://app.fillscore.dev/dashboard?x=1');
        expect(ok.status).toBe(200);
        const bad = await request(app).post('/mutate').set('Referer', 'https://evil.example/https://app.fillscore.dev/');
        expect(bad.status).toBe(403);
    });

    it('fails closed when neither Origin nor Referer is present', async () => {
        const res = await request(app).post('/mutate');
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('csrf_origin_missing');
    });

    it('treats the literal Origin "null" as untrusted', async () => {
        const res = await request(app).post('/mutate').set('Origin', 'null');
        expect(res.status).toBe(403);
    });

    it('ignores a trailing slash on the configured origin', async () => {
        const slashApp = buildApp(['https://app.fillscore.dev/']);
        const res = await request(slashApp).post('/mutate').set('Origin', 'https://app.fillscore.dev');
        expect(res.status).toBe(200);
    });
});

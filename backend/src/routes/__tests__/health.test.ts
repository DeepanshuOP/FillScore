import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import mongoose from 'mongoose';
import { healthRouter } from '../health';
import { loadEnv } from '../../config/env';

loadEnv();

const app = express();
app.use(healthRouter);

// Hand-computed fixture: backend/package.json line 3 has "version": "1.0.0"
const EXPECTED_VERSION = '1.0.0';

describe('Health Routes', () => {
    describe('/health and /api/health', () => {
        it('returns 200 with status ok on both paths', async () => {
            for (const path of ['/health', '/api/health']) {
                const res = await request(app).get(path);
                expect(res.status).toBe(200);
                expect(res.body.status).toBe('ok');
                expect(typeof res.body.timestamp).toBe('string');
            }
        });
    });

    describe('/ready and /api/ready', () => {
        it('returns 503 when Mongo is not connected', async () => {
            // mongoose starts disconnected in this test file (never call mongoose.connect)
            expect(mongoose.connection.readyState).toBe(0);
            for (const path of ['/ready', '/api/ready']) {
                const res = await request(app).get(path);
                expect(res.status).toBe(503);
                expect(res.body.status).toBe('not ready');
            }
        });

        describe('when Mongo is connected', () => {
            beforeAll(async () => {
                const uri = process.env.MONGODB_URI;
                if (!uri) throw new Error('MONGODB_URI not set');
                await mongoose.connect(uri);
            });

            afterAll(async () => {
                await mongoose.disconnect();
            });

            it('returns 200 with status ready on both paths', async () => {
                expect(mongoose.connection.readyState).toBe(1);
                for (const path of ['/ready', '/api/ready']) {
                    const res = await request(app).get(path);
                    expect(res.status).toBe(200);
                    expect(res.body.status).toBe('ready');
                }
            });
        });
    });

    describe('/version commit', () => {
        const saved = process.env.RENDER_GIT_COMMIT;
        afterEach(() => { if (saved === undefined) delete process.env.RENDER_GIT_COMMIT; else process.env.RENDER_GIT_COMMIT = saved; });

        it('reports RENDER_GIT_COMMIT and an ISO builtAt', async () => {
            process.env.RENDER_GIT_COMMIT = '30d08b1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
            const res = await request(app).get('/version');
            expect(res.body.commit).toBe('30d08b1aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
            expect(new Date(res.body.builtAt).toISOString()).toBe(res.body.builtAt);
        });

        it('falls back to "unknown" when unset', async () => {
            delete process.env.RENDER_GIT_COMMIT;
            const res = await request(app).get('/api/version');
            expect(res.body.commit).toBe('unknown');
        });
    });

    describe('/version registration', () => {
        it('has exactly one route layer answering /version', () => {
            const layers = (healthRouter as any).stack.filter((l: any) => l.route && [].concat(l.route.path).includes('/version'));
            expect(layers.length).toBe(1);
        });
        it('reads the env on every request, not at import', async () => {
            const saved = process.env.RENDER_GIT_COMMIT;
            try {
                process.env.RENDER_GIT_COMMIT = 'aaaaaaa1';
                expect((await request(app).get('/version')).body.commit).toBe('aaaaaaa1');
                process.env.RENDER_GIT_COMMIT = 'bbbbbbb2';
                expect((await request(app).get('/version')).body.commit).toBe('bbbbbbb2');
            } finally { if (saved === undefined) delete process.env.RENDER_GIT_COMMIT; else process.env.RENDER_GIT_COMMIT = saved; }
        });
    });

    describe('/version and /api/version', () => {
        it('returns the real package.json version on both paths', async () => {
            for (const path of ['/version', '/api/version']) {
                const res = await request(app).get(path);
                expect(res.status).toBe(200);
                expect(res.body.version).toBe(EXPECTED_VERSION);
            }
        });
    });
});

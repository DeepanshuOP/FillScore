import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

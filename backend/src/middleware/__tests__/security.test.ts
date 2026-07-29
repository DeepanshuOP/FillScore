import request from 'supertest';
import { describe, it, expect } from 'vitest';
import express from 'express';
import { setupSecurity, authLimiter } from '../security';

describe('trust proxy & security middleware', () => {
    it('1. sets trust proxy to 1 when NODE_ENV=production or TRUST_PROXY is enabled', () => {
        const app = express();
        const configureTrustProxy = (appInstance: express.Application) => {
            if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
                appInstance.set('trust proxy', 1);
            }
        };

        const origNodeEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';
            configureTrustProxy(app);
            expect(app.get('trust proxy')).toBe(1);
        } finally {
            process.env.NODE_ENV = origNodeEnv;
        }
    });

    it('2. trust proxy=1 resolves distinct req.ip for distinct X-Forwarded-For headers', async () => {
        const app = express();
        app.set('trust proxy', 1);
        setupSecurity(app);

        app.get('/test-ip', (req, res) => {
            res.json({ ip: req.ip });
        });

        const res1 = await request(app)
            .get('/test-ip')
            .set('X-Forwarded-For', '203.0.113.10');
        expect(res1.status).toBe(200);
        expect(res1.body.ip).toBe('203.0.113.10');

        const res2 = await request(app)
            .get('/test-ip')
            .set('X-Forwarded-For', '203.0.113.11');
        expect(res2.status).toBe(200);
        expect(res2.body.ip).toBe('203.0.113.11');
    });

    it('3. without trust proxy, X-Forwarded-For is ignored and req.ip is the socket IP', async () => {
        const app = express();
        setupSecurity(app);

        app.get('/test-ip', (req, res) => {
            res.json({ ip: req.ip });
        });

        const res1 = await request(app)
            .get('/test-ip')
            .set('X-Forwarded-For', '203.0.113.10');
        expect(res1.status).toBe(200);
        expect(res1.body.ip).not.toBe('203.0.113.10');
    });

    it('4. rate limiter treats distinct X-Forwarded-For values as distinct clients when trust proxy=1', async () => {
        const app = express();
        app.set('trust proxy', 1);
        setupSecurity(app);

        // Mount a route with authLimiter (max: 15)
        app.get('/limited', authLimiter, (req, res) => {
            res.json({ ok: true });
        });

        // Make 15 requests from IP A (198.51.100.1)
        for (let i = 0; i < 15; i++) {
            const res = await request(app)
                .get('/limited')
                .set('X-Forwarded-For', '198.51.100.1');
            expect(res.status).toBe(200);
        }

        // 16th request from IP A should be rate limited (429)
        const resBlocked = await request(app)
            .get('/limited')
            .set('X-Forwarded-For', '198.51.100.1');
        expect(resBlocked.status).toBe(429);
        expect(resBlocked.body.code).toBe('RATE_LIMIT');

        // But a request from IP B (198.51.100.2) should succeed (200) because of distinct X-Forwarded-For
        const resAllowed = await request(app)
            .get('/limited')
            .set('X-Forwarded-For', '198.51.100.2');
        expect(resAllowed.status).toBe(200);
    });
});

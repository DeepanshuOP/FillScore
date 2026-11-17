/**
 * Security review (M9, finding 2): the login limit is per IP, and behind two proxies the IP comes from X-Forwarded-For, which a client that
 * reaches the API host directly can vary. A limit per ACCOUNT does not depend on the address: after 10 failed logins for one email in 15
 * minutes, further attempts for that email are refused whatever the address, even with the right password. Only failures count, and a
 * success clears them. Known trade-off: someone can lock a victim's login for up to 15 minutes by failing on purpose; the price of
 * brute-force protection without a CAPTCHA, and shorter than an attack would take.
 * (The request count stays under the IP limit of 15 per 15 minutes, which this file shares.)
 */
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { User } from '../../models/User';
import { KeyRateLimiter } from '../../services/apiKeys';
import { loginFailures } from '../auth';

const app = createApp();
const PASSWORD = 'Password123!';

describe('KeyRateLimiter.blocked and clear', () => {
    it('blocked is null below the limit, the seconds to wait at it, and clear forgets the key', () => {
        let now = 1_000_000;
        const l = new KeyRateLimiter(3, 60_000, () => now);
        expect(l.blocked('k')).toBeNull();
        l.take('k'); l.take('k');
        expect(l.blocked('k')).toBeNull();
        l.take('k');
        expect(l.blocked('k')).toBe(60);
        now += 30_000;
        expect(l.blocked('k')).toBe(30);
        l.clear('k');
        expect(l.blocked('k')).toBeNull();
        l.take('k'); l.take('k'); l.take('k');
        now += 60_000;
        expect(l.blocked('k')).toBeNull();                          // the window ended
    });
});

describe('login throttle per account', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        loginFailures.reset();
    });
    afterAll(async () => { await User.deleteMany({ email: /^throttle-/ }); });

    it('refuses the 11th attempt for an email after 10 failures, from any address and with the right password; another email is not affected', async () => {
        const reg = await request(app).post('/api/auth/register').send({ email: 'throttle-a@example.com', password: PASSWORD });
        expect(reg.status).toBe(201);
        for (let i = 0; i < 10; i++) {
            const r = await request(app).post('/api/auth/login').set('X-Forwarded-For', `10.0.0.${i}`).send({ email: 'throttle-a@example.com', password: 'wrong-password' });
            expect(r.status).toBe(401);
        }
        const blocked = await request(app).post('/api/auth/login').set('X-Forwarded-For', '10.9.9.9').send({ email: 'Throttle-A@example.com', password: PASSWORD });
        expect(blocked.status).toBe(429);
        expect(blocked.body.code).toBe('ACCOUNT_RATE_LIMIT');
        expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
        expect(JSON.stringify(blocked.body)).not.toContain('throttle-a');
        const other = await request(app).post('/api/auth/login').send({ email: 'throttle-b@example.com', password: 'wrong-password' });
        expect(other.status).toBe(401);
    });
});

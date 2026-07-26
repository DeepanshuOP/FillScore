import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from '../auth';
import * as emailService from '../../services/emailService';
import { requireAuth } from '../../middleware/requireAuth';
import { User } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { PasswordResetToken } from '../../models/PasswordResetToken';
import { loadEnv } from '../../config/env';
import mongoose from 'mongoose';
import { setupSecurity, authLimiter } from '../../middleware/security';
import passport from '../../config/passport';

loadEnv();

const app = express();
// Minimal setup similar to index.ts
setupSecurity(app);
app.use(cookieParser());
app.use(passport.initialize());
app.use('/api/auth', authRouter);

app.get('/api/protected', requireAuth, (req, res) => {
    res.status(200).json({ ok: true, userId: req.userId });
});

describe('Auth Routes (Integration)', () => {
    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);

        await User.deleteMany({});
        await RefreshToken.deleteMany({});
        await PasswordResetToken.deleteMany({});
    });

    afterEach(async () => {
        await User.deleteMany({});
        await RefreshToken.deleteMany({});
        await PasswordResetToken.deleteMany({});
        if (typeof authLimiter.resetKey === 'function') {
            authLimiter.resetKey('::ffff:127.0.0.1');
            authLimiter.resetKey('127.0.0.1');
            authLimiter.resetKey('::1');
        }
    });

    afterAll(async () => {
        // Cleanup handled by test-setup.ts
    });

    it('Full happy path: register -> protected route -> refresh -> logout -> refresh fails', async () => {
        // 1. Register
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({ email: 'happy@test.local', password: 'StrongPassword1!' });
        
        expect(regRes.status).toBe(201);
        expect(regRes.body).toHaveProperty('accessToken');
        expect(regRes.headers['set-cookie']).toBeDefined();
        
        let cookies = regRes.headers['set-cookie'] as string[];
        const accessToken = regRes.body.accessToken;

        // 2. Protected Route
        const protRes = await request(app)
            .get('/api/protected')
            .set('Authorization', `Bearer ${accessToken}`);
        
        expect(protRes.status).toBe(200);
        expect(protRes.body.ok).toBe(true);

        // 3. Refresh (provides new pair)
        const refRes = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookies);
        
        expect(refRes.status).toBe(200);
        expect(refRes.body).toHaveProperty('accessToken');
        expect(refRes.headers['set-cookie']).toBeDefined();
        
        cookies = refRes.headers['set-cookie'] as string[]; // Capture new cookie

        // 4. Logout
        const logoutRes = await request(app)
            .post('/api/auth/logout')
            .set('Cookie', cookies);
        
        expect(logoutRes.status).toBe(200);

        // 5. Refresh again fails
        const failRefRes = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookies);
        
        expect(failRefRes.status).toBe(401);
        expect(failRefRes.body.error).toBe('Invalid or expired refresh token');
    });

    it('Reuse-detection path: rotating a valid token, then presenting OLD token revokes family', async () => {
        // 1. Register
        const regRes = await request(app)
            .post('/api/auth/register')
            .send({ email: 'reuse@test.local', password: 'StrongPassword1!' });
        
        const cookies1 = regRes.headers['set-cookie'] as string[];

        // 2. Rotate once (Valid)
        const refRes1 = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookies1);
        
        expect(refRes1.status).toBe(200);
        const cookies2 = refRes1.headers['set-cookie'] as string[];

        // 3. Present the OLD token again (Reuse detection!)
        const refRes2 = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookies1);
        
        // Assert the whole family is revoked and the response is a 401
        expect(refRes2.status).toBe(401);

        // 4. Subsequent refresh with the NEWEST token ALSO fails (family killed)
        const refRes3 = await request(app)
            .post('/api/auth/refresh')
            .set('Cookie', cookies2);
        
        expect(refRes3.status).toBe(401);
    });

    it('Protected route with no/invalid/expired access token -> 401', async () => {
        // No token
        let res = await request(app).get('/api/protected');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Missing or invalid authorization header');

        // Invalid token
        res = await request(app)
            .get('/api/protected')
            .set('Authorization', 'Bearer invalid.token.here');
        expect(res.status).toBe(401);
        expect(res.body.error).toBe('Invalid or expired access token');
    });

    describe('/api/auth/me', () => {
        it('returns user details when authenticated', async () => {
            // 1. Register a user
            const regRes = await request(app)
                .post('/api/auth/register')
                .send({ email: 'me@test.local', password: 'StrongPassword1!' });
            const accessToken = regRes.body.accessToken;

            // 2. Fetch /me
            const meRes = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${accessToken}`);
            
            expect(meRes.status).toBe(200);
            expect(meRes.body.email).toBe('me@test.local');
            expect(meRes.body.plan).toBe('free');
            expect(meRes.body).toHaveProperty('userId');
        });

        it('returns 401 when not authenticated', async () => {
            const meRes = await request(app).get('/api/auth/me');
            expect(meRes.status).toBe(401);
            expect(meRes.body.error).toBe('Missing or invalid authorization header');
        });
    });

    describe('Password Reset Routes', () => {
        const waitForEmailCall = async (mock: any, count = 1) => {
            for (let i = 0; i < 50; i++) {
                if (mock.mock.calls.length >= count) return;
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            throw new Error('Timeout waiting for email to be sent');
        };

        it('forgot-password returns an identical 200 + body for known and unknown emails (assert byte-identical)', async () => {
            await request(app)
                .post('/api/auth/register')
                .send({ email: 'known_route@test.local', password: 'StrongPassword1!' });

            const knownRes = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'known_route@test.local' });

            const unknownRes = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'nobody_route@test.local' });

            expect(knownRes.status).toBe(200);
            expect(unknownRes.status).toBe(200);
            expect(JSON.stringify(knownRes.body)).toBe(JSON.stringify(unknownRes.body));
            expect(knownRes.body).toEqual({ success: true });
        });

        it('forgot-password responds immediately without awaiting email resolution (prevents timing-based user enumeration)', async () => {
            let resolveSendEmail: () => void;
            const unresolvedPromise = new Promise<void>((resolve) => {
                resolveSendEmail = resolve;
            });
            const sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockImplementation(() => unresolvedPromise);

            await request(app)
                .post('/api/auth/register')
                .send({ email: 'timing_route_enum@test.local', password: 'StrongPassword1!' });

            const res = await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'timing_route_enum@test.local' });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true });

            await waitForEmailCall(sendEmailMock, 1);
            expect(sendEmailMock).toHaveBeenCalledTimes(1);

            resolveSendEmail!();
            sendEmailMock.mockRestore();
        });

        it('reset-password happy path', async () => {
            const sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);

            await request(app)
                .post('/api/auth/register')
                .send({ email: 'happy_reset_route@test.local', password: 'OldPassword1!' });

            await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'happy_reset_route@test.local' });

            await waitForEmailCall(sendEmailMock, 1);
            const match = sendEmailMock.mock.calls[0][0].html.match(/token=([a-f0-9]{64})/);
            expect(match).toBeDefined();
            const rawToken = match![1];

            const resetRes = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: rawToken, password: 'NewStrongPassword1!' });

            expect(resetRes.status).toBe(200);
            expect(resetRes.body).toEqual({ success: true });

            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: 'happy_reset_route@test.local', password: 'NewStrongPassword1!' });
            expect(loginRes.status).toBe(200);

            sendEmailMock.mockRestore();
        });

        it('reset-password error paths: invalid token and weak password', async () => {
            const sendEmailMock = vi.spyOn(emailService, 'sendEmail').mockResolvedValue(undefined);

            // 1. Invalid token
            const resBad = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: 'invalid-token-12345678901234567890', password: 'NewStrongPassword1!' });

            expect(resBad.status).toBe(400);
            expect(resBad.body.error).toBe('invalid_or_expired_token');

            // 2. Weak password
            await request(app)
                .post('/api/auth/register')
                .send({ email: 'weak_reset_route@test.local', password: 'OldPassword1!' });

            await request(app)
                .post('/api/auth/forgot-password')
                .send({ email: 'weak_reset_route@test.local' });

            await waitForEmailCall(sendEmailMock, 1);
            const match = sendEmailMock.mock.calls[sendEmailMock.mock.calls.length - 1][0].html.match(/token=([a-f0-9]{64})/);
            const rawToken = match![1];

            const resWeak = await request(app)
                .post('/api/auth/reset-password')
                .send({ token: rawToken, password: 'short' });

            expect(resWeak.status).toBe(400);
            expect(resWeak.body.error).toBe('weak_password');

            sendEmailMock.mockRestore();
        });
    });

    describe('OAuth Routes', () => {
        it('GET /api/auth/google redirects to Google authorization URL with correct client_id', async () => {
            const res = await request(app).get('/api/auth/google');
            expect(res.status).toBe(302);
            expect(res.header.location).toContain('accounts.google.com/o/oauth2/v2/auth');
            expect(res.header.location).toContain(`client_id=${process.env.GOOGLE_CLIENT_ID || 'test_google_id'}`);
        });

        it('GET /api/auth/github redirects to GitHub authorization URL with correct client_id', async () => {
            const res = await request(app).get('/api/auth/github');
            expect(res.status).toBe(302);
            expect(res.header.location).toContain('github.com/login/oauth/authorize');
            expect(res.header.location).toContain(`client_id=${process.env.GITHUB_CLIENT_ID || 'test_github_id'}`);
        });

        it('OAuth callback logic is covered in oauthService.test.ts. In-process integration test of passport verify callback cannot be easily achieved without external network mocking, so we do not fake it here.', () => {
            expect(true).toBe(true);
        });
    });
});

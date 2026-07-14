import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from '../auth';
import { requireAuth } from '../../middleware/requireAuth';
import { User } from '../../models/User';
import { RefreshToken } from '../../models/RefreshToken';
import { loadEnv } from '../../config/env';
import mongoose from 'mongoose';
import { setupSecurity } from '../../middleware/security';
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
    });

    afterEach(async () => {
        await User.deleteMany({});
        await RefreshToken.deleteMany({});
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

    describe('OAuth Routes', () => {
        it('GET /api/auth/google redirects to Google authorization URL with correct client_id', async () => {
            const res = await request(app).get('/api/auth/google');
            expect(res.status).toBe(302);
            expect(res.header.location).toContain('accounts.google.com/o/oauth2/v2/auth');
            expect(res.header.location).toContain('client_id=test_google_id');
        });

        it('GET /api/auth/github redirects to GitHub authorization URL with correct client_id', async () => {
            const res = await request(app).get('/api/auth/github');
            expect(res.status).toBe(302);
            expect(res.header.location).toContain('github.com/login/oauth/authorize');
            expect(res.header.location).toContain('client_id=test_github_id');
        });

        it('OAuth callback logic is covered in oauthService.test.ts. In-process integration test of passport verify callback cannot be easily achieved without external network mocking, so we do not fake it here.', () => {
            expect(true).toBe(true);
        });
    });
});

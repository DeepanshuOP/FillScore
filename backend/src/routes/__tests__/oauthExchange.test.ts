import request from 'supertest';
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { authRouter, handleOAuthCallback } from '../auth';
import { OAuthCode } from '../../models/OAuthCode';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { verifyAccessToken } from '../../utils/jwt';
import { loadEnv } from '../../config/env';

loadEnv();

const TRUSTED_ORIGIN = 'http://localhost:3000';

const app = express();
app.use(express.json());
app.use(cookieParser());
// stands in for the passport callback: attach the identity it would have produced
app.get('/fake-oauth-callback/:userId', async (req, res) => {
    (req as any).user = await issueTokenPair(req.params.userId);
    handleOAuthCallback(req, res);
});
app.use('/api/auth', authRouter);

describe('OAuth callback and code exchange', () => {
    let userId: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const user = await User.create({ email: 'oauth@example.com', emailVerified: true });
        userId = user._id.toString();
    });

    afterEach(async () => {
        await OAuthCode.deleteMany({});
    });

    it('redirects with a one-time code, never an access token, and still sets the refresh cookie', async () => {
        const res = await request(app).get(`/fake-oauth-callback/${userId}`);
        expect(res.status).toBe(302);
        const location = res.headers.location;
        expect(location).not.toContain('accessToken');
        expect(location).not.toMatch(/eyJ[A-Za-z0-9_-]+\./); // no JWT anywhere in the URL
        expect(location).toMatch(/[?&]oauthCode=[a-f0-9]{64}$/);
        expect(res.headers['set-cookie'].join(';')).toContain('refreshToken=');
    });

    it('exchanges the code for an access token exactly once', async () => {
        const redirect = await request(app).get(`/fake-oauth-callback/${userId}`);
        const code = new URL(redirect.headers.location).searchParams.get('oauthCode');

        const first = await request(app)
            .post('/api/auth/oauth/exchange')
            .set('Origin', TRUSTED_ORIGIN)
            .send({ code });
        expect(first.status).toBe(200);
        expect(verifyAccessToken(first.body.accessToken).userId).toBe(userId);

        const replay = await request(app)
            .post('/api/auth/oauth/exchange')
            .set('Origin', TRUSTED_ORIGIN)
            .send({ code });
        expect(replay.status).toBe(401);
        expect(replay.body.error).toBe('invalid_or_expired_code');
    });

    it('rejects a missing or malformed code with 400', async () => {
        for (const body of [{}, { code: 5 }, { code: '' }, { code: { $ne: null } }]) {
            const res = await request(app)
                .post('/api/auth/oauth/exchange')
                .set('Origin', TRUSTED_ORIGIN)
                .send(body);
            expect(res.status).toBe(400);
        }
    });

    it('rejects exchange requests from a foreign origin', async () => {
        const res = await request(app)
            .post('/api/auth/oauth/exchange')
            .set('Origin', 'https://evil.example')
            .send({ code: 'a'.repeat(64) });
        expect(res.status).toBe(403);
    });
});

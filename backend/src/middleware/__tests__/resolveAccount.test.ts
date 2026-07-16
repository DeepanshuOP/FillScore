import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import { resolveAccount } from '../resolveAccount';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env';
import { signAccessToken } from '../../utils/jwt';

const app = express();
app.use(express.json());

// Handler spy to verify downstream does not run
export const testHandlerSpy = vi.fn((req: Request, res: Response) => {
    res.status(200).json({ accountId: req.accountId, isDemo: req.isDemo });
});

// Helper to generate a valid token using the production signer
const generateToken = (userId: string) => {
    return signAccessToken({ userId });
};

// Mount the resolver and a test handler
app.get('/test', resolveAccount, testHandlerSpy);

describe('resolveAccount middleware', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        testHandlerSpy.mockClear();
    });

    const validDemoUsers = [
        'demo-disciplined',
        'demo-moderate',
        'demo-aggressive',
        'demo-bybit',
        'demo-okx',
        'demo-multi'
    ];

    it('Rule 1: Resolves valid demo slug without auth header', async () => {
        for (const demoUser of validDemoUsers) {
            const res = await request(app).get(`/test?userId=${demoUser}`);
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ accountId: demoUser, isDemo: true });
        }
    });

    it('Rule 2: Resolves valid demo slug even with a valid auth header', async () => {
        const token = generateToken('real_user_id');
        const res = await request(app)
            .get('/test?userId=demo-disciplined')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ accountId: 'demo-disciplined', isDemo: true });
    });

    it('Rule 3: Resolves token userId when NO userId param is provided', async () => {
        const token = generateToken('real_user_id');
        const res = await request(app)
            .get('/test')
            .set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ accountId: 'real_user_id', isDemo: false });
    });

    it('Rule 4: Rejects (401) when NO userId param and NO/invalid auth header', async () => {
        // No header
        let res = await request(app).get('/test');
        expect(res.status).toBe(401);

        // Invalid header
        res = await request(app).get('/test').set('Authorization', 'Bearer invalid_token');
        expect(res.status).toBe(401);
    });

    it('Rule 5: Rejects (403) when a non-demo userId param is provided (even with valid token)', async () => {
        const token = generateToken('real_user_id');
        
        // Match token
        let res = await request(app)
            .get('/test?userId=real_user_id')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(testHandlerSpy).not.toHaveBeenCalled();

        testHandlerSpy.mockClear();

        // Don't match token
        res = await request(app)
            .get('/test?userId=another_user_id')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(testHandlerSpy).not.toHaveBeenCalled();
    });

    it('Rule 6: Rejects (403) crafted demo-ish slugs (strict anchored regex/allowlist)', async () => {
        const maliciousSlugs = [
            'demo-../admin',
            'demo-disciplined; drop',
            'DEMO-disciplined',
            'demo-disciplinedX',
            'demo-',
            'demo-unknown'
        ];

        for (const slug of maliciousSlugs) {
            testHandlerSpy.mockClear();
            const res = await request(app).get(`/test?userId=${encodeURIComponent(slug)}`);
            expect(res.status).toBe(403);
            expect(testHandlerSpy).not.toHaveBeenCalled();
        }
    });

    it('Does not throw when request body is undefined (e.g. missing express.json)', async () => {
        const appNoBody = express();
        // Do not use express.json()
        appNoBody.get('/test', resolveAccount, testHandlerSpy);
        
        const res = await request(appNoBody).get('/test');
        expect(res.status).toBe(401);
        expect(testHandlerSpy).not.toHaveBeenCalled();
    });
});

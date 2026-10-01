import request from 'supertest';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Audit } from '../../models/Audit';
import { Trade } from '../../models/Trade';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { loadEnv } from '../../config/env';

loadEnv();
const app = createApp();

// assembled at runtime so this fake value never looks like a real connection string to a scanner
const SECRET = ['mongodb+srv', '://admin:hunter2@cluster0.example.invalid/fillscore'].join('');

describe('500 responses do not echo internal error text', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const failing = () => {
        vi.spyOn(Audit, 'findOne').mockImplementation((() => {
            throw new Error(`connection failed ${SECRET}`);
        }) as any);
        vi.spyOn(Trade, 'find').mockImplementation((() => {
            throw new Error(`connection failed ${SECRET}`);
        }) as any);
        vi.spyOn(console, 'error').mockImplementation(() => {});
    };

    it.each([
        ['GET', '/api/audit?userId=demo-okx'],
        ['GET', '/api/audit/score?userId=demo-okx'],
        ['GET', '/api/audit/coach?userId=demo-okx'],
        ['GET', '/api/audit/analytics/whale-correlation?userId=demo-okx'],
        ['GET', '/api/attribution?userId=demo-okx'],
        ['POST', '/api/audit/run?userId=demo-okx'],
    ])('%s %s answers 500 with a generic body', async (method, url) => {
        failing();
        const res = await (request(app) as any)[method.toLowerCase()](url);
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toContain('hunter2');
        expect(JSON.stringify(res.body)).not.toContain('mongodb');
        expect(typeof res.body.error).toBe('string');
    });
});

describe('whale correlation for real accounts', () => {
    let token: string;

    beforeAll(async () => {
        const user = await User.create({ email: 'whale@example.com', emailVerified: true });
        token = (await issueTokenPair(user._id.toString())).accessToken;
    });

    afterAll(async () => {
        await User.deleteMany({});
        await Trade.deleteMany({});
    });

    it('says it is unavailable instead of returning an empty result that reads as "no whales"', async () => {
        const res = await request(app)
            .get('/api/audit/analytics/whale-correlation')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            available: false,
            reason: 'not_available_for_account',
            symbols: [],
            summaryBySymbol: {},
            trades: [],
        });
    });

    it('still serves the demo accounts, marked available', async () => {
        const res = await request(app).get('/api/audit/analytics/whale-correlation?userId=demo-disciplined');
        expect(res.status).toBe(200);
        expect(res.body.available).toBe(true);
        expect(res.body).toHaveProperty('summaryBySymbol');
    });
});

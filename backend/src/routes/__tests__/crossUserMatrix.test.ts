import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { loadEnv } from '../../config/env';

loadEnv();
const app = createApp();

// endpoint | resolved from. userId query is honoured only for the six demo ids; a real id (own or
// someone else's) is refused with 403; with no userId the account comes from the bearer token.
const GET_ENDPOINTS = [
    '/api/audit/score', '/api/audit/history', '/api/audit/trades', '/api/audit/analytics',
    '/api/audit/analytics/exchange-comparison', '/api/audit/coach', '/api/audit/analytics/whale-correlation',
    '/api/attribution', '/api/audit/report', '/api/audit',
];

describe('cross-user read matrix', () => {
    let tokenA: string;
    let idA: string;
    let idB: string;

    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const a = await User.create({ email: 'matrix-a@example.com', emailVerified: true });
        const b = await User.create({ email: 'matrix-b@example.com', emailVerified: true });
        idA = a._id.toString();
        idB = b._id.toString();
        tokenA = (await issueTokenPair(idA)).accessToken;
    });
    afterAll(async () => { await User.deleteMany({ email: /^matrix-/ }); });

    for (const path of GET_ENDPOINTS) {
        it(`${path}: A asking for B's id -> 403`, async () => {
            const res = await request(app).get(`${path}?userId=${idB}`).set('Authorization', `Bearer ${tokenA}`);
            expect(res.status).toBe(403);
        });
        it(`${path}: a demo id is allowed (never 401/403)`, async () => {
            const res = await request(app).get(`${path}?userId=demo-moderate`).set('Authorization', `Bearer ${tokenA}`);
            expect([401, 403]).not.toContain(res.status);
        });
        it(`${path}: no userId resolves from the token (A's own empty account is 200/404, not 401/403)`, async () => {
            const res = await request(app).get(path).set('Authorization', `Bearer ${tokenA}`);
            expect([401, 403]).not.toContain(res.status);
        });
    }

    it('report: a download token for A cannot be combined with B\'s userId', async () => {
        const res = await request(app).get(`/api/audit/report?userId=${idB}&dl=whatever`);
        expect(res.status).toBe(403);
    });

    it('demo ids are read-only: POST /audit/run with a demo id -> 403', async () => {
        const res = await request(app).post('/api/audit/run?userId=demo-moderate').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(403);
    });
});

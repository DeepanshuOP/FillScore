import request from 'supertest';
import { describe, it, expect, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';

const app = createApp();

describe('audit router mounting and rate limiting', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
    });

    it('serves score only under /api/audit', async () => {
        const canonical = await request(app).get('/api/audit/score?userId=demo-disciplined');
        expect(canonical.status).toBe(404);
        expect(canonical.body.error).toBe('No audit found for this user.');

        const legacy = await request(app).get('/api/score?userId=demo-disciplined');
        expect(legacy.status).toBe(404);
        expect(legacy.body.error).toBeUndefined();
    });

    it.each(['run', 'trades', 'analytics', 'coach', 'report'])(
        'no longer exposes /api/%s outside the audit mount',
        async (name) => {
            const res = await request(app).get(`/api/${name}?userId=demo-disciplined`);
            expect(res.status).toBe(404);
            expect(res.body.error).toBeUndefined();
        }
    );

    it('rate limits POST /api/audit/run harder than reads', async () => {
        const statuses: number[] = [];
        for (let i = 0; i < 12; i++) {
            const res = await request(app).post('/api/audit/run?userId=demo-disciplined');
            statuses.push(res.status);
        }
        expect(statuses.slice(0, 10).every(s => s !== 429)).toBe(true);
        expect(statuses).toContain(429);
    });

    it('lets a dashboard-sized burst of reads through', async () => {
        for (let i = 0; i < 25; i++) {
            const res = await request(app).get('/api/audit/score?userId=demo-moderate');
            expect(res.status).not.toBe(429);
        }
    });
});

import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { AnalyticsDaily, ANALYTICS_EVENTS } from '../../models/AnalyticsDaily';
import { loadEnv } from '../../config/env';

// M5: privacy-safe product analytics. A counter per UTC day and event name, and nothing else: no account id, no IP, no user agent,
// no cookie, no order or trade data. The route is public, so it takes only an allowlisted event name.
loadEnv();
const app = createApp();
const today = () => new Date().toISOString().slice(0, 10);

describe('POST /api/analytics/event', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await AnalyticsDaily.deleteMany({}); });
    afterAll(async () => { await AnalyticsDaily.deleteMany({}); });

    it('counts an allowed event per day: 204, and the count goes up by one each time', async () => {
        const a = await request(app).post('/api/analytics/event').send({ event: 'report_download' });
        expect(a.status).toBe(204);
        await request(app).post('/api/analytics/event').send({ event: 'report_download' });
        const doc = await AnalyticsDaily.findOne({ day: today(), event: 'report_download' }).lean();
        expect(doc!.count).toBe(2);
    });

    it('stores only the day, the event and the count', async () => {
        await request(app).post('/api/analytics/event').set('User-Agent', 'secret-agent/1.0').set('X-Forwarded-For', '203.0.113.9')
            .set('Authorization', 'Bearer some.token.value').send({ event: 'dashboard_view' });
        const raw = await AnalyticsDaily.collection.findOne({ day: today(), event: 'dashboard_view' });
        expect(Object.keys(raw!).sort()).toEqual(['_id', 'count', 'day', 'event']);
        const all = JSON.stringify(await AnalyticsDaily.collection.find({}).toArray());
        for (const s of ['secret-agent', '203.0.113.9', 'some.token']) expect(all).not.toContain(s);
    });

    it('refuses an unknown event, an extra field and a body that is not an object, and counts nothing', async () => {
        const before = await AnalyticsDaily.countDocuments({});
        expect((await request(app).post('/api/analytics/event').send({ event: 'drop table' })).status).toBe(400);
        expect((await request(app).post('/api/analytics/event').send({ event: 'report_download', userId: 'abc' })).status).toBe(400);
        expect((await request(app).post('/api/analytics/event').send({})).status).toBe(400);
        expect((await request(app).post('/api/analytics/event').send({ event: { $ne: 1 } })).status).toBe(400);
        expect(await AnalyticsDaily.countDocuments({})).toBe(before);
    });

    it('keeps one document per day and event even for parallel requests', async () => {
        await Promise.all(Array.from({ length: 10 }, () => request(app).post('/api/analytics/event').send({ event: 'replay_open' })));
        const docs = await AnalyticsDaily.find({ day: today(), event: 'replay_open' }).lean();
        expect(docs).toHaveLength(1);
        expect(docs[0].count).toBe(10);
    });

    it('the allowed events are a fixed list of product actions, none of them about a person', () => {
        expect([...ANALYTICS_EVENTS]).toEqual(['dashboard_view', 'report_download', 'replay_open', 'quick_audit', 'deep_audit', 'evidence_pack_download']);
    });
});

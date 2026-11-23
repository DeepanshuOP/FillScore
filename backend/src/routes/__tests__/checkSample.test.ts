import request from 'supertest';
import express from 'express';
import { describe, it, expect } from 'vitest';
import { createCheckSampleRouter, SAMPLE_PER_IP_PER_HOUR, SAMPLE_PER_DAY, SAMPLE_ACCOUNT } from '../checkSample';
import { resolveTrustProxyHops } from '../../utils/trustProxy';

// A5 (orders of 2026-11-23): "Try the sample file". POST /api/check/sample runs the committed sample broker file through the ml-service's
// check. Open to anyone (no login); 3 an hour per client IP and 200 a day overall; nothing is stored and no file content is read here.
//
// Render sits behind Vercel (two hops, render.yaml TRUST_PROXY_HOPS=2). X-Forwarded-For then reads "<what the client sent>, <client IP as
// Vercel saw it>, <Vercel's IP as Render saw it>"; Express with 2 trusted hops takes the entry 2 from the right as the client, so
// whatever the client puts first cannot start a new count.
const ML_OK = { format: 'kraken', summary: { fills: 24, measured: 24 }, sample: { label: 'Sample file: synthetic fills, real prices' }, stored: false };

function build(opts: { perIp?: number; perDay?: number; fetchImpl?: typeof fetch; configured?: boolean } = {}) {
    const calls: Array<{ url: string; body: string; auth: string }> = [];
    const fetchImpl = opts.fetchImpl ?? (async (url: unknown, init?: RequestInit) => {
        calls.push({ url: String(url), body: String(init?.body), auth: String((init?.headers as Record<string, string>)?.Authorization ?? '') });
        return new Response(JSON.stringify(ML_OK), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    const app = express();
    app.set('trust proxy', resolveTrustProxyHops({ TRUST_PROXY_HOPS: '2' }));
    app.use('/api/check', createCheckSampleRouter({
        perIp: opts.perIp, perDay: opts.perDay, fetchImpl,
        baseUrl: opts.configured === false ? undefined : 'http://ml.test', secret: opts.configured === false ? undefined : 's'.repeat(40),
    }));
    return { app, calls };
}
const post = (app: express.Application, client: string, spoof = '198.51.100.1') =>
    request(app).post('/api/check/sample').set('X-Forwarded-For', `${spoof}, ${client}, 10.0.0.1`);

describe('limits', () => {
    it('the ordered numbers are 3 an hour per IP and 200 a day overall', () => {
        expect(SAMPLE_PER_IP_PER_HOUR).toBe(3)
        expect(SAMPLE_PER_DAY).toBe(200)
    })
    it('hand case, one IP: calls 1 to 3 pass, call 4 is refused; a spoofed first entry starts no new count; another IP still passes', async () => {
        const { app } = build();
        for (let i = 1; i <= 3; i++) expect((await post(app, '203.0.113.7', `192.0.2.${i}`)).status, `call ${i}`).toBe(200);
        const fourth = await post(app, '203.0.113.7', '192.0.2.99');
        expect(fourth.status).toBe(429);
        expect(fourth.body.code).toBe('SAMPLE_IP_LIMIT');
        expect((await post(app, '203.0.113.8')).status).toBe(200);
    });
    it('hand case, overall: with a cap of 5 a day, IP A uses 3 and IP B uses 2, then a new IP C is refused with the day-cap code', async () => {
        const { app } = build({ perDay: 5 });
        for (let i = 0; i < 3; i++) expect((await post(app, '203.0.113.1')).status).toBe(200);
        for (let i = 0; i < 2; i++) expect((await post(app, '203.0.113.2')).status).toBe(200);
        const c = await post(app, '203.0.113.3');
        expect(c.status).toBe(429);
        expect(c.body.code).toBe('SAMPLE_DAY_LIMIT');
    });
    it('an IP refused by its own limit does not use up the overall count', async () => {
        const { app } = build({ perDay: 4, perIp: 3 });
        for (let i = 0; i < 6; i++) await post(app, '203.0.113.1');          // 3 pass, 3 refused by the IP limit
        expect((await post(app, '203.0.113.2')).status).toBe(200);           // 4th overall pass: 3 + 1 = 4 <= 4
        expect((await post(app, '203.0.113.3')).status).toBe(429);           // the 5th is over the day cap
    });
});

describe('a failed check does not use a try (review 2026-11-23)', () => {
    const outcomes = (codes: Array<'fail503' | 'fail502' | 'ok'>) => {
        let i = 0;
        return (async () => {
            const c = codes[Math.min(i++, codes.length - 1)];
            if (c === 'fail502') throw new Error('down');
            return c === 'fail503'
                ? new Response(JSON.stringify({ detail: { code: 'market_data_busy' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })
                : new Response(JSON.stringify(ML_OK), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }) as typeof fetch;
    };
    it('three failures (503, 502, 503) from one IP, then a success: the 4th call is answered, not refused by the limit', async () => {
        const { app } = build({ fetchImpl: outcomes(['fail503', 'fail502', 'fail503', 'ok']) });
        const codes: number[] = [];
        for (let i = 0; i < 4; i++) codes.push((await post(app, '203.0.113.7')).status);
        expect(codes).toEqual([503, 502, 503, 200]);
    });
    it('the same for the overall count: with a cap of 2 a day, two failures leave the cap whole for the next visitor', async () => {
        const { app } = build({ perDay: 2, fetchImpl: outcomes(['fail503', 'fail503', 'ok']) });
        expect([(await post(app, '203.0.113.1')).status, (await post(app, '203.0.113.2')).status]).toEqual([503, 503]);
        expect((await post(app, '203.0.113.3')).status).toBe(200);
    });
    it('a refused call (over the limit) is still refused: failures are not counted, successes are', async () => {
        const { app } = build({ perIp: 3 });
        for (let i = 0; i < 3; i++) expect((await post(app, '203.0.113.7')).status).toBe(200);
        expect((await post(app, '203.0.113.7')).status).toBe(429);
        expect((await post(app, '203.0.113.7')).status).toBe(429);
    });
});

describe('the route', () => {
    it('opens signed out: no token needed, the ml-service is called once with a service token for the sample account and the result is returned as is', async () => {
        const { app, calls } = build();
        const r = await post(app, '203.0.113.7');
        expect(r.status).toBe(200);
        expect(r.body).toEqual(ML_OK);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe('http://ml.test/internal/csv-sample');
        expect(JSON.parse(calls[0].body)).toEqual({ accountId: SAMPLE_ACCOUNT });
        expect(calls[0].auth).toMatch(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    });
    it('not configured: 503 sample_unavailable, nothing called', async () => {
        const { app, calls } = build({ configured: false });
        const r = await post(app, '203.0.113.7');
        expect(r.status).toBe(503);
        expect(r.body.code).toBe('sample_unavailable');
        expect(calls).toHaveLength(0);
    });
    it('a pause from the market-data source passes through with its Retry-After', async () => {
        const fetchImpl = (async () => new Response(JSON.stringify({ detail: { code: 'market_data_busy', message: 'The public market-data source asked for a pause.' } }),
            { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } })) as typeof fetch;
        const { app } = build({ fetchImpl });
        const r = await post(app, '203.0.113.7');
        expect(r.status).toBe(503);
        expect(r.headers['retry-after']).toBe('30');
        expect(r.body).toEqual({ code: 'market_data_busy', message: 'The public market-data source asked for a pause.' });
    });
    it('an unreachable ml-service is a 502 with a plain message and nothing else', async () => {
        const fetchImpl = (async () => { throw new Error('ECONNREFUSED secret-detail'); }) as typeof fetch;
        const { app } = build({ fetchImpl });
        const r = await post(app, '203.0.113.7');
        expect(r.status).toBe(502);
        expect(r.body).toEqual({ code: 'sample_failed', message: 'The sample file could not be checked.' });
    });
});

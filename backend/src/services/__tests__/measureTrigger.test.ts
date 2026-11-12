import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { mintMeasureToken, requestMeasurement, requestScore, MEASURE_TOKEN_TTL_S, mlServiceSecret, mlServiceSecretProblem, resetSecretWarningForTests, callMlInternal } from '../measureTrigger';

const SECRET = 's'.repeat(40);

describe('mlServiceSecret (M1.1: the service token has its own key, fail closed)', () => {
    it('returns ML_SERVICE_TOKEN_SECRET when it is at least 32 characters and differs from JWT_ACCESS_SECRET', () => {
        expect(mlServiceSecret({ ML_SERVICE_TOKEN_SECRET: SECRET, JWT_ACCESS_SECRET: 'other' })).toBe(SECRET);
    });
    it.each([
        ['missing', {}],
        ['empty', { ML_SERVICE_TOKEN_SECRET: '' }],
        ['too short', { ML_SERVICE_TOKEN_SECRET: 'x'.repeat(31) }],
        ['equal to the user-token secret', { ML_SERVICE_TOKEN_SECRET: SECRET, JWT_ACCESS_SECRET: SECRET }],
    ])('is undefined when %s (no fallback to JWT_ACCESS_SECRET)', (_name, env) => {
        expect(mlServiceSecret(env as NodeJS.ProcessEnv)).toBeUndefined();
    });
    it('reports why the secret is unusable, once per process, by key name and reason only (review M1.1-2)', () => {
        expect(mlServiceSecretProblem({})).toBe('missing');
        expect(mlServiceSecretProblem({ ML_SERVICE_TOKEN_SECRET: 'x'.repeat(20) })).toBe('short');
        expect(mlServiceSecretProblem({ ML_SERVICE_TOKEN_SECRET: SECRET, JWT_ACCESS_SECRET: SECRET })).toBe('equals_jwt');
        expect(mlServiceSecretProblem({ ML_SERVICE_TOKEN_SECRET: SECRET })).toBeNull();
        const lines: string[] = [];
        const warn = (m: string) => lines.push(m);
        const env = { ML_SERVICE_URL: 'http://ml', ML_SERVICE_TOKEN_SECRET: 'tooshort-value' } as NodeJS.ProcessEnv;
        resetSecretWarningForTests();
        expect(mlServiceSecret(env, warn)).toBeUndefined();
        expect(mlServiceSecret(env, warn)).toBeUndefined();
        expect(lines).toEqual(['[measure_v2] ML_SERVICE_TOKEN_SECRET unusable (short): measurement and verification are off']);
        expect(lines.join('')).not.toContain('tooshort-value');
        resetSecretWarningForTests();
        mlServiceSecret({ ML_SERVICE_TOKEN_SECRET: '' } as NodeJS.ProcessEnv, warn);    // no ML_SERVICE_URL: nothing configured, no warning
        expect(lines).toHaveLength(1);
    });
    it('without a secret nothing is sent: measurement and scoring skip, a direct call throws', async () => {
        const fetchImpl = (async () => { throw new Error('must not be called'); }) as any;
        expect(await requestMeasurement('acct-1', { baseUrl: 'http://ml', secret: undefined, fetchImpl })).toEqual({ status: 'skipped', calls: 0 });
        expect(await requestScore('acct-1', { baseUrl: 'http://ml', secret: undefined, fetchImpl })).toBe('skipped');
        await expect(callMlInternal('/internal/verify-v2', 'acct-1', { baseUrl: 'http://ml', secret: undefined, fetchImpl })).rejects.toThrow('ml_not_configured');
    });
});
const ok = (body: Record<string, unknown>) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('measure token', () => {
    it('is HS256, typ "measure", carries the account, and lives at most 5 minutes', () => {
        const t = mintMeasureToken('acct-1', SECRET, 1_000_000);
        const p = jwt.verify(t, SECRET, { algorithms: ['HS256'], clockTimestamp: 1_000_000 }) as any;
        expect(p.typ).toBe('measure');
        expect(p.accountId).toBe('acct-1');
        expect(p.iat).toBe(1_000_000);
        expect(p.exp - p.iat).toBe(MEASURE_TOKEN_TTL_S);
        expect(MEASURE_TOKEN_TTL_S).toBeLessThanOrEqual(300);
        expect(p.userId).toBeUndefined();     // never usable as a user token
    });
});

describe('requestScore', () => {
    it('posts to /internal/score-v2, reports a failure without throwing, and skips when unconfigured', async () => {
        const urls: string[] = [];
        const okFetch = (async (url: string) => { urls.push(url); return ok({}); }) as any;
        expect(await requestScore('acct-1', { baseUrl: 'http://ml', secret: SECRET, fetchImpl: okFetch })).toBe('done');
        expect(urls).toEqual(['http://ml/internal/score-v2']);
        const reported: unknown[] = [];
        const bad = (async () => new Response('x', { status: 500 })) as any;
        expect(await requestScore('acct-1', { baseUrl: 'http://ml', secret: SECRET, fetchImpl: bad, report: e => reported.push(e) })).toBe('failed');
        expect(reported).toHaveLength(1);
        expect(await requestScore('acct-1', { baseUrl: undefined, secret: SECRET })).toBe('skipped');
    });
});

describe('requestMeasurement', () => {
    it('skips when no ml-service URL is configured', async () => {
        const r = await requestMeasurement('acct-1', { baseUrl: undefined, secret: SECRET, fetchImpl: (async () => { throw new Error('no'); }) as any });
        expect(r).toEqual({ status: 'skipped', calls: 0 });
    });

    it('calls again while trades stay pending and progress is made, up to the cap', async () => {
        const bodies = [{ measured: 500, pending: 700 }, { measured: 500, pending: 200 }, { measured: 200, pending: 0 }];
        const seen: Array<{ url: string; auth: string; body: any }> = [];
        const fetchImpl = (async (url: string, init: any) => {
            seen.push({ url, auth: init.headers.Authorization, body: JSON.parse(init.body) });
            return ok(bodies[seen.length - 1]);
        }) as any;
        const r = await requestMeasurement('acct-1', { baseUrl: 'http://ml:8000/', secret: SECRET, fetchImpl, sleep: async () => {} });
        expect(r).toEqual({ status: 'done', calls: 3, measured: 1200, pending: 0 });
        expect(seen[0].url).toBe('http://ml:8000/internal/measure');
        expect(seen[0].body).toEqual({ accountId: 'acct-1' });
        expect(seen[0].auth.startsWith('Bearer ')).toBe(true);
    });

    it('stops when a call makes no progress (pending fills that must wait)', async () => {
        let n = 0;
        const fetchImpl = (async () => { n++; return ok({ measured: 0, pending: 3 }); }) as any;
        const r = await requestMeasurement('acct-1', { baseUrl: 'http://ml', secret: SECRET, fetchImpl, sleep: async () => {} });
        expect(n).toBe(1);
        expect(r).toEqual({ status: 'done', calls: 1, measured: 0, pending: 3 });
    });

    it('retries failures with exponential backoff from 30 s, then gives up and reports, never throwing', async () => {
        const sleeps: number[] = [];
        const reported: unknown[] = [];
        const fetchImpl = (async () => new Response('down', { status: 503 })) as any;
        const r = await requestMeasurement('acct-1', {
            baseUrl: 'http://ml', secret: SECRET, fetchImpl, sleep: async ms => { sleeps.push(ms); }, report: e => reported.push(e),
        });
        // 5 attempts: waits 30, 60, 120, 240 s between them
        expect(sleeps).toEqual([30_000, 60_000, 120_000, 240_000]);
        expect(r.status).toBe('dead');
        expect(reported).toHaveLength(1);
    });

    it('recovers after a transient failure', async () => {
        let n = 0;
        const fetchImpl = (async () => (++n === 1 ? new Response('x', { status: 502 }) : ok({ measured: 2, pending: 0 }))) as any;
        const r = await requestMeasurement('acct-1', { baseUrl: 'http://ml', secret: SECRET, fetchImpl, sleep: async () => {} });
        expect(r).toEqual({ status: 'done', calls: 2, measured: 2, pending: 0 });
    });
});

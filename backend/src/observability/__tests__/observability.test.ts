import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { beforeSend, FILTERED } from '../scrub';
import { hashAccountId, requestLog } from '../requestLog';

const event = () => ({
    request: {
        url: 'http://x/api', method: 'POST', data: { apiKey: 'AK', note: 'n' }, cookies: { sid: '1' },
        query_string: 'token=abc',
        headers: { Authorization: 'Bearer abc.def', Cookie: 'sid=1', 'X-Api-Key': 'k', Accept: 'json' },
    },
    user: { email: 'a@b.c', id: 'u' },
    extra: { MONGODB_URI: 'mongodb+srv://u:p@h/db', apiSecret: 'S', passphrase: 'P', msg: 'connect mongodb://u:p@h:1/x failed', n: 3 },
    breadcrumbs: [{ data: { jwtToken: 't', ok: 1 } }],
});

describe('Sentry scrubber', () => {
    it('removes bodies, cookies, auth headers, secret-named fields, exchange payloads, URIs and identity', () => {
        const e: any = beforeSend(event());
        expect(e.request.data).toBeUndefined();
        expect(e.request.cookies).toBeUndefined();
        expect(e.request.query_string).toBeUndefined();
        expect(e.request.headers.Authorization).toBe(FILTERED);
        expect(e.request.headers.Cookie).toBe(FILTERED);
        expect(e.request.headers['X-Api-Key']).toBe(FILTERED);
        expect(e.request.headers.Accept).toBe('json');
        expect(e.user).toBeUndefined();
        expect(e.extra.MONGODB_URI).toBe(FILTERED);
        expect(e.extra.apiSecret).toBe(FILTERED);
        expect(e.extra.passphrase).toBe(FILTERED);
        expect(e.extra.msg).not.toContain('mongodb');
        expect(e.extra.n).toBe(3);
        expect(e.breadcrumbs[0].data).toEqual({ jwtToken: FILTERED, ok: 1 });
    });
});

it('removes URL query strings and emails inside values', () => {
    const e: any = beforeSend({ request: { url: 'http://x/cb?code=abc123' }, msg: 'dup { email: "bob@x.com" }' });
    expect(e.request.url).toBe(`http://x/cb?${FILTERED}`);
    expect(e.msg).not.toContain('bob@x.com');
});

describe('initSentry', () => {
    afterEach(() => { vi.resetModules(); vi.doUnmock('@sentry/node'); });

    it('is skipped without a DSN and configured PII-off with one', async () => {
        const init = vi.fn();
        vi.doMock('@sentry/node', () => ({ init, withScope: vi.fn(), captureException: vi.fn() }));
        const { initSentry } = await import('../sentry');
        expect(initSentry({})).toBe(false);
        expect(init).not.toHaveBeenCalled();
        expect(initSentry({ SENTRY_DSN: 'https://k@o0.ingest.sentry.io/1' })).toBe(true);
        const opts = init.mock.calls[0][0];
        expect(opts.sendDefaultPii).toBe(false);
        expect(opts.beforeSend).toBe(beforeSend);
    });
});

describe('request log', () => {
    it('hashes the account id (12 hex, not the id) and echoes a request id', async () => {
        expect(hashAccountId('acct-1')).toMatch(/^[0-9a-f]{12}$/);
        expect(hashAccountId('acct-1')).not.toContain('acct');
        expect(hashAccountId(undefined)).toBeUndefined();
        const lines: string[] = [];
        const spy = vi.spyOn(console, 'log').mockImplementation((s: string) => { lines.push(s); });
        const app = express();
        app.use(requestLog);
        app.get('/p', (req, res) => { (req as any).accountId = 'acct-1'; res.json({}); });
        const res = await request(app).get('/p').set('x-request-id', 'abcdef123456');
        spy.mockRestore();
        expect(res.headers['x-request-id']).toBe('abcdef123456');
        const rec = JSON.parse(lines.find((l) => l.includes('"msg":"request"'))!);
        expect(rec.requestId).toBe('abcdef123456');
        expect(rec.account).toBe(hashAccountId('acct-1'));
        expect(JSON.stringify(rec)).not.toContain('acct-1');
    });

    it('replaces an unsafe incoming request id', async () => {
        const app = express();
        app.use(requestLog);
        app.get('/p', (_req, res) => res.json({}));
        const res = await request(app).get('/p').set('x-request-id', 'bad id with spaces');
        expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });
});

/**
 * F-17 + F-27 hardening (phase 1a item 1.6):
 *  - the error handler never returns a stack trace or raw error text, whatever NODE_ENV is;
 *  - a deployed process (Render, or the Docker image) refuses to boot unless NODE_ENV=production;
 *  - JWTs are pinned to HS256 and carry a `typ` (access | refresh) that is checked on use;
 *  - ENCRYPTION_KEY must be 64 hex characters (32 bytes for AES-256) at boot.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { loadEnv } from '../env';
import { errorHandler } from '../../middleware/errorHandler';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../../utils/jwt';

const HEX64 = 'ab'.repeat(32);

function validEnv(extra: Record<string, string | undefined> = {}) {
    Object.assign(process.env, {
        MONGODB_URI: 'mongodb://localhost:27017/test', PORT: '3001',
        BINANCE_API_KEY: 'k', BINANCE_API_SECRET: 's', ENCRYPTION_KEY: HEX64,
        JWT_ACCESS_SECRET: 'a', JWT_REFRESH_SECRET: 'r',
        GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', GITHUB_CLIENT_ID: 'h', GITHUB_CLIENT_SECRET: 'h',
        BACKEND_URL: 'https://api.example.com', FRONTEND_URL: 'https://app.example.com',
    });
    for (const [k, v] of Object.entries(extra)) {
        if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
}

describe('boot-time env validation', () => {
    let saved: NodeJS.ProcessEnv;
    beforeEach(() => {
        saved = process.env;
        process.env = { ...saved };
        delete process.env.RENDER; delete process.env.RENDER_SERVICE_ID; delete process.env.FILLSCORE_DEPLOY;
    });
    afterEach(() => { process.env = saved; });

    it('accepts a 64-hex ENCRYPTION_KEY', () => {
        validEnv();
        expect(loadEnv().ENCRYPTION_KEY).toBe(HEX64);
    });

    it.each([
        ['not hex', 'test_enc_key'],
        ['63 hex chars', 'a'.repeat(63)],
        ['65 hex chars', 'a'.repeat(65)],
        ['64 chars with a non-hex char', 'g' + 'a'.repeat(63)],
        ['64 hex chars with surrounding whitespace', ` ${'a'.repeat(64)} `],
    ])('rejects an ENCRYPTION_KEY that is %s, without echoing it', (_label, bad) => {
        validEnv({ ENCRYPTION_KEY: bad });
        expect(() => loadEnv()).toThrowError(/ENCRYPTION_KEY must be 64 hex characters/);
        try { loadEnv(); } catch (e: any) { expect(e.message).not.toContain(bad); }
    });

    it.each([
        ['RENDER', 'true'],
        ['RENDER_SERVICE_ID', 'srv-123'],
        ['FILLSCORE_DEPLOY', '1'],
    ])('a deployed process (%s set) fails fast unless NODE_ENV=production', (marker, value) => {
        validEnv({ [marker]: value, NODE_ENV: 'development' });
        expect(() => loadEnv()).toThrowError(/NODE_ENV must be "production"/);
        validEnv({ [marker]: value, NODE_ENV: undefined });
        expect(() => loadEnv()).toThrowError(/NODE_ENV must be "production"/);
        validEnv({ [marker]: value, NODE_ENV: 'production' });
        expect(() => loadEnv()).not.toThrow();
    });

    it('a local process without deploy markers may run in development', () => {
        validEnv({ NODE_ENV: 'development' });
        expect(() => loadEnv()).not.toThrow();
    });
});

describe('error handler never returns a stack trace', () => {
    const run = (nodeEnv: string | undefined) => {
        const saved = process.env.NODE_ENV;
        if (nodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = nodeEnv;
        const json = vi.fn();
        const res: any = { status: vi.fn(() => res), json };
        vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            errorHandler(new Error('connect ECONNREFUSED mongodb://user:hunter2@db'), {} as any, res, () => {});
        } finally {
            process.env.NODE_ENV = saved;
            vi.restoreAllMocks();
        }
        return { status: res.status.mock.calls[0][0], body: json.mock.calls[0][0] };
    };

    it.each(['development', 'test', 'production', undefined])('NODE_ENV=%s → generic 500 body', (nodeEnv) => {
        const { status, body } = run(nodeEnv);
        expect(status).toBe(500);
        expect(body.stack).toBeUndefined();
        expect(body.error).toBe('Internal server error');
        expect(JSON.stringify(body)).not.toContain('hunter2');
        expect(typeof body.requestId).toBe('string');
    });
});

describe('JWT: HS256 pinned and typ checked', () => {
    // The process env for the test run sets JWT_ACCESS_SECRET=test1, JWT_REFRESH_SECRET=test2.
    const ACCESS = process.env.JWT_ACCESS_SECRET!;
    const REFRESH = process.env.JWT_REFRESH_SECRET!;

    it('access and refresh tokens are HS256 and carry their typ', () => {
        const a = jwt.decode(signAccessToken({ userId: 'u1' }), { complete: true }) as any;
        const r = jwt.decode(signRefreshToken({ userId: 'u1', jti: 'j' }), { complete: true }) as any;
        expect(a.header.alg).toBe('HS256');
        expect(a.payload.typ).toBe('access');
        expect(r.header.alg).toBe('HS256');
        expect(r.payload.typ).toBe('refresh');
    });

    it('round-trips each token type', () => {
        expect(verifyAccessToken(signAccessToken({ userId: 'u1' })).userId).toBe('u1');
        expect(verifyRefreshToken(signRefreshToken({ userId: 'u1', jti: 'j' })).userId).toBe('u1');
    });

    it('rejects a refresh-typ token presented as an access token, even when signed with the access secret', () => {
        const confused = jwt.sign({ userId: 'u1', typ: 'refresh' }, ACCESS, { algorithm: 'HS256', expiresIn: 60 });
        expect(() => verifyAccessToken(confused)).toThrow();
    });

    it('rejects an access-typ token presented as a refresh token, even when signed with the refresh secret', () => {
        const confused = jwt.sign({ userId: 'u1', typ: 'access' }, REFRESH, { algorithm: 'HS256', expiresIn: 60 });
        expect(() => verifyRefreshToken(confused)).toThrow();
    });

    it('rejects a token with no typ', () => {
        expect(() => verifyAccessToken(jwt.sign({ userId: 'u1' }, ACCESS, { algorithm: 'HS256', expiresIn: 60 }))).toThrow();
    });

    it('rejects other algorithms (HS512 with the right secret, and alg=none)', () => {
        const hs512 = jwt.sign({ userId: 'u1', typ: 'access' }, ACCESS, { algorithm: 'HS512', expiresIn: 60 });
        expect(() => verifyAccessToken(hs512)).toThrow();
        const none = jwt.sign({ userId: 'u1', typ: 'access' }, '', { algorithm: 'none' as any });
        expect(() => verifyAccessToken(none)).toThrow();
    });
});

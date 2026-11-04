/**
 * F-07: OAuth login CSRF. The authorize redirect must carry a signed, short-lived `state` bound to an
 * httpOnly nonce cookie, and the callback must refuse a missing or mismatched state BEFORE any code
 * exchange with the provider. Covered for Google and GitHub.
 */
import request from 'supertest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { createApp } from '../../app';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_S, oauthStateKey } from '../../config/oauthState';

const app = createApp();
const SECRET = process.env.JWT_ACCESS_SECRET!;

function startFlow(provider: string) {
    return request(app).get(`/api/auth/${provider}`);
}

function stateFrom(location: string): string {
    return new URL(location).searchParams.get('state') || '';
}

function nonceCookie(res: request.Response): string {
    const raw = ([] as string[]).concat(res.headers['set-cookie'] || []).find(c => c.startsWith(`${OAUTH_STATE_COOKIE}=`));
    return raw ? raw.split(';')[0] : '';
}

describe.each(['google', 'github'])('F-07 OAuth state — %s', (provider) => {
    const other = provider === 'google' ? 'github' : 'google';

    afterEach(() => vi.restoreAllMocks());

    it('the authorize redirect carries a signed 10-minute state bound to an httpOnly nonce cookie', async () => {
        const res = await startFlow(provider);
        expect(res.status).toBe(302);
        const state = stateFrom(res.headers.location);
        expect(state).not.toBe('');

        // signed with a key derived from (not equal to) the access secret, so it is useless as any other token
        expect(() => jwt.verify(state, SECRET)).toThrow();
        const payload = jwt.verify(state, oauthStateKey(), { algorithms: ['HS256'] }) as any;
        expect(payload.typ).toBe('oauth_state');
        expect(payload.provider).toBe(provider);
        expect(payload.exp - payload.iat).toBe(OAUTH_STATE_TTL_S);
        expect(OAUTH_STATE_TTL_S).toBe(600);

        const cookie = ([] as string[]).concat(res.headers['set-cookie']).find(c => c.startsWith(`${OAUTH_STATE_COOKIE}=`))!;
        expect(cookie).toContain('HttpOnly');
        expect(cookie.split(';')[0]).toBe(`${OAUTH_STATE_COOKIE}=${payload.nonce}`);
    });

    it('callback with no state is rejected before any code exchange', async () => {
        const exchange = vi.spyOn((passport as any)._strategy(provider)._oauth2, 'getOAuthAccessToken');
        const res = await request(app).get(`/api/auth/${provider}/callback?code=abc`);
        expect(res.status).toBe(302);
        expect(res.headers.location).toContain('/login?error=invalid_state');
        expect(exchange).not.toHaveBeenCalled();
    });

    it('callback with a valid state but no nonce cookie is rejected', async () => {
        const state = stateFrom((await startFlow(provider)).headers.location);
        const res = await request(app).get(`/api/auth/${provider}/callback?code=abc&state=${encodeURIComponent(state)}`);
        expect(res.headers.location).toContain('/login?error=invalid_state');
    });

    it('callback whose state does not match the browser cookie is rejected', async () => {
        const first = await startFlow(provider);
        const second = await startFlow(provider);
        const res = await request(app)
            .get(`/api/auth/${provider}/callback?code=abc&state=${encodeURIComponent(stateFrom(first.headers.location))}`)
            .set('Cookie', nonceCookie(second));
        expect(res.headers.location).toContain('/login?error=invalid_state');
    });

    it(`a state issued for ${other} is rejected at the ${provider} callback`, async () => {
        const start = await startFlow(other);
        const res = await request(app)
            .get(`/api/auth/${provider}/callback?code=abc&state=${encodeURIComponent(stateFrom(start.headers.location))}`)
            .set('Cookie', nonceCookie(start));
        expect(res.headers.location).toContain('/login?error=invalid_state');
    });

    it('a forged or expired state is rejected', async () => {
        const nonce = 'a'.repeat(64);
        const forged = jwt.sign({ typ: 'oauth_state', provider, nonce }, 'not-the-secret', { expiresIn: 600 });
        const expired = jwt.sign({ typ: 'oauth_state', provider, nonce, iat: Math.floor(Date.now() / 1000) - 700 }, oauthStateKey(), { expiresIn: 600 });
        for (const state of [forged, expired]) {
            const res = await request(app).get(`/api/auth/${provider}/callback?code=abc&state=${state}`)
                .set('Cookie', `${OAUTH_STATE_COOKIE}=${nonce}`);
            expect(res.headers.location).toContain('/login?error=invalid_state');
        }
    });

    it('a matching state and cookie pass the check and reach the code exchange', async () => {
        const exchange = vi.spyOn((passport as any)._strategy(provider)._oauth2, 'getOAuthAccessToken')
            .mockImplementation((_code: any, _params: any, cb: any) => cb({ statusCode: 400, data: 'bad code' }));
        const start = await startFlow(provider);
        const res = await request(app)
            .get(`/api/auth/${provider}/callback?code=abc&state=${encodeURIComponent(stateFrom(start.headers.location))}`)
            .set('Cookie', nonceCookie(start));
        expect(exchange).toHaveBeenCalledTimes(1);
        expect(res.headers.location).not.toContain('invalid_state');
    });
});

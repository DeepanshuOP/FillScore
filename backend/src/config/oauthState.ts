import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request } from 'express';

/**
 * F-07: OAuth `state` against login CSRF, with no server-side session.
 *
 * On the authorize redirect we mint a random nonce, put it in an httpOnly cookie, and send the
 * provider a `state` that is a short-lived HS256 JWT { typ:'oauth_state', provider, nonce }.
 * On the callback the state must verify (signature, expiry, typ, provider) and its nonce must equal
 * the cookie that only the browser which started the flow holds. This runs inside passport's state
 * store, i.e. before the authorization code is exchanged with the provider.
 */
export const OAUTH_STATE_COOKIE = 'oauth_state';
export const OAUTH_STATE_TTL_S = 600;

/**
 * Signing key derived from (never equal to) the access secret, so a state token can never be
 * accepted as an access token by the backend or the ml-service, and the reverse.
 */
export function oauthStateKey(): Buffer {
    return crypto.createHash('sha256').update(`fillscore-oauth-state:${process.env.JWT_ACCESS_SECRET}`).digest();
}
const secret = oauthStateKey;

function cookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const, // the callback is a top-level cross-site GET redirect
        path: '/api/auth',
        maxAge: OAUTH_STATE_TTL_S * 1000,
    };
}

/** A passport-oauth2 state store bound to one provider. */
export class SignedCookieStateStore {
    constructor(private readonly provider: 'google' | 'github') {}

    store(req: Request, _meta: unknown, cb: (err: Error | null, state?: string) => void): void {
        try {
            const nonce = crypto.randomBytes(32).toString('hex');
            const state = jwt.sign({ typ: 'oauth_state', provider: this.provider, nonce }, secret(), {
                algorithm: 'HS256',
                expiresIn: OAUTH_STATE_TTL_S,
            });
            req.res?.cookie(OAUTH_STATE_COOKIE, nonce, cookieOptions());
            cb(null, state);
        } catch (err) {
            cb(err as Error);
        }
    }

    verify(req: Request, providedState: string, _meta: unknown, cb: (err: Error | null, ok: boolean, info?: { message: string }) => void): void {
        const cookieNonce = (req as any).cookies?.[OAUTH_STATE_COOKIE];
        // Single use: whatever happens, the nonce cookie is spent.
        req.res?.clearCookie(OAUTH_STATE_COOKIE, { ...cookieOptions(), maxAge: undefined });
        const fail = () => cb(null, false, { message: 'invalid_state' });

        if (typeof providedState !== 'string' || !providedState || typeof cookieNonce !== 'string' || !cookieNonce) return fail();
        let payload: any;
        try {
            payload = jwt.verify(providedState, secret(), { algorithms: ['HS256'] });
        } catch {
            return fail();
        }
        if (payload?.typ !== 'oauth_state' || payload?.provider !== this.provider || typeof payload?.nonce !== 'string') return fail();
        const a = Buffer.from(payload.nonce);
        const b = Buffer.from(cookieNonce);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail();
        cb(null, true);
    }
}

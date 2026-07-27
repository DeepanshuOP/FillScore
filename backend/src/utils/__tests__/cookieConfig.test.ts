import { describe, it, expect } from 'vitest';
import { getRefreshCookieOptions } from '../cookieConfig';

describe('getRefreshCookieOptions', () => {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    it('returns SameSite=none and Secure=true in production (non-OAuth callback)', () => {
        const opts = getRefreshCookieOptions({ isProduction: true, isOAuthCallback: false });
        expect(opts.sameSite).toBe('none');
        expect(opts.secure).toBe(true);
        expect(opts.httpOnly).toBe(true);
        expect(opts.maxAge).toBe(SEVEN_DAYS_MS);
        expect(opts.path).toBe('/');
        expect(opts.domain).toBeUndefined();
    });

    it('returns SameSite=none and Secure=true in production for OAuth callback', () => {
        const opts = getRefreshCookieOptions({ isProduction: true, isOAuthCallback: true });
        expect(opts.sameSite).toBe('none');
        expect(opts.secure).toBe(true);
        expect(opts.httpOnly).toBe(true);
        expect(opts.maxAge).toBe(SEVEN_DAYS_MS);
        expect(opts.path).toBe('/');
        expect(opts.domain).toBeUndefined();
    });

    it('returns SameSite=lax and Secure=false in development (non-OAuth callback)', () => {
        const opts = getRefreshCookieOptions({ isProduction: false, isOAuthCallback: false });
        expect(opts.sameSite).toBe('lax');
        expect(opts.secure).toBe(false);
        expect(opts.httpOnly).toBe(true);
        expect(opts.maxAge).toBe(SEVEN_DAYS_MS);
        expect(opts.path).toBe('/');
        expect(opts.domain).toBeUndefined();
    });

    it('returns SameSite=lax and Secure=false in development for OAuth callback', () => {
        const opts = getRefreshCookieOptions({ isProduction: false, isOAuthCallback: true });
        expect(opts.sameSite).toBe('lax');
        expect(opts.secure).toBe(false);
        expect(opts.httpOnly).toBe(true);
        expect(opts.maxAge).toBe(SEVEN_DAYS_MS);
        expect(opts.path).toBe('/');
        expect(opts.domain).toBeUndefined();
    });

    it('defaults isOAuthCallback to false when omitted', () => {
        const prodOpts = getRefreshCookieOptions({ isProduction: true });
        expect(prodOpts.sameSite).toBe('none');
        expect(prodOpts.secure).toBe(true);

        const devOpts = getRefreshCookieOptions({ isProduction: false });
        expect(devOpts.sameSite).toBe('lax');
        expect(devOpts.secure).toBe(false);
    });
});

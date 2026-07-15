import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchPrimaryVerifiedEmail } from '../githubEmail';

describe('fetchPrimaryVerifiedEmail', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('1. primary+verified entry present among several -> returns that email, verified true', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { email: 'other@example.com', primary: false, verified: true },
                { email: 'primary@example.com', primary: true, verified: true }
            ]
        } as any);

        const result = await fetchPrimaryVerifiedEmail('dummy-token');
        expect(result).toEqual({ email: 'primary@example.com', verified: true });
    });

    it('2. primary present but verified false -> returns that email, verified false', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { email: 'unverified-primary@example.com', primary: true, verified: false },
                { email: 'other@example.com', primary: false, verified: true }
            ]
        } as any);

        const result = await fetchPrimaryVerifiedEmail('dummy-token');
        expect(result).toEqual({ email: 'unverified-primary@example.com', verified: false });
    });

    it('3. no primary, but one verified entry -> returns it, verified true', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => [
                { email: 'unverified1@example.com', primary: false, verified: false },
                { email: 'verified-noprimary@example.com', primary: false, verified: true }
            ]
        } as any);

        const result = await fetchPrimaryVerifiedEmail('dummy-token');
        expect(result).toEqual({ email: 'verified-noprimary@example.com', verified: true });
    });

    it('4. empty array -> { email: null, verified: false }', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: true,
            json: async () => []
        } as any);

        const result = await fetchPrimaryVerifiedEmail('dummy-token');
        expect(result).toEqual({ email: null, verified: false });
    });

    it('5. 401/403 response -> { email: null, verified: false }, does not throw', async () => {
        vi.mocked(fetch).mockResolvedValueOnce({
            ok: false,
            status: 403
        } as any);

        const result = await fetchPrimaryVerifiedEmail('dummy-token');
        expect(result).toEqual({ email: null, verified: false });
    });

    it('6. network throw -> { email: null, verified: false }, does not throw', async () => {
        vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

        const result = await fetchPrimaryVerifiedEmail('dummy-token');
        expect(result).toEqual({ email: null, verified: false });
    });
});

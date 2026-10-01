import jwt from 'jsonwebtoken';
import { describe, it, expect } from 'vitest';
import { signDownloadToken, verifyDownloadToken, downloadSigningKey, DOWNLOAD_TOKEN_TTL_SECONDS } from '../downloadToken';
import { signAccessToken, verifyAccessToken } from '../jwt';
import { loadEnv } from '../../config/env';

loadEnv();

describe('download tokens', () => {
    it('round-trips the user for the kind it was issued for', () => {
        const token = signDownloadToken('user-1', 'report');
        expect(verifyDownloadToken(token, 'report')).toEqual({ userId: 'user-1' });
    });

    it('lives for 60 seconds', () => {
        expect(DOWNLOAD_TOKEN_TTL_SECONDS).toBe(60);
        const decoded = jwt.decode(signDownloadToken('u', 'export')) as any;
        expect(decoded.exp - decoded.iat).toBe(60);
    });

    it('refuses a token issued for a different download', () => {
        const token = signDownloadToken('user-1', 'report');
        expect(() => verifyDownloadToken(token, 'export')).toThrow();
    });

    it('is not accepted as an access token, and an access token is not accepted as a download token', () => {
        const download = signDownloadToken('user-1', 'report');
        expect(() => verifyAccessToken(download)).toThrow();
        const access = signAccessToken({ userId: 'user-1' });
        expect(() => verifyDownloadToken(access, 'report')).toThrow();
    });

    it('rejects expired, tampered, and garbage tokens', () => {
        const expired = jwt.sign({ userId: 'u', kind: 'report' }, 'wrong-secret', { expiresIn: -10 });
        expect(() => verifyDownloadToken(expired, 'report')).toThrow();

        const good = signDownloadToken('user-1', 'report');
        const tampered = good.slice(0, -4) + 'AAAA';
        expect(() => verifyDownloadToken(tampered, 'report')).toThrow();
        expect(() => verifyDownloadToken('not-a-jwt', 'report')).toThrow();
    });

    it('rejects a correctly signed token that names no user', () => {
        const noUser = jwt.sign({ kind: 'report' }, downloadSigningKey(), { expiresIn: 60 });
        expect(() => verifyDownloadToken(noUser, 'report')).toThrow();
    });
});

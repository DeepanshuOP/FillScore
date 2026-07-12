import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../jwt';
import jwt from 'jsonwebtoken';

describe('JWT Utilities', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = process.env;
        process.env = { ...originalEnv };
        process.env.JWT_ACCESS_SECRET = 'TEST_ACCESS_SECRET_123';
        process.env.JWT_REFRESH_SECRET = 'TEST_REFRESH_SECRET_456';
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it('signs an access token, decodes it, and payload round-trips exactly', () => {
        const payload = { userId: 'test-id-123' };
        const token = signAccessToken(payload);
        
        const decoded = verifyAccessToken(token) as any;
        expect(decoded.userId).toBe('test-id-123');
    });

    it('access token has a 15-minute expiry (iat + 900)', () => {
        const payload = { userId: 'test-id-123' };
        const token = signAccessToken(payload);
        
        const decoded = verifyAccessToken(token) as any;
        expect(decoded.exp).toBeDefined();
        expect(decoded.iat).toBeDefined();
        expect(decoded.exp - decoded.iat).toBe(900);
    });

    it('verifying a token signed with a different secret throws/fails', () => {
        const payload = { userId: 'test-id-123' };
        // Sign with a different secret directly using jsonwebtoken
        const token = jwt.sign(payload, 'WRONG_SECRET');
        
        expect(() => verifyAccessToken(token)).toThrow();
    });

    it('verifying an expired token throws/fails', () => {
        const token = jwt.sign({ userId: 'test-id-123' }, process.env.JWT_ACCESS_SECRET as string, { expiresIn: '-1s' });
        expect(() => verifyAccessToken(token)).toThrow();
    });

    it('access and refresh tokens must use DIFFERENT secrets', () => {
        const payload = { userId: 'test-id-123' };
        const accessToken = signAccessToken(payload);
        const refreshToken = signRefreshToken(payload);

        // Verify with the wrong util
        expect(() => verifyRefreshToken(accessToken)).toThrow();
        expect(() => verifyAccessToken(refreshToken)).toThrow();
    });
});

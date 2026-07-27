import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv, parseAllowedOrigins } from '../env';

describe('Environment Validation', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
        originalEnv = process.env;
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
        // Also clear memoization or module cache if needed, but loadEnv is just a function
    });

    it('1. Returns exactly the configured values when all required vars are valid strings', () => {
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
        process.env.PORT = '3001';
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = 'test_enc_key';
        process.env.JWT_ACCESS_SECRET = 'test_access';
        process.env.JWT_REFRESH_SECRET = 'test_refresh';
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';
        
        const config = loadEnv();
        expect(config.MONGODB_URI).toBe('mongodb://localhost:27017/test');
        expect(config.PORT).toBe('3001');
    });

    it('2. Throws synchronously with missing variable name when a required var is entirely missing', () => {
        delete process.env.MONGODB_URI;
        process.env.PORT = '3001';
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = 'test_enc_key';
        process.env.JWT_ACCESS_SECRET = 'test_access';
        process.env.JWT_REFRESH_SECRET = 'test_refresh';
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';

        expect(() => loadEnv()).toThrowError(/MONGODB_URI/);
    });

    it('3. Throws synchronously with missing variable name when a required var is an empty string', () => {
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
        process.env.PORT = ''; // empty string
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = 'test_enc_key';
        process.env.JWT_ACCESS_SECRET = 'test_access';
        process.env.JWT_REFRESH_SECRET = 'test_refresh';
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';

        expect(() => loadEnv()).toThrowError(/PORT/);
    });

    it('4. Does not throw when only optional vars are missing (currently none are declared, so baseline success)', () => {
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
        process.env.PORT = '3001';
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = 'test_enc_key';
        process.env.JWT_ACCESS_SECRET = 'test_access';
        process.env.JWT_REFRESH_SECRET = 'test_refresh';
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';
        // if optional vars existed, we would unset them here.

        expect(() => loadEnv()).not.toThrow();
    });

    it('5. Thrown error must NEVER contain the actual value of any OTHER still-set env var', () => {
        const secretDecoy = 'SUPER_SECRET_DECOY_VALUE';
        process.env.MONGODB_URI = secretDecoy;
        delete process.env.PORT;
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = 'test_enc_key';
        process.env.JWT_ACCESS_SECRET = 'test_access';
        process.env.JWT_REFRESH_SECRET = 'test_refresh';
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';

        let caughtError: Error | null = null;
        try {
            loadEnv();
        } catch (e) {
            caughtError = e as Error;
        }

        expect(caughtError).not.toBeNull();
        expect(caughtError!.message).not.toContain(secretDecoy);
        expect(caughtError!.message).toContain('PORT');
    });

    it('6. Parses ALLOWED_ORIGINS from a comma-separated string and trims whitespace', () => {
        const parsed = parseAllowedOrigins('http://localhost:3000, https://fillscore.vercel.app , https://test.app ');
        expect(parsed).toEqual([
            'http://localhost:3000',
            'https://fillscore.vercel.app',
            'https://test.app'
        ]);
        expect(parseAllowedOrigins(undefined)).toEqual(['http://localhost:3000']);
    });

    it('7. FRONTEND_URL defaults to http://localhost:3000 when absent and ALLOWED_ORIGINS contains no undefined entries', () => {
        delete process.env.FRONTEND_URL;
        delete process.env.ALLOWED_ORIGINS;
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
        process.env.PORT = '3001';
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = 'test_enc_key';
        process.env.JWT_ACCESS_SECRET = 'test_access';
        process.env.JWT_REFRESH_SECRET = 'test_refresh';
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';

        const config = loadEnv();
        expect(config.FRONTEND_URL).toBe('http://localhost:3000');
        const origins = parseAllowedOrigins(config.ALLOWED_ORIGINS);
        expect(origins).toContain('http://localhost:3000');
        expect(origins.some(o => o.includes('undefined'))).toBe(false);
    });
});

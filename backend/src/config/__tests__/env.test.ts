import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv } from '../env';

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
});

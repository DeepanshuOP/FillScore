import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadEnv, parseAllowedOrigins, REFUSE_SHORT_JWT_SECRET } from '../env';

// 64 hex chars: loadEnv validates the key format at boot since F-27 (phase 1a item 1.6); this
// placeholder used to be 'test_enc_key'.
const TEST_ENC_KEY = 'ab'.repeat(32);

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
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
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

    const baseEnv = () => {
        Object.assign(process.env, {
            MONGODB_URI: 'mongodb://localhost:27017/test', PORT: '3001', ENCRYPTION_KEY: TEST_ENC_KEY,
            JWT_ACCESS_SECRET: 'a'.repeat(40), JWT_REFRESH_SECRET: 'b'.repeat(40),
            GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', GITHUB_CLIENT_ID: 'h', GITHUB_CLIENT_SECRET: 'h',
        });
        delete process.env.BINANCE_API_KEY;
        delete process.env.BINANCE_API_SECRET;
    };

    it('1b. A Binance API key is NOT required to boot: no code path uses one, and requiring it forced a live exchange key into production (security review M9)', () => {
        baseEnv();
        expect(() => loadEnv()).not.toThrow();
    });

    it('1c. A JWT secret shorter than 32 characters is reported once by name and length, never by value', () => {
        baseEnv();
        process.env.JWT_ACCESS_SECRET = 'short-secret-value';
        const warnings: string[] = [];
        loadEnv((m: string) => warnings.push(m));
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain('JWT_ACCESS_SECRET');
        expect(warnings[0]).toContain(String('short-secret-value'.length));
        expect(warnings[0]).not.toContain('short-secret-value');
        const none: string[] = [];
        baseEnv();
        loadEnv((m: string) => none.push(m));
        expect(none).toEqual([]);
    });

    // Item 20 (prepared, not enabled): REFUSE_SHORT_JWT_SECRET is false today; with it true a deployed or production
    // process whose JWT secret is under 32 characters must not boot. Hand values: 'x'.repeat(31) is 31 (refused),
    // 'x'.repeat(32) is 32 (accepted); a test process (NODE_ENV=test) is never refused, because the suite uses short secrets.
    // Enabled 2026-11-19 by Deepanshu's order: both JWT secrets on fillscore-api are 64 characters (checked by export).
    it('1d. The refusal is on (the constant is true): a deployed process with a 31-character secret does not boot', () => {
        expect(REFUSE_SHORT_JWT_SECRET).toBe(true);
        baseEnv();
        process.env.JWT_ACCESS_SECRET = 'x'.repeat(31);
        process.env.NODE_ENV = 'production';
        process.env.BACKEND_URL = 'https://api.example.test';
        process.env.FRONTEND_URL = 'https://app.example.test';
        expect(() => loadEnv(() => undefined)).toThrow(/JWT_ACCESS_SECRET/);
    });

    it('1e. With the refusal on, a deployed process with a 31-character secret stops, naming the key and length only', () => {
        baseEnv();
        process.env.NODE_ENV = 'production';
        process.env.BACKEND_URL = 'https://api.example.test';
        process.env.FRONTEND_URL = 'https://app.example.test';
        process.env.JWT_REFRESH_SECRET = 'y'.repeat(31);
        let message = '';
        try { loadEnv(() => {}, { refuseShortJwtSecret: true }); } catch (e) { message = (e as Error).message; }
        expect(message).toContain('JWT_REFRESH_SECRET');
        expect(message).toContain('31');
        expect(message).not.toContain('y'.repeat(31));
    });

    it('1f. With the refusal on, 32 characters boot and a test process is never refused', () => {
        baseEnv();
        process.env.NODE_ENV = 'production';
        process.env.BACKEND_URL = 'https://api.example.test';
        process.env.FRONTEND_URL = 'https://app.example.test';
        process.env.JWT_ACCESS_SECRET = 'x'.repeat(32);
        process.env.JWT_REFRESH_SECRET = 'y'.repeat(32);
        expect(() => loadEnv(() => {}, { refuseShortJwtSecret: true })).not.toThrow();
        process.env.JWT_ACCESS_SECRET = 'x'.repeat(5);
        process.env.NODE_ENV = 'test';
        expect(() => loadEnv(() => {}, { refuseShortJwtSecret: true })).not.toThrow();
    });

    it('2. Throws synchronously with missing variable name when a required var is entirely missing', () => {
        delete process.env.MONGODB_URI;
        process.env.PORT = '3001';
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
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
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
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
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
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
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
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
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
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

    it('8. Throws naming BACKEND_URL and FRONTEND_URL when NODE_ENV=production and both are unset', () => {
        process.env.NODE_ENV = 'production';
        delete process.env.BACKEND_URL;
        delete process.env.FRONTEND_URL;
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
        process.env.PORT = '3001';
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
        process.env.JWT_ACCESS_SECRET = 'test_access';
        process.env.JWT_REFRESH_SECRET = 'test_refresh';
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';

        expect(() => loadEnv()).toThrowError(/BACKEND_URL/);
        expect(() => loadEnv()).toThrowError(/FRONTEND_URL/);
    });

    it('9. Succeeds with the real values (not localhost defaults) when NODE_ENV=production and both are set', () => {
        process.env.NODE_ENV = 'production';
        process.env.BACKEND_URL = 'https://api.fillscore.example.com';
        process.env.FRONTEND_URL = 'https://fillscore.example.com';
        process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
        process.env.PORT = '3001';
        process.env.BINANCE_API_KEY = 'test_key';
        process.env.BINANCE_API_SECRET = 'test_secret';
        process.env.ENCRYPTION_KEY = TEST_ENC_KEY;
        process.env.JWT_ACCESS_SECRET = 'a'.repeat(64);
        process.env.JWT_REFRESH_SECRET = 'r'.repeat(64);
        process.env.GOOGLE_CLIENT_ID = 'test_google_id';
        process.env.GOOGLE_CLIENT_SECRET = 'test_google_secret';
        process.env.GITHUB_CLIENT_ID = 'test_github_id';
        process.env.GITHUB_CLIENT_SECRET = 'test_github_secret';

        const config = loadEnv();
        expect(config.BACKEND_URL).toBe('https://api.fillscore.example.com');
        expect(config.FRONTEND_URL).toBe('https://fillscore.example.com');
    });
});

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { encryptApiKey, decryptApiKey, isLegacyPayload, ENVELOPE_VERSION, type KeyContext } from '../encryption';
import { loadEnv } from '../../config/env';

loadEnv();

// A versioned envelope binds each ciphertext to (userId, exchange, field) as AES-GCM associated data.
// Hand-computed expectations: version 2 payloads carry v = 2; a payload moved to another account, another exchange or another
// field has different associated data, so the GCM tag check fails (decrypt throws). A payload without v (made before this
// change) used no associated data and still decrypts, and it counts as legacy.
const ctx = (over: Partial<KeyContext> = {}): KeyContext => ({ userId: 'user-A', exchange: 'binance', field: 'apiKey', ...over });

describe('key envelope with associated data', () => {
    it('encrypts to a version 2 payload and decrypts with the same context', () => {
        const p = encryptApiKey('secret-value', ctx());
        expect(p.v).toBe(2);
        expect(ENVELOPE_VERSION).toBe(2);
        expect(isLegacyPayload(p)).toBe(false);
        expect(decryptApiKey(p, ctx())).toBe('secret-value');
    });

    it('a blob moved to another account fails to decrypt', () => {
        const p = encryptApiKey('secret-value', ctx());
        expect(() => decryptApiKey(p, ctx({ userId: 'user-B' }))).toThrow(/Failed to decrypt/);
    });

    it('a blob moved to another exchange fails to decrypt', () => {
        const p = encryptApiKey('secret-value', ctx());
        expect(() => decryptApiKey(p, ctx({ exchange: 'bybit' }))).toThrow(/Failed to decrypt/);
    });

    it('a key blob presented as the secret (another field) fails to decrypt', () => {
        const p = encryptApiKey('secret-value', ctx());
        expect(() => decryptApiKey(p, ctx({ field: 'apiSecret' }))).toThrow(/Failed to decrypt/);
    });

    it('a version 2 payload cannot be read without a context', () => {
        const p = encryptApiKey('secret-value', ctx());
        expect(() => decryptApiKey(p)).toThrow(/Failed to decrypt/);
    });

    it('removing the version marker does not downgrade it: the tag no longer matches', () => {
        const p = encryptApiKey('secret-value', ctx());
        const { v: _v, ...stripped } = p;
        expect(() => decryptApiKey(stripped, ctx())).toThrow(/Failed to decrypt/);
    });

    it('an old blob (no version, no associated data) still decrypts, with any context', () => {
        const old = encryptApiKey('old-secret');   // the form stored before this change
        expect(old.v).toBeUndefined();
        expect(isLegacyPayload(old)).toBe(true);
        expect(decryptApiKey(old, ctx())).toBe('old-secret');
        expect(decryptApiKey(old)).toBe('old-secret');
    });

    it('two encryptions of the same value differ (fresh iv) and the iv is 12 bytes', () => {
        const a = encryptApiKey('same', ctx()), b = encryptApiKey('same', ctx());
        expect(a.iv).not.toBe(b.iv);
        expect(a.iv).toHaveLength(24);
        expect(a.encrypted).not.toBe(b.encrypted);
    });

    it('every production call site passes a context to encryptApiKey', () => {
        const root = path.resolve(__dirname, '../..');
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, f.name);
                if (f.isDirectory()) { if (f.name !== '__tests__') walk(p); continue; }
                if (!p.endsWith('.ts') || p.endsWith('utils/encryption.ts')) continue;
                fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
                    if (/encryptApiKey\(/.test(line) && !/import /.test(line) && !/,\s*\{|,\s*ctx|,\s*keyContext/.test(line)) offenders.push(`${path.relative(root, p)}:${i + 1}`);
                });
            }
        };
        walk(root);
        expect(offenders).toEqual([]);
    });
});

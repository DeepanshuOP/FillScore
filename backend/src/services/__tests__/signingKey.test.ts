import crypto from 'crypto';
import { describe, it, expect, vi } from 'vitest';
import { normaliseSigningKey, diagnoseSigningKey, logSigningKeyStatus } from '../signingKey';

const { privateKey } = crypto.generateKeyPairSync('ed25519');
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string; // real multi-line PEM, with BEGIN/END lines
const oneLine = pem.trim().split('\n').join('\\n'); // the form typed into a dashboard: literal backslash-n
const bodyOnly = pem.trim().split('\n').filter((l) => !l.startsWith('-----')).join(''); // the Render mistake of 2026-11-18

describe('signing key loading', () => {
    it('loads the real multi-line form', () => {
        const d = diagnoseSigningKey(pem);
        expect(d.usable).toBe(true);
        expect(d.present).toBe(true);
        expect(d.hasBeginEnd).toBe(true);
        expect(d.errorClass).toBeNull();
    });
    it('loads the one-line \\n form to the same key', () => {
        expect(diagnoseSigningKey(oneLine).usable).toBe(true);
        expect(normaliseSigningKey(oneLine)).toBe(pem.trim());
    });
    it('a body without BEGIN/END lines is reported, not thrown', () => {
        const d = diagnoseSigningKey(bodyOnly);
        expect(d.present).toBe(true);
        expect(d.usable).toBe(false);
        expect(d.hasBeginEnd).toBe(false);
        expect(typeof d.errorClass).toBe('string');
        expect(d.length).toBe(bodyOnly.length);
    });
    it('absent and empty values are "present: no"', () => {
        expect(diagnoseSigningKey(undefined).present).toBe(false);
        expect(diagnoseSigningKey('   ').present).toBe(false);
    });
    it('the startup line states present, length, BEGIN/END and error class, and never the value', () => {
        const lines: string[] = [];
        const log = vi.fn((s: string) => { lines.push(s); });
        logSigningKeyStatus(bodyOnly, log);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('present=yes');
        expect(lines[0]).toContain(`length=${bodyOnly.length}`);
        expect(lines[0]).toContain('pem_lines=no');
        expect(lines[0]).toMatch(/error_class=\w+/);
        expect(lines[0]).not.toContain(bodyOnly.slice(0, 20));
    });
    it('logs nothing for a usable key and one line when the key is absent', () => {
        const log = vi.fn();
        logSigningKeyStatus(pem, log);
        expect(log).not.toHaveBeenCalled();
        logSigningKeyStatus(undefined, log);
        expect(log).toHaveBeenCalledTimes(1);
        expect(log.mock.calls[0][0]).toContain('present=no');
    });
});

import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { canonicalJson, buildPack, verifyPack, publicKeyFingerprint } from '../evidencePack';
import { findAdviceTerms, findConnectiveTerms } from '../../constants/adviceTerms';

// M5 §1: a signed evidence pack. The manifest lists every file with its SHA-256 and is signed with Ed25519, so anyone with the
// published public key can check that neither a file nor the manifest was changed after FillScore produced it.
// Known vector: SHA-256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad (FIPS 180-2, appendix B.1).
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const keys = () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, pub: publicKey.export({ type: 'spki', format: 'pem' }) as string };
};
const META = { kind: 'scorecard', account: 'a1b2c3d4e5f60718', scoring: { version: 'v2.3.0', integrityHash: 'f'.repeat(64) } };
const AT = '2026-11-17T12:00:00.000Z';

describe('canonicalJson', () => {
    it('sorts keys at every level and writes no spaces', () => {
        expect(canonicalJson({ b: 1, a: [{ d: 2, c: 1 }] })).toBe('{"a":[{"c":1,"d":2}],"b":1}');
    });
    it('keeps array order, null and strings', () => {
        expect(canonicalJson({ z: [3, 1, 2], y: null, x: 'é"' })).toBe('{"x":"é\\"","y":null,"z":[3,1,2]}');
    });
});

describe('buildPack', () => {
    const k = keys();
    it('lists each file with its byte size and SHA-256, in name order', () => {
        const p = buildPack({ meta: META, generatedAt: AT, files: { 'b.txt': 'abc', 'a.txt': 'abc' } }, k.priv);
        expect(p.manifest.files).toEqual([{ name: 'a.txt', bytes: 3, sha256: ABC }, { name: 'b.txt', bytes: 3, sha256: ABC }]);
        expect(p.manifest.packVersion).toBe('1.0.0');
        expect(p.manifest.generatedAt).toBe(AT);
        expect(p.manifest.meta).toEqual(META);
        expect(p.manifest.signedBy).toBe(publicKeyFingerprint(k.pub));
        expect(p.manifest.signedBy).toMatch(/^[0-9a-f]{16}$/);
    });
    it('carries the public key and a base64 signature; Ed25519 is deterministic, so the same input gives the same pack', () => {
        const a = buildPack({ meta: META, generatedAt: AT, files: { 'a.txt': 'abc' } }, k.priv);
        const b = buildPack({ meta: META, generatedAt: AT, files: { 'a.txt': 'abc' } }, k.priv);
        expect(a.signature).toBe(b.signature);
        expect(a.publicKeyPem.trim()).toBe(k.pub.trim());
        expect(Buffer.from(a.signature, 'base64')).toHaveLength(64);
    });
    it('refuses to sign without a key (never writes an unsigned pack that looks signed)', () => {
        expect(() => buildPack({ meta: META, generatedAt: AT, files: { 'a.txt': 'abc' } }, '')).toThrow(/signing key/i);
    });
});

describe('verifyPack', () => {
    const k = keys();
    const files = { 'a.txt': 'abc', 'orders.json': '{"n":1}' };
    const pack = buildPack({ meta: META, generatedAt: AT, files }, k.priv);

    it('accepts an untouched pack', () => {
        expect(verifyPack(pack, files)).toEqual({ valid: true, problems: [], signedBy: publicKeyFingerprint(k.pub) });
    });
    it('a changed file is named', () => {
        const r = verifyPack(pack, { ...files, 'a.txt': 'abd' });
        expect(r.valid).toBe(false);
        expect(r.problems).toEqual(['a.txt: the file does not match the SHA-256 in the manifest']);
    });
    it('a missing file and an extra file are both named', () => {
        const r = verifyPack(pack, { 'a.txt': 'abc', 'extra.txt': 'x' });
        expect(r.valid).toBe(false);
        expect(r.problems).toContain('orders.json: listed in the manifest but not supplied');
        expect(r.problems).toContain('extra.txt: supplied but not listed in the manifest');
    });
    it('a changed manifest breaks the signature', () => {
        const forged = { ...pack, manifest: { ...pack.manifest, meta: { ...META, kind: 'something else' } } };
        const r = verifyPack(forged, files);
        expect(r.valid).toBe(false);
        expect(r.problems).toContain('the signature does not match the manifest');
    });
    it('a pack signed by another key does not match the trusted key', () => {
        const other = keys();
        const foreign = buildPack({ meta: META, generatedAt: AT, files }, other.priv);
        expect(verifyPack(foreign, files).valid).toBe(true);                                   // internally consistent...
        const r = verifyPack(foreign, files, k.pub);                                           // ...but not by the key we trust
        expect(r.valid).toBe(false);
        expect(r.problems).toContain('the pack was not signed by the trusted key');
    });
    it('a manifest whose signedBy names another key is rejected', () => {
        const swapped = { ...pack, publicKeyPem: keys().pub };
        const r = verifyPack(swapped, files);
        expect(r.valid).toBe(false);
        expect(r.problems.length).toBeGreaterThan(0);
    });
    it('garbage in the signature or the key is a problem, never a crash', () => {
        expect(verifyPack({ ...pack, signature: '!!!' }, files).valid).toBe(false);
        expect(verifyPack({ ...pack, publicKeyPem: 'not a key' }, files).valid).toBe(false);
    });
    it('a manifest that lists names like "constructor" or "toString" does not crash the check (review finding 6)', () => {
        const hostile = { ...pack, manifest: { ...pack.manifest, files: [...pack.manifest.files, { name: 'constructor', bytes: 1, sha256: 'a'.repeat(64) },
            { name: 'toString', bytes: 1, sha256: 'b'.repeat(64) }, { name: '__proto__', bytes: 1, sha256: 'c'.repeat(64) }] } };
        let r: ReturnType<typeof verifyPack> | undefined;
        expect(() => { r = verifyPack(hostile, files); }).not.toThrow();
        expect(r!.valid).toBe(false);
        expect(r!.problems).toContain('constructor: listed in the manifest but not supplied');
        expect(r!.problems).toContain('toString: listed in the manifest but not supplied');
        expect(r!.problems).toContain('__proto__: listed in the manifest but not supplied');
    });
    it('the size in the manifest must be the size of the file (it is signed, so it must also be true)', () => {
        const wrong = { ...pack, manifest: { ...pack.manifest, files: pack.manifest.files.map(f => (f.name === 'a.txt' ? { ...f, bytes: 999 } : f)) } };
        const r = verifyPack(wrong, files);
        expect(r.valid).toBe(false);
        expect(r.problems).toContain('a.txt: the size in the manifest (999 bytes) is not the size of the file (3 bytes)');
    });
    it('uses the same rule for a file given as bytes', () => {
        expect(verifyPack(pack, { 'a.txt': Buffer.from('abc'), 'orders.json': Buffer.from('{"n":1}') }).valid).toBe(true);
    });
});

describe('the words of the pack', () => {
    it('its limits statement is past tense, supports documentation and never claims compliance', () => {
        const p = buildPack({ meta: META, generatedAt: AT, files: { 'a.txt': 'abc' } }, keys().priv);
        const text = p.manifest.statement;
        expect(text).toMatch(/supports/i);
        expect(text).not.toMatch(/complian|certif|guarantee/i);
        expect(findAdviceTerms(text)).toEqual([]);
        expect(findConnectiveTerms(text)).toEqual([]);
    });
});

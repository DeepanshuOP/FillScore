// @vitest-environment node
/**
 * Client-side check of a signed evidence pack (WebCrypto Ed25519, pinned @noble/ed25519 as the fallback). The pack never leaves
 * the browser: the tests fail the run if `fetch` is called.
 *
 * Fixture `__fixtures__/evidence-pack.json`: a real pack of the shape backend/src/services/evidencePack.ts writes, signed with a
 * throwaway key that was generated for it and discarded (its public key is `pack.publicKeyPem` in the file, fingerprint 993a80b17c57a4ad).
 * It was checked with the independent offline script before it was committed:
 *   node scripts/verify_evidence_pack.mjs evidence-pack.json --key <that public key as a .pem file>   -> VALID, exit 0
 *   node scripts/verify_evidence_pack.mjs evidence-pack.json                                 -> CONSISTENT, exit 3
 * Its two files are 2 (scorecard.json, 63-ish bytes of JSON) and limits.txt, which holds non-ASCII text on purpose, so that
 * sizes are checked in UTF-8 bytes (the server counts bytes, not characters).
 *
 * RFC 8032 section 7.1, TEST 1 (https://www.rfc-editor.org/rfc/rfc8032#section-7.1) is the cited vector for the raw verify.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import fixture from './__fixtures__/evidence-pack.json';
import { verifyEvidencePack, verifyEd25519 } from './evidenceVerify';

// The trusted key: the public key of the fixture's throwaway key, as a PEM (the fingerprint form is tested separately).
const PUB_PEM = fixture.pack.publicKeyPem;
const FP = '993a80b17c57a4ad';
const clone = () => JSON.parse(JSON.stringify(fixture));
const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

afterEach(() => vi.restoreAllMocks());

describe('Ed25519 verify (RFC 8032 TEST 1)', () => {
  const pk = hex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a');
  const sig = hex('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155' + '5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b');
  const msg = new Uint8Array(0);
  for (const forceFallback of [false, true]) {
    it(`${forceFallback ? 'noble fallback' : 'WebCrypto'}: the vector verifies, a changed message or signature does not`, async () => {
      const ok = await verifyEd25519(pk, msg, sig, { forceFallback });
      expect(ok).toEqual({ valid: true, engine: forceFallback ? 'noble' : 'webcrypto' });
      expect((await verifyEd25519(pk, new Uint8Array([0]), sig, { forceFallback })).valid).toBe(false);
      const bad = sig.slice(); bad[10] ^= 1;
      expect((await verifyEd25519(pk, msg, bad, { forceFallback })).valid).toBe(false);
    });
  }
  it('falls back to noble when this browser has no Ed25519 in WebCrypto', async () => {
    vi.spyOn(globalThis.crypto.subtle, 'importKey').mockRejectedValue(new DOMException('Unrecognized name', 'NotSupportedError'));
    expect(await verifyEd25519(pk, msg, sig)).toEqual({ valid: true, engine: 'noble' });
  });
});

describe('verifyEvidencePack', () => {
  const noUpload = () => vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('the pack must not be uploaded'));

  for (const forceFallback of [false, true]) {
    it(`valid with the trusted key (${forceFallback ? 'noble' : 'WebCrypto'}); nothing is sent anywhere`, async () => {
      const f = noUpload();
      const r = await verifyEvidencePack(clone(), { trustedKey: PUB_PEM, forceFallback });
      expect(r).toMatchObject({ status: 'valid', problems: [], signedBy: FP, fileCount: 2, engine: forceFallback ? 'noble' : 'webcrypto' });
      expect(f).not.toHaveBeenCalled();
    });
  }

  it('without a trusted key the answer is "consistent" and says it shows no origin', async () => {
    const r = await verifyEvidencePack(clone());
    expect(r.status).toBe('consistent');
    expect(r.signedBy).toBe(FP);
    expect(r.message).toMatch(/does not show/i);
  });

  it('a trusted key can be given as its 16-character fingerprint', async () => {
    expect((await verifyEvidencePack(clone(), { trustedKey: FP })).status).toBe('valid');
    expect((await verifyEvidencePack(clone(), { trustedKey: FP.toUpperCase() })).status).toBe('valid');
    const wrong = await verifyEvidencePack(clone(), { trustedKey: 'ba11aa53c4961be4' });
    expect(wrong.status).toBe('invalid');
    expect(wrong.problems).toContain('the pack was not signed by the trusted key');
  });

  it('a changed file is named', async () => {
    const d = clone(); d.files['scorecard.json'] = d.files['scorecard.json'].replace('"A"', '"B"');
    const r = await verifyEvidencePack(d, { trustedKey: FP });
    expect(r.status).toBe('invalid');
    expect(r.problems).toContain('scorecard.json: the file does not match the SHA-256 in the manifest');
  });

  it('a changed manifest breaks the signature', async () => {
    const d = clone(); d.pack.manifest.meta.kind = 'best-execution';
    const r = await verifyEvidencePack(d, { trustedKey: FP });
    expect(r.status).toBe('invalid');
    expect(r.problems).toContain('the signature does not match the manifest');
  });

  it('a manifest size that is not the byte size of the file is reported (UTF-8 bytes, not characters)', async () => {
    const d = clone(); d.files['limits.txt'] += ' ';   // one more byte, so both the hash and the size differ
    const r = await verifyEvidencePack(d, { trustedKey: FP });
    expect(r.problems.some((p: string) => p.startsWith('limits.txt: the size in the manifest'))).toBe(true);
  });

  it('missing, extra and prototype-named files', async () => {
    const d = clone(); delete d.files['limits.txt']; d.files['extra.txt'] = 'x'; d.files['__proto__x'] = 'y';
    const r = await verifyEvidencePack(d, { trustedKey: FP });
    expect(r.problems).toContain('limits.txt: listed in the manifest but not supplied');
    expect(r.problems).toContain('extra.txt: supplied but not listed in the manifest');
    expect(r.problems).toContain('__proto__x: supplied but not listed in the manifest');
    const p = clone(); p.pack.manifest.files.push({ name: 'constructor', bytes: 0, sha256: '' });
    expect((await verifyEvidencePack(p, { trustedKey: FP })).problems).toContain('constructor: listed in the manifest but not supplied');
  });

  it('a manifest that names another signing key than the one in the pack is reported', async () => {
    const d = clone(); d.pack.manifest.signedBy = 'ba11aa53c4961be4';
    const r = await verifyEvidencePack(d, { trustedKey: FP });
    expect(r.problems).toContain('the manifest names a different signing key than the key in the pack');
  });

  it('an unreadable key or signature is a problem, never a crash', async () => {
    const d = clone(); d.pack.publicKeyPem = '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----';
    const r = await verifyEvidencePack(d);
    expect(r.status).toBe('invalid');
    expect(r.problems).toContain('the public key or the signature could not be read');
    const s = clone(); s.pack.signature = '!!not base64!!';
    expect((await verifyEvidencePack(s)).status).toBe('invalid');
  });

  it('a key that is not an Ed25519 key is refused', async () => {
    const d = clone();
    // an RSA-style SPKI header instead of the Ed25519 one
    d.pack.publicKeyPem = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VuAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=\n-----END PUBLIC KEY-----';   // X25519
    const r = await verifyEvidencePack(d);
    expect(r.status).toBe('invalid');
  });

  it('input that is not a pack is "unreadable", with what was expected', async () => {
    for (const bad of [null, 5, 'text', {}, { pack: {}, files: {} }, { pack: { manifest: {}, signature: 1, publicKeyPem: '' }, files: {} }]) {
      const r = await verifyEvidencePack(bad);
      expect(r.status).toBe('unreadable');
      expect(r.message).toMatch(/pack/);
    }
  });
});

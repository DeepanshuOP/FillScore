/**
 * Check a signed FillScore evidence pack in the browser. Nothing is uploaded: this module makes no network call.
 *
 * Same rules as scripts/verify_evidence_pack.mjs and backend/src/services/evidencePack.ts: canonical JSON of the manifest
 * (keys sorted at every level, no spaces), an Ed25519 signature over its UTF-8 bytes, every file's SHA-256 and byte size,
 * no missing or extra file, and, with a trusted key, the key you got from a source you trust.
 *
 * Ed25519 comes from WebCrypto where the browser has it. Where it does not (older Firefox and Safari raise
 * NotSupportedError), the pinned MIT library @noble/ed25519 3.2.0 verifies instead (strict branch, zip215: false; its SHA-512
 * is WebCrypto's). SHA-256 is always WebCrypto's, which needs a secure page (https or localhost).
 */
import * as noble from '@noble/ed25519';

export type Engine = 'webcrypto' | 'noble';
export type Status = 'valid' | 'consistent' | 'invalid' | 'unreadable';
export interface VerifyResult { status: Status; message: string; problems: string[]; signedBy: string | null; fileCount: number; engine: Engine | null }
export interface VerifyOptions { trustedKey?: string; forceFallback?: boolean }

const enc = new TextEncoder();
// DER prefix of an Ed25519 SubjectPublicKeyInfo (RFC 8410): SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING (32 bytes) }
const SPKI_PREFIX = Uint8Array.from([0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00]);

export function canonicalJson(v: unknown): string {
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(sort);
    if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, sort((x as Record<string, unknown>)[k])]));
    return x;
  };
  return JSON.stringify(sort(v));
}

const toHex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer), (x) => x.toString(16).padStart(2, '0')).join('');
const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('no-subtle');
  return s;
};
const sha256Hex = async (data: Uint8Array) => toHex(await subtle().digest('SHA-256', data as BufferSource));

/** Base64 (standard alphabet) to bytes; throws on anything that is not base64. */
function b64(s: string): Uint8Array {
  if (!/^[A-Za-z0-9+/\s]*={0,2}\s*$/.test(s)) throw new Error('not base64');
  const bin = atob(s.replace(/\s+/g, ''));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** The 32-byte public key inside a PEM SPKI Ed25519 key, and the fingerprint (first 16 hex characters of the SHA-256 of the DER). */
async function readPublicKey(pem: string): Promise<{ raw: Uint8Array; fingerprint: string }> {
  const m = /-----BEGIN PUBLIC KEY-----([\s\S]*?)-----END PUBLIC KEY-----/.exec(pem);
  if (!m) throw new Error('no PEM');
  const der = b64(m[1]);
  if (der.length !== SPKI_PREFIX.length + 32 || !SPKI_PREFIX.every((v, i) => der[i] === v)) throw new Error('not an Ed25519 key');
  return { raw: der.slice(SPKI_PREFIX.length), fingerprint: (await sha256Hex(der)).slice(0, 16) };
}

/** Verify one Ed25519 signature. Returns which engine decided. A malformed input is "not valid", never a throw. */
export async function verifyEd25519(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array, opts: { forceFallback?: boolean } = {}): Promise<{ valid: boolean; engine: Engine }> {
  if (!opts.forceFallback) {
    let key: CryptoKey | null = null;
    try {
      key = await subtle().importKey('raw', publicKey as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    } catch { /* this browser has no Ed25519 in WebCrypto: use the fallback below */ }
    if (key) {
      try { return { valid: await subtle().verify({ name: 'Ed25519' }, key, signature as BufferSource, message as BufferSource), engine: 'webcrypto' }; }
      catch { return { valid: false, engine: 'webcrypto' }; }
    }
  }
  try { return { valid: await noble.verifyAsync(signature, message, publicKey, { zip215: false }), engine: 'noble' }; }
  catch { return { valid: false, engine: 'noble' }; }
}

const unreadable = (message: string): VerifyResult => ({ status: 'unreadable', message, problems: [], signedBy: null, fileCount: 0, engine: null });
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);

/** `input` is the parsed JSON of a pack download: { pack: { manifest, signature, publicKeyPem }, files: { name: text } }. */
export async function verifyEvidencePack(input: unknown, opts: VerifyOptions = {}): Promise<VerifyResult> {
  const expected = 'the input is not an evidence pack: expected { pack: { manifest, signature, publicKeyPem }, files }';
  if (!isObj(input) || !isObj(input.pack) || !isObj(input.files)) return unreadable(expected);
  const { pack, files } = input as { pack: Record<string, unknown>; files: Record<string, unknown> };
  if (!isObj(pack.manifest) || typeof pack.signature !== 'string' || typeof pack.publicKeyPem !== 'string' || !Array.isArray(pack.manifest.files)) return unreadable(expected);
  if (Object.values(files).some((v) => typeof v !== 'string')) return unreadable('the input is not an evidence pack: every file must be text');
  if (!globalThis.crypto?.subtle) return unreadable('this page cannot compute SHA-256 here: open it over https (or localhost)');

  const manifest = pack.manifest as { files: Array<{ name: string; bytes: number; sha256: string }>; signedBy?: string };
  const problems: string[] = [];
  let signedBy: string | null = null;
  let engine: Engine | null = null;
  try {
    const k = await readPublicKey(pack.publicKeyPem);
    signedBy = k.fingerprint;
    const r = await verifyEd25519(k.raw, enc.encode(canonicalJson(pack.manifest)), b64(pack.signature), opts);
    engine = r.engine;
    if (!r.valid) problems.push('the signature does not match the manifest');
    if (manifest.signedBy !== signedBy) problems.push('the manifest names a different signing key than the key in the pack');
    if (opts.trustedKey?.trim()) {
      const t = opts.trustedKey.trim();
      const trustedFp = /^[0-9a-fA-F]{16}$/.test(t) ? t.toLowerCase() : (await readPublicKey(t)).fingerprint;
      if (trustedFp !== signedBy) problems.push('the pack was not signed by the trusted key');
    }
  } catch {
    problems.push('the public key or the signature could not be read');
  }

  const listed = new Set<string>();
  for (const f of manifest.files) {
    listed.add(f.name);
    // own properties only: a manifest may name "constructor" or "__proto__"
    if (!Object.prototype.hasOwnProperty.call(files, f.name)) { problems.push(`${f.name}: listed in the manifest but not supplied`); continue; }
    const bytes = enc.encode(files[f.name] as string);
    if ((await sha256Hex(bytes)) !== f.sha256) problems.push(`${f.name}: the file does not match the SHA-256 in the manifest`);
    if (bytes.length !== f.bytes) problems.push(`${f.name}: the size in the manifest (${f.bytes} bytes) is not the size of the file (${bytes.length} bytes)`);
  }
  for (const name of Object.keys(files)) if (!listed.has(name)) problems.push(`${name}: supplied but not listed in the manifest`);

  const fileCount = listed.size;
  if (problems.length > 0) return { status: 'invalid', message: 'Not valid. At least one check failed.', problems, signedBy, fileCount, engine };
  if (opts.trustedKey?.trim()) {
    return { status: 'valid', message: `Valid. ${fileCount} files match the manifest, and it was signed by the trusted key ${signedBy}.`, problems, signedBy, fileCount, engine };
  }
  return {
    status: 'consistent', problems, signedBy, fileCount, engine,
    message: `Consistent. ${fileCount} files match the manifest and the signature fits the key ${signedBy}, but the key was not compared with a trusted one. `
      + 'Anyone can make a pack that is consistent with their own key, so this does not show that it came from FillScore.',
  };
}

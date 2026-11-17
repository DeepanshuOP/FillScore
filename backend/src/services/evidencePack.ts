/**
 * Signed evidence pack (M5 §1). A manifest lists every file of the pack with its byte size and SHA-256 and is signed with
 * Ed25519 (Node `crypto`, RFC 8032), so anyone holding the published public key can check that neither a file nor the
 * manifest changed after FillScore produced it. The pack holds measurements of past executions and the public market data
 * they used; it supports the user's own documentation. It says what was measured and nothing about rules or what to do.
 *
 * The signing key comes from the environment (a secret, never in the repository); without one, building a pack fails
 * loudly rather than writing a pack that only looks signed.
 */
import crypto from 'crypto';

export const PACK_VERSION = '1.0.0';
export const PACK_STATEMENT = 'This pack lists the measurements FillScore made of past executions and the public market data they used, each file with its SHA-256. '
    + 'It supports your own documentation of execution quality. It states what was measured, makes no statement about rules or regulation, and contains no advice.';

export type FileBytes = string | Buffer;

/** JSON with keys sorted at every level and no spaces: the byte string that is hashed and signed. */
export function canonicalJson(v: unknown): string {
    const sort = (x: unknown): unknown => {
        if (Array.isArray(x)) return x.map(sort);
        if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x as object).sort().map(k => [k, sort((x as Record<string, unknown>)[k])]));
        return x;
    };
    return JSON.stringify(sort(v));
}

const sha256 = (b: FileBytes) => crypto.createHash('sha256').update(b).digest('hex');

/** First 16 hex characters of the SHA-256 of the public key's SPKI DER form. */
export function publicKeyFingerprint(publicKeyPem: string): string {
    const der = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
    return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

export interface PackManifest {
    packVersion: string;
    generatedAt: string;
    meta: Record<string, unknown>;
    files: Array<{ name: string; bytes: number; sha256: string }>;
    signedBy: string;
    statement: string;
}
export interface EvidencePack { manifest: PackManifest; signature: string; publicKeyPem: string }

export function buildPack(input: { meta: Record<string, unknown>; generatedAt: string; files: Record<string, FileBytes> }, privateKeyPem: string): EvidencePack {
    if (!privateKeyPem) throw new Error('the evidence signing key is not configured');
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    const publicKeyPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }) as string;
    const files = Object.keys(input.files).sort().map(name => ({ name, bytes: Buffer.byteLength(input.files[name]), sha256: sha256(input.files[name]) }));
    const manifest: PackManifest = { packVersion: PACK_VERSION, generatedAt: input.generatedAt, meta: input.meta, files,
        signedBy: publicKeyFingerprint(publicKeyPem), statement: PACK_STATEMENT };
    const signature = crypto.sign(null, Buffer.from(canonicalJson(manifest)), privateKey).toString('base64');
    return { manifest, signature, publicKeyPem };
}

export function verifyPack(pack: EvidencePack, files: Record<string, FileBytes>, trustedPublicKeyPem?: string): { valid: boolean; problems: string[]; signedBy: string | null } {
    const problems: string[] = [];
    let signedBy: string | null = null;
    try {
        const key = crypto.createPublicKey(pack.publicKeyPem);
        signedBy = publicKeyFingerprint(pack.publicKeyPem);
        const ok = crypto.verify(null, Buffer.from(canonicalJson(pack.manifest)), key, Buffer.from(pack.signature, 'base64'));
        if (!ok) problems.push('the signature does not match the manifest');
        if (pack.manifest.signedBy !== signedBy) problems.push('the manifest names a different signing key than the key in the pack');
        if (trustedPublicKeyPem && publicKeyFingerprint(trustedPublicKeyPem) !== signedBy) problems.push('the pack was not signed by the trusted key');
    } catch {
        problems.push('the public key or the signature could not be read');
    }
    const listed = new Set<string>();
    for (const f of pack.manifest?.files ?? []) {
        listed.add(f.name);
        if (!(f.name in files)) problems.push(`${f.name}: listed in the manifest but not supplied`);
        else if (sha256(files[f.name]) !== f.sha256) problems.push(`${f.name}: the file does not match the SHA-256 in the manifest`);
    }
    for (const name of Object.keys(files)) if (!listed.has(name)) problems.push(`${name}: supplied but not listed in the manifest`);
    return { valid: problems.length === 0, problems, signedBy };
}

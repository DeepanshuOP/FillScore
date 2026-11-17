import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { buildPack } from '../evidencePack';

// scripts/verify_evidence_pack.mjs must agree with services/evidencePack.ts: same canonical JSON, same hashes, same signature check.
const SCRIPT = path.resolve(__dirname, '../../../../scripts/verify_evidence_pack.mjs');
const gen = () => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
    return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, pub: publicKey.export({ type: 'spki', format: 'pem' }) as string };
};
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-'));
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
const write = (name: string, body: string) => { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; };

describe('scripts/verify_evidence_pack.mjs', () => {
    const k = gen();
    const files = { 'scorecard.json': '{"grade":"A","note":"é"}', 'orders.json': '[1,2,3]' };
    const pack = buildPack({ meta: { kind: 'scorecard', nested: { b: 2, a: [1, { y: 1, x: 2 }] } }, generatedAt: '2026-11-17T00:00:00.000Z', files }, k.priv);

    it('accepts a pack that services/evidencePack.ts built (exit 0)', () => {
        const r = run(write('ok.json', JSON.stringify({ pack, files })));
        expect(r.status).toBe(0);
        expect(r.stdout).toMatch(/^VALID\. 2 files match the manifest/);
    });
    it('with the trusted key it says so; with another key it is not valid', () => {
        const ok = run(write('ok2.json', JSON.stringify({ pack, files })), '--key', write('k.pem', k.pub));
        expect(ok.status).toBe(0);
        expect(ok.stdout).toContain('(the trusted key)');
        const bad = run(write('ok3.json', JSON.stringify({ pack, files })), '--key', write('other.pem', gen().pub));
        expect(bad.status).toBe(1);
        expect(bad.stdout).toContain('the pack was not signed by the trusted key');
    });
    it('names a changed file (exit 1)', () => {
        const r = run(write('bad.json', JSON.stringify({ pack, files: { ...files, 'orders.json': '[1,2,4]' } })));
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('orders.json: the file does not match the SHA-256 in the manifest');
    });
    it('a changed manifest breaks the signature (exit 1)', () => {
        const forged = { ...pack, manifest: { ...pack.manifest, generatedAt: '1999-01-01T00:00:00.000Z' } };
        const r = run(write('forged.json', JSON.stringify({ pack: forged, files })));
        expect(r.status).toBe(1);
        expect(r.stdout).toContain('the signature does not match the manifest');
    });
    it('input that is not a pack is exit 2, never a crash trace', () => {
        const r = run(write('junk.json', '{"hello":1}'));
        expect(r.status).toBe(2);
        expect(r.stderr).toContain('not an evidence pack');
        expect(run(path.join(dir, 'missing.json')).status).toBe(2);
        expect(run().status).toBe(2);
    });
});

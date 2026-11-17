#!/usr/bin/env node
// Check a FillScore evidence pack offline, with Node's built-in crypto only (no install, no network, no FillScore server).
//
//   node scripts/verify_evidence_pack.mjs pack.json [--key fillscore-public.pem]
//
// pack.json is the JSON the pack download returned: { "pack": { manifest, signature, publicKeyPem }, "files": { name: text } }.
// The script (1) recomputes the canonical JSON of the manifest and checks the Ed25519 signature, (2) checks that every file
// matches the SHA-256 in the manifest and that no file is missing or extra, and (3) with --key, checks that the pack was
// signed by the public key you got from a source you trust (the pack carries its own key, which proves only consistency).
// Exit code 0: valid (consistent AND signed by the trusted key you gave with --key). 3: consistent, but no trusted key was given, so the
// origin is not shown. 1: a problem was found (each is printed). 2: the input could not be read.
import crypto from 'node:crypto';
import fs from 'node:fs';

const canonicalJson = (v) => {
  const sort = (x) => Array.isArray(x) ? x.map(sort)
    : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x;
  return JSON.stringify(sort(v));
};
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fingerprint = (pem) => crypto.createHash('sha256').update(crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);

const args = process.argv.slice(2);
const keyIx = args.indexOf('--key');
const trustedPath = keyIx >= 0 ? args.splice(keyIx, 2)[1] : null;
const input = args[0];
if (!input) { console.error('usage: node scripts/verify_evidence_pack.mjs pack.json [--key public.pem]'); process.exit(2); }

let doc;
try { doc = JSON.parse(fs.readFileSync(input, 'utf8')); } catch (e) { console.error(`cannot read ${input}: ${e.message}`); process.exit(2); }
const { pack, files } = doc ?? {};
if (!pack?.manifest || typeof pack.signature !== 'string' || typeof pack.publicKeyPem !== 'string' || !files || typeof files !== 'object') {
  console.error('the input is not an evidence pack: expected { pack: { manifest, signature, publicKeyPem }, files }'); process.exit(2);
}

const problems = [];
let signedBy = null;
try {
  signedBy = fingerprint(pack.publicKeyPem);
  const ok = crypto.verify(null, Buffer.from(canonicalJson(pack.manifest)), crypto.createPublicKey(pack.publicKeyPem), Buffer.from(pack.signature, 'base64'));
  if (!ok) problems.push('the signature does not match the manifest');
  if (pack.manifest.signedBy !== signedBy) problems.push('the manifest names a different signing key than the key in the pack');
  if (trustedPath) {
    const trusted = fs.readFileSync(trustedPath, 'utf8');
    if (fingerprint(trusted) !== signedBy) problems.push('the pack was not signed by the trusted key');
  }
} catch (e) {
  problems.push('the public key or the signature could not be read');
}
const listed = new Set();
for (const f of pack.manifest.files ?? []) {
  listed.add(f.name);
  // own properties only: a manifest may name "constructor" or "__proto__"
  if (!Object.hasOwn(files, f.name)) { problems.push(`${f.name}: listed in the manifest but not supplied`); continue; }
  const actual = Buffer.byteLength(files[f.name]);
  if (sha256(files[f.name]) !== f.sha256) problems.push(`${f.name}: the file does not match the SHA-256 in the manifest`);
  if (actual !== f.bytes) problems.push(`${f.name}: the size in the manifest (${f.bytes} bytes) is not the size of the file (${actual} bytes)`);
}
for (const name of Object.keys(files)) if (!listed.has(name)) problems.push(`${name}: supplied but not listed in the manifest`);

if (problems.length === 0) {
  if (trustedPath) {
    console.log(`VALID. ${listed.size} files match the manifest; signed by key ${signedBy} (the trusted key).`);
    process.exit(0);
  }
  // Anyone can make a pack that is consistent with their own key: without a trusted key this proves nothing about where it came from.
  console.log(`CONSISTENT. ${listed.size} files match the manifest and the signature fits the key ${signedBy}, but the pack was not compared with a trusted key: `
    + 'this does not show that it came from FillScore. Run again with --key <the published public key>.');
  process.exit(3);
}
console.log('NOT VALID:');
for (const p of problems) console.log(`  - ${p}`);
process.exit(1);

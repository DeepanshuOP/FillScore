'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { verifyEvidencePack, type VerifyResult } from '../lib/evidenceVerify';

/** The fingerprint of FillScore's evidence signing key (public). Also written in the repository, docs/research/LOG.md §T. */
const PUBLISHED_FINGERPRINT = 'ba11aa53c4961be4';

const P: React.CSSProperties = { fontFamily: 'var(--font-inter)', fontSize: '0.9rem', lineHeight: 1.75, color: '#a09890', marginBottom: '0.75rem' };
const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#c8bfb4' };
const field: React.CSSProperties = {
  width: '100%', background: '#1a1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, color: '#ede8e0',
  fontFamily: 'var(--font-mono)', fontSize: '0.75rem', padding: '8px 10px', boxSizing: 'border-box',
};
const TONE: Record<VerifyResult['status'], string> = { valid: '#7fb88a', consistent: '#c4a882', invalid: '#d98080', unreadable: '#d98080' };

/** Check an evidence pack in this browser. The file is read here and never sent anywhere. */
export default function VerifyPage() {
  const [trusted, setTrusted] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [name, setName] = useState<string | null>(null);
  // The chosen file stays in memory in this tab (never sent), so changing the trusted key re-checks it at once.
  const [loaded, setLoaded] = useState<{ parsed: unknown } | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setName(file.name);
    let parsed: unknown = null;
    try { parsed = JSON.parse(await file.text()); } catch { parsed = null; }
    setLoaded({ parsed });
  };

  useEffect(() => {
    if (!loaded) return;
    let current = true;
    verifyEvidencePack(loaded.parsed, { trustedKey: trusted }).then((r) => { if (current) setResult(r); });
    return () => { current = false; };
  }, [loaded, trusted]);

  return (
    <main style={{ minHeight: '100vh', background: '#0f0f0f', padding: '96px 16px 80px' }}>
      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontWeight: 400, fontSize: '2rem', color: '#ede8e0', marginBottom: '0.5rem' }}>
          Check an evidence pack
        </h1>
        <p style={{ ...MONO, letterSpacing: '0.12em', color: '#888078', marginBottom: '1.5rem' }}>CHECKED IN YOUR BROWSER · NOTHING IS UPLOADED</p>
        <p style={P}>
          Choose the pack file you downloaded from FillScore (the JSON file with the pack and its files). This page recomputes the
          signature check and the SHA-256 of every file in your browser. The file is read on this device. It is not sent to FillScore or to
          anyone else. The same check runs offline with <span style={MONO}>scripts/verify_evidence_pack.mjs</span> in the repository.
        </p>
        <p style={P}>
          A pack carries its own public key, so a pack made by anyone is consistent with its own key. To learn where a pack came from,
          compare its key with one you trust. FillScore&apos;s key fingerprint is <span style={MONO}>{PUBLISHED_FINGERPRINT}</span>. It is also
          written in the repository (<span style={MONO}>docs/research/LOG.md</span>, section T) and in the response of{' '}
          <span style={MONO}>/api/evidence/public-key</span>. A fingerprint read on this page comes from the same site as this page, so
          check it against the repository as well.
        </p>

        <label htmlFor="trusted" style={{ ...MONO, display: 'block', margin: '1.25rem 0 6px' }}>TRUSTED KEY (optional): a 16-character fingerprint, or a PEM public key</label>
        <textarea id="trusted" rows={3} style={field} value={trusted} onChange={(e) => setTrusted(e.target.value)} spellCheck={false}
          placeholder={PUBLISHED_FINGERPRINT} />
        <button type="button" onClick={() => setTrusted(PUBLISHED_FINGERPRINT)}
          style={{ ...MONO, background: 'transparent', border: 'none', color: '#a78b71', cursor: 'pointer', padding: '4px 0' }}>
          Use FillScore&apos;s published fingerprint
        </button>

        <label htmlFor="pack" style={{ ...MONO, display: 'block', margin: '1.25rem 0 6px' }}>PACK FILE (.json)</label>
        <input id="pack" type="file" accept="application/json,.json" style={{ ...MONO, color: '#c8bfb4' }}
          onChange={(e) => onFile(e.target.files?.[0])} />

        {result && (
          <section aria-live="polite" style={{ marginTop: '1.5rem', border: `1px solid ${TONE[result.status]}`, borderRadius: 3, padding: '1rem 1.25rem' }}>
            <p style={{ ...MONO, color: TONE[result.status], letterSpacing: '0.12em', margin: '0 0 0.5rem' }}>
              {result.status.toUpperCase()}{name ? ` · ${name}` : ''}
            </p>
            <p style={{ ...P, marginBottom: result.problems.length ? '0.5rem' : 0 }}>{result.message}</p>
            {result.problems.length > 0 && (
              <ul style={{ ...P, margin: 0, paddingLeft: '1.2rem' }}>
                {result.problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
            {result.engine && (
              <p style={{ ...MONO, color: '#888078', margin: '0.75rem 0 0' }}>
                Signature checked with {result.engine === 'webcrypto' ? 'the browser’s WebCrypto (Ed25519)' : '@noble/ed25519 3.2.0 (this browser has no Ed25519 in WebCrypto)'}.
              </p>
            )}
          </section>
        )}

        <p style={{ ...P, marginTop: '2rem' }}>
          The pack lists measurements of past executions and the public market data they used. It supports your own documentation. It
          makes no statement about rules or regulation. <Link href="/methodology" style={{ color: '#a78b71' }}>How the numbers are made</Link>.
        </p>
      </article>
    </main>
  );
}

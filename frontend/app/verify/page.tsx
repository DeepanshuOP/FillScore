'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { CircleCheck, CircleX, FileJson, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';
import { MarketingNav } from '../components/marketing/MarketingNav';
import SiteFooter from '../components/SiteFooter';
import { Panel } from '../ui/Panel';
import { buttonClass } from '../ui/buttonClass';
import { cn } from '../../lib/utils';
import { verifyEvidencePack, type VerifyResult } from '../lib/evidenceVerify';

/** The fingerprint of FillScore's evidence signing key (public). Also written in the repository, docs/research/LOG.md §T. */
const PUBLISHED_FINGERPRINT = 'ba11aa53c4961be4';

const MONO = 'font-ui-mono text-[0.8125rem] text-ui-ink';
const VERDICT: Record<VerifyResult['status'], { Icon: typeof ShieldCheck; tone: string; line: string }> = {
  valid: { Icon: ShieldCheck, tone: 'text-ui-measured', line: 'Signed by the trusted key' },
  consistent: { Icon: ShieldQuestion, tone: 'text-ui-insufficient-text', line: 'Consistent with its own key, origin not shown' },
  invalid: { Icon: ShieldX, tone: 'text-ui-danger', line: 'At least one check failed' },
  unreadable: { Icon: ShieldX, tone: 'text-ui-danger', line: 'The file could not be read as a pack' },
};

/** The manifest rows (name, size, SHA-256 as listed) of a parsed pack, read defensively. Only used for display. */
function manifestRows(parsed: unknown): Array<{ name: string; sha256: string }> {
  const files = (parsed as { pack?: { manifest?: { files?: unknown } } } | null)?.pack?.manifest?.files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((f) => (f && typeof f.name === 'string' && typeof f.sha256 === 'string' ? [{ name: f.name, sha256: f.sha256 }] : []));
}

/** Check an evidence pack in this browser. The file is read here and never sent anywhere. */
export default function VerifyPage() {
  const [trusted, setTrusted] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [over, setOver] = useState(false);
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

  const rows = loaded ? manifestRows(loaded.parsed) : [];
  const verdict = result ? VERDICT[result.status] : null;

  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="mx-auto max-w-[1240px] px-5 pt-28 sm:px-8">
          <header className="max-w-[68ch]">
            <h1 className="display-md text-ui-ink">Check an evidence pack</h1>
            <p className="mt-3 text-[15px] text-ui-graphite">Checked in your browser. Nothing is uploaded.</p>
            <p className="mt-6 text-[15.5px] leading-[1.75] text-ui-graphite">
              Choose the pack file you downloaded from FillScore (the JSON file with the pack and its files). This page recomputes the
              signature check and the SHA-256 of every file in your browser. The file is read on this device. It is not sent to FillScore or to
              anyone else. The same check runs offline with <code className={MONO}>scripts/verify_evidence_pack.mjs</code> in the repository.
            </p>
            <p className="mt-4 text-[15.5px] leading-[1.75] text-ui-graphite">
              A pack carries its own public key, so a pack made by anyone is consistent with its own key. To learn where a pack came from,
              compare its key with one you trust. FillScore&apos;s key fingerprint is <code className={MONO}>{PUBLISHED_FINGERPRINT}</code>. It is also
              written in the repository (<code className={MONO}>docs/research/LOG.md</code>, section T) and in the response of{' '}
              <code className={MONO}>/api/evidence/public-key</code>. A fingerprint read on this page comes from the same site as this page, so
              check it against the repository as well.
            </p>
          </header>

          <div className="mx-auto mt-10 flex max-w-[560px] flex-col gap-6">
            <div
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); void onFile(e.dataTransfer.files?.[0]); }}
              className={cn('relative flex flex-col items-center gap-2 rounded-[16px] border border-dashed px-6 py-10 text-center transition-colors',
                over ? 'border-ui-measured bg-ui-overlay' : 'border-ui-edge bg-ui-raised')}
            >
              <FileJson aria-hidden="true" className="size-8 text-ui-graphite" strokeWidth={1.5} />
              <label htmlFor="pack" className="cursor-pointer text-[15px] font-medium text-ui-ink">Drop a pack or choose a file</label>
              <p className="text-[13px] text-ui-graphite">A .json pack file. {name ? <span className={MONO}>{name}</span> : 'The file stays on this device.'}</p>
              <input id="pack" type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])}
                className="mt-1 max-w-full text-[13px] text-ui-graphite file:mr-3 file:cursor-pointer file:rounded-[9px] file:border-0 file:bg-ui-overlay file:px-3 file:py-1.5 file:text-[13px] file:text-ui-ink" />
            </div>

            <Panel title="Trusted key" description="Optional. A 16-character fingerprint, or a PEM public key.">
              <label htmlFor="trusted" className="sr-only">Trusted key</label>
              <textarea id="trusted" rows={3} value={trusted} onChange={(e) => setTrusted(e.target.value)} spellCheck={false}
                placeholder={PUBLISHED_FINGERPRINT}
                className="w-full rounded-ui border border-ui-edge bg-ui-surface px-3 py-2 font-ui-mono text-[0.8125rem] text-ui-ink placeholder:text-ui-graphite" />
              <button type="button" onClick={() => setTrusted(PUBLISHED_FINGERPRINT)} className={buttonClass('quiet', 'sm', 'mt-2')}>
                Use FillScore&apos;s published fingerprint
              </button>
            </Panel>

            {result && verdict && (
              <section aria-live="polite" aria-label="Verification receipt" className="panel p-5 sm:p-6">
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Verification receipt</p>
                <p className={cn('mt-1 truncate text-[13px] text-ui-graphite')}>{name ? <span className={MONO}>{name}</span> : null}</p>
                {rows.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-3">
                    {rows.map((r) => {
                      const bad = result.problems.some((p) => p.startsWith(`${r.name}:`));
                      return (
                        <li key={r.name} className="flex items-start gap-3">
                          {bad
                            ? <CircleX aria-label="Check failed" className="mt-0.5 size-4 shrink-0 text-ui-danger" />
                            : <CircleCheck aria-label="Check passed" className="mt-0.5 size-4 shrink-0 text-ui-measured" />}
                          <div className="min-w-0">
                            <p className="text-sm text-ui-ink">{r.name}</p>
                            <p className="break-all font-ui-mono text-[0.75rem] text-ui-graphite">{r.sha256}</p>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <hr className="my-5 border-0 border-t border-dashed border-ui-edge" />
                <dl className="flex flex-col gap-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-ui-graphite">Signature</dt>
                    <dd className="text-ui-ink">{result.status === 'unreadable' ? 'Not read' : result.problems.some((p) => p.startsWith('the signature')) ? 'Does not match' : result.signedBy ? 'Matches the manifest' : 'Not read'}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-ui-graphite">Key fingerprint</dt>
                    <dd>{result.signedBy ? <code className={MONO}>{result.signedBy}</code> : <span className="text-ui-graphite">Not read</span>}</dd>
                  </div>
                </dl>
                <hr className="my-5 border-0 border-t border-dashed border-ui-edge" />
                <p className={cn('flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]', verdict.tone)}>
                  <verdict.Icon aria-hidden="true" className="size-5" />
                  {result.status.toUpperCase()}
                </p>
                <p className="mt-1 text-[13px] text-ui-graphite">{verdict.line}</p>
                <p className="mt-3 text-sm leading-6 text-ui-ink">{result.message}</p>
                {result.problems.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-sm leading-6 text-ui-graphite">
                    {result.problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                )}
                {result.engine && (
                  <p className="mt-3 text-[13px] text-ui-graphite">
                    Signature checked with {result.engine === 'webcrypto' ? 'the browser’s WebCrypto (Ed25519)' : '@noble/ed25519 3.2.0 (this browser has no Ed25519 in WebCrypto)'}.
                  </p>
                )}
              </section>
            )}
          </div>

          <p className="mx-auto mt-10 max-w-[68ch] text-sm leading-6 text-ui-graphite">
            The pack lists measurements of past executions and the public market data they used. It supports your own documentation. It
            makes no statement about rules or regulation. <Link href="/methodology" className="text-ui-ink">How the numbers are made</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

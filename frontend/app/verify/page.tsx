'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MarketingNav } from '../components/marketing/MarketingNav';
import SiteFooter from '../components/SiteFooter';
import { buttonClass } from '../ui/buttonClass';
import { Upload } from 'lucide-react';
import { cn } from '../../lib/utils';
import { verifyEvidencePack, type VerifyResult } from '../lib/evidenceVerify';

/** The fingerprint of FillScore's evidence signing key (public). Also written in the repository, docs/research/LOG.md §T. */
const PUBLISHED_FINGERPRINT = 'ba11aa53c4961be4';

const MONO = 'font-mono text-[0.8125rem] text-ui-ink';
/** The three outcomes (and the unreadable file), each with its own stamp line style and words; colour only repeats them. */
const VERDICT: Record<VerifyResult['status'], { tone: 'pen' | 'dashed' | 'danger'; line: string }> = {
  valid: { tone: 'pen', line: 'Signed by the trusted key' },
  consistent: { tone: 'dashed', line: 'Consistent with its own key, origin not shown' },
  invalid: { tone: 'danger', line: 'At least one check failed' },
  unreadable: { tone: 'danger', line: 'The file could not be read as a pack' },
};

/** The manifest rows (name, size, SHA-256 as listed) of a parsed pack, read defensively. Only used for display. */
function manifestRows(parsed: unknown): Array<{ name: string; sha256: string }> {
  const files = (parsed as { pack?: { manifest?: { files?: unknown } } } | null)?.pack?.manifest?.files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((f) => (f && typeof f.name === 'string' && typeof f.sha256 === 'string' ? [{ name: f.name, sha256: f.sha256 }] : []));
}

/**
 * Check an evidence pack in this browser (design v3). The file is read here and never sent anywhere. The result prints as
 * a receipt: the manifest's lines tick OK or FAIL one by one as their hashes are compared, the signature line follows,
 * then the outcome is stamped (VALID, CONSISTENT, INVALID or UNREADABLE) with its line in words.
 */
export default function VerifyPage() {
  const [trusted, setTrusted] = useState('');
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [run, setRun] = useState(0);
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
    verifyEvidencePack(loaded.parsed, { trustedKey: trusted }).then((r) => { if (current) { setResult(r); setRun((n) => n + 1); } });
    return () => { current = false; };
  }, [loaded, trusted]);

  const rows = loaded ? manifestRows(loaded.parsed) : [];
  const verdict = result ? VERDICT[result.status] : null;
  const sig = !result || result.status === 'unreadable' ? 'NOT READ' : result.problems.some((p) => p.startsWith('the signature')) ? 'DOES NOT MATCH' : result.signedBy ? 'MATCHES THE MANIFEST' : 'NOT READ';
  const step = 180;   // ms between ticked lines (CSS animation delays; none with reduced motion)

  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="px-[var(--ui-gutter)] pt-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-16">
            <header className="max-w-[64ch]">
              <h1 className="display-lg text-ui-ink">Check a signed report</h1>
              <p className="mt-4 text-[17px] text-ui-ink">Checked in your browser. Nothing is uploaded.</p>
              <p className="mt-6 text-[16px] leading-7 text-ui-graphite">
                Choose the report file you downloaded. The signature and the SHA-256 of every file are recomputed here. The file is read on this device and is not sent to FillScore or to anyone else. The same check runs offline with <code className={MONO}>scripts/verify_evidence_pack.mjs</code> in the repository.
              </p>
              <p className="mt-4 max-w-[64ch] text-[16px] leading-7 text-ui-graphite">
                The report lists measurements of past executions. It makes no statement about rules or regulation.{' '}
                <Link href="/methodology" className="text-ui-ink">How the numbers are made</Link>.
              </p>
            </header>

            <div className="flex min-w-0 flex-col gap-6">
              <div
                onDragOver={(e) => { e.preventDefault(); setOver(true); }}
                onDragLeave={() => setOver(false)}
                onDrop={(e) => { e.preventDefault(); setOver(false); void onFile(e.dataTransfer.files?.[0]); }}
                className={cn('flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-ui-edge bg-ui-raised px-6 py-10 text-center transition-colors', over && 'border-ui-ink bg-ui-overlay')}
              >
                <Upload aria-hidden="true" className="size-7 text-ui-graphite" />
                <p className="text-[18px] font-semibold text-ui-ink">Drop a signed report here</p>
                <p className="text-[14px] text-ui-graphite">or choose the file on your device</p>
                {name ? <p className="text-[14px] text-ui-graphite"><span className={MONO}>{name}</span></p> : null}
                {/* design v3 fixes A9: the real file input stays in the tab order (visually hidden), named by the label
                    drawn as a pill button; its focus ring shows on the button */}
                <span className="relative mt-2 inline-flex">
                  <input id="pack" type="file" accept="application/json,.json" onChange={(e) => onFile(e.target.files?.[0])} className="peer sr-only" />
                  <label htmlFor="pack" className={buttonClass('secondary', 'md', 'cursor-pointer pointer-coarse:h-11 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ui-ink')}>
                    {name ? 'Choose another report file' : 'Choose a report file'}
                  </label>
                </span>
              </div>

              <section aria-labelledby="trusted-t" className="rounded-xl border border-ui-rule bg-ui-raised p-4 shadow-ui">
                <h2 id="trusted-t" className="text-[16px] font-semibold text-ui-ink">Trusted key (optional)</h2>
                <p className="mt-1 text-[14px] leading-snug text-ui-graphite">
                  A report carries its own public key, so a report made by anyone is consistent with its own key. To learn where a report came from, compare its key with one you trust: a 16-character fingerprint, or a PEM public key. FillScore&apos;s fingerprint is <code className={MONO}>{PUBLISHED_FINGERPRINT}</code>. It is also written in the repository (<code className={MONO}>docs/research/LOG.md</code>, section T). A fingerprint read on this page comes from the same site as this page, so check it against the repository as well.
                </p>
                <label htmlFor="trusted" className="sr-only">Trusted key</label>
                <textarea id="trusted" rows={3} value={trusted} onChange={(e) => setTrusted(e.target.value)} spellCheck={false}
                  placeholder={PUBLISHED_FINGERPRINT}
                  className="mt-3 w-full rounded-lg border border-ui-edge bg-ui-surface px-3 py-2 font-mono text-[13px] text-ui-ink placeholder:text-ui-graphite" />
                <button type="button" onClick={() => setTrusted(PUBLISHED_FINGERPRINT)} className={buttonClass('quiet', 'sm', 'mt-2 pointer-coarse:min-h-11')}>
                  Use FillScore&apos;s published fingerprint
                </button>
              </section>

              {result && verdict && (
                <section key={run} aria-live="polite" aria-label="Verification receipt">
                  <div className="fs-receipt shadow-ui">
                    <h2 className="fs-r-title !text-[1.5rem]">Verification receipt</h2>
                    <p className="c g mt-1 truncate">{name ?? 'pack'}</p>
                    <hr />
                    {rows.length > 0 ? (
                      <ul>
                        {rows.map((r, i) => {
                          const bad = result.problems.some((p) => p.startsWith(`${r.name}:`));
                          return (
                            <li key={r.name} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-2 border-b border-dashed border-ui-rule py-2">
                              <span className="fs-tick" data-ok={!bad} data-in="true" style={{ animationDelay: `${i * step}ms` }}>{bad ? 'FAIL' : 'OK'}</span>
                              <span className="min-w-0">
                                <span className="block">{r.name}</span>
                                <span className="g block break-all text-[12px] leading-4">{r.sha256}</span>
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    ) : <p className="g">NO MANIFEST WAS READ</p>}
                    <dl className="kv mt-3" style={{ gridTemplateColumns: '12ch minmax(0,1fr)' }}>
                      <dt className="g">SIGNATURE</dt><dd>{sig}</dd>
                      <dt className="g">KEY</dt><dd>{result.signedBy ?? 'NOT READ'}</dd>
                      <dt className="g">FILES</dt><dd>{result.fileCount}</dd>
                    </dl>
                    <div className="fs-perf" aria-hidden="true" />
                    <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                      <div className="min-w-0 max-w-[30ch]">
                        <p className="font-ui text-[15px] font-bold text-ui-ink">{verdict.line}</p>
                      </div>
                      <span className="fs-word-stamp" data-tone={verdict.tone === 'pen' ? undefined : verdict.tone} data-in="true"
                        style={{ animationDelay: `${rows.length * step + 120}ms` }}>
                        {result.status.toUpperCase()}<small>{result.status === 'valid' ? 'trusted key' : result.status === 'consistent' ? 'its own key' : 'see below'}</small>
                      </span>
                    </div>
                    <p className="mt-4 font-ui text-sm leading-6 text-ui-ink">{result.message}</p>
                    {result.problems.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 font-ui text-sm leading-6 text-ui-graphite">
                        {result.problems.map((p) => <li key={p}>{p}</li>)}
                      </ul>
                    )}
                    {result.engine && (
                      <p className="g mt-3 text-[12px]">
                        SIGNATURE CHECKED WITH {result.engine === 'webcrypto' ? 'THE BROWSER’S WEBCRYPTO (ED25519)' : '@NOBLE/ED25519 3.2.0 (THIS BROWSER HAS NO ED25519 IN WEBCRYPTO)'}
                      </p>
                    )}
                  </div>
                  <div aria-hidden="true" className="fs-torn-bottom" />
                </section>
              )}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

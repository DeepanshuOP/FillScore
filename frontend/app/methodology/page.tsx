import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Link as LinkIcon } from 'lucide-react';
import { MarketingNav } from '../components/marketing/MarketingNav';
import SiteFooter from '../components/SiteFooter';
import data from './methodology.json';
import Toc from './Toc';

export const metadata: Metadata = {
  title: 'Methodology — FillScore',
  description: 'How FillScore measures execution quality from public market prints, and how the measured score is computed.',
};

const NAMES: Record<string, string> = {
  slippage: 'Slippage', fees: 'Fees', timing: 'Timing', spread: 'Spread',
  execution: 'Execution cost (spread and impact)', unfilled: 'Unfilled orders',
};

const P = 'mb-4 text-[15.5px] leading-[1.75] text-ui-graphite';
const CHIP = 'rounded-ui border border-ui-rule bg-ui-raised px-1.5 py-0.5 font-ui-mono text-[0.8125rem] text-ui-ink';

/** A heading with an id anchor and a "#" link icon that shows on hover or focus. */
function Anchor({ id, level, children, label }: { id: string; level: 2 | 3; children: ReactNode; label: string }) {
  const H = level === 2 ? 'h2' : 'h3';
  const size = level === 2 ? 'mt-12 mb-4 text-xl font-semibold tracking-[-0.02em]' : 'mt-8 mb-2 text-base font-semibold tracking-[-0.01em]';
  return (
    <H id={id} className={`group scroll-mt-24 text-ui-ink ${size}`}>
      {children}
      <a href={`#${id}`} aria-label={`Link to ${label}`}
        className="ml-2 inline-flex align-middle text-ui-graphite opacity-0 transition-opacity hover:text-ui-ink focus-visible:opacity-100 group-hover:opacity-100">
        <LinkIcon aria-hidden="true" className="size-4" />
      </a>
    </H>
  );
}

/** Rendered from methodology.json, which ml-service/scripts/gen_methodology.py generates from the metric registry and
 *  the committed scoring version file. A test fails when the JSON is stale, so this page matches the code. */
export default function MethodologyPage() {
  const s = data.scoring;
  const toc = [
    { id: 'two-scores', label: 'Two scores, side by side' },
    { id: 'benchmarks', label: 'Benchmarks from public prints' },
    { id: 'metrics', label: 'Metrics' },
    { id: 'measured-score', label: `The measured score (${s.version})` },
    { id: 'verifying', label: 'Verifying a score' },
  ];
  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="mx-auto max-w-[1240px] px-5 pt-28 sm:px-8">
          <header className="mb-12 max-w-[68ch]">
            <h1 className="display-md text-ui-ink">Methodology</h1>
            <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-ui-graphite">
              <code className={CHIP}>Measurement {data.measureVersion}</code>
              <code className={CHIP}>Scoring {s.version}</code>
            </p>
            <p className={`${P} mt-6`}>
              FillScore grades past executions. It does not predict prices or tell anyone how to trade. Every number on
              the dashboard comes from the code described here. AI text may explain a number, but it never produces one.
            </p>
          </header>

          <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
            <Toc items={toc} />
            <article className="max-w-[68ch]">
              <Anchor id="two-scores" level={2} label="two scores">Two scores, side by side</Anchor>
              <p className={P}>
                The v1 score is rule-based: it uses fixed rules written before real market data was measured. It stays
                unchanged so that published grades never move. The v2 score is measured: every input comes from public trade
                prints and from the account&apos;s own orders and commission rates.
              </p>

              <Anchor id="benchmarks" level={2} label="benchmarks">Benchmarks from public prints</Anchor>
              <p className={P}>
                The exchange marks the aggressor side of every public trade. The last buyer-initiated print stands in for the
                best ask, and the last seller-initiated print for the best bid. Only prints strictly before the fill are used,
                so a fill never sets its own benchmark. Each side is at most {data.benchmarks.maxQuoteAgeMs / 1000} seconds old.
                When only one side is fresh, the last print is the reference. When nothing is fresh, the fill is shown as not
                measured. No value is ever filled in.
              </p>
              <p className={P}>Horizons for realized spread and price impact: {data.benchmarks.horizonsS.join(', ')} seconds.</p>

              <Anchor id="metrics" level={2} label="metrics">Metrics</Anchor>
              {data.metrics.map((m) => (
                <section key={m.id} className="mb-6">
                  <Anchor id={`metric-${m.id.replace(/[^a-z0-9]+/gi, '-')}`} level={3} label={m.id}>
                    <code className={CHIP}>{m.id}</code>
                  </Anchor>
                  <p className="mb-2 text-[13px] text-ui-graphite">Unit: {m.unit}</p>
                  <p className={`${P} mb-2`}>{m.doc}</p>
                  <p className="text-[13px] leading-5 text-ui-graphite">Inputs: {m.inputs.join(', ')}</p>
                </section>
              ))}

              <Anchor id="measured-score" level={2} label="the measured score">The measured score ({s.version})</Anchor>
              <p className={P}>
                {Object.keys(s.weights).length === 3 ? 'Three' : 'Four'} components, each scored 0–100. Lower cost scores higher. {s.anchorRule}
              </p>
              {s.weightRule && <p className={P}>{s.weightRule}</p>}
              {Object.entries(s.weights).map(([k, w]) => (
                <section key={k} className="mb-4">
                  <p className="mb-1 text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">
                    {NAMES[k] ?? k} <code className={CHIP}>weight {Math.round(w * 100)}%</code>
                  </p>
                  <p className={`${P} mb-2`}>{(s.components as Record<string, string>)[k]}</p>
                </section>
              ))}
              {s.timingScored === false && (
                <section className="mb-4">
                  <p className="mb-1 text-[15px] font-semibold tracking-[-0.01em] text-ui-ink">Timing, information only, not scored</p>
                  <p className={`${P} mb-2`}>{(s.components as Record<string, string>).timing}</p>
                </section>
              )}
              <p className={P}>
                A letter grade is shown only when at least {s.minFills} fills were measured in every component. With fewer
                fills the dashboard shows a 95% bootstrap range and the reason instead of a letter. A component without
                measured fills reads &quot;insufficient data&quot;.
              </p>
              <p className={P}>
                Calibration: {s.symbols.join(', ')}, from {s.calibrationFiles} checksum-verified daily files of Binance public
                trades ({s.calibrationWindow.days.length} days, {s.calibrationWindow.start} to {s.calibrationWindow.end}; rule:{' '}
                {s.calibrationWindow.rule}). An hour&apos;s timing value needs samples on at least {s.minProfileDays} of those
                days. A symbol outside this set reads &quot;insufficient data&quot; for spread, slippage and timing.
              </p>

              <Anchor id="verifying" level={2} label="verifying a score">Verifying a score</Anchor>
              <p className={P}>
                Each measured score stores an integrity hash: SHA-256 over the version file, every stored measurement it used
                and the checksums of the market data. &quot;Verify integrity&quot; on the dashboard recomputes the hash from the
                stored inputs. The version file has SHA-256 <code className={CHIP}>{s.versionFileSha256.slice(0, 16)}…</code>
              </p>

              <p className="mt-12 border-t border-ui-rule pt-6 text-sm">
                <Link href="/dashboard" className="text-ui-ink">Back to the dashboard</Link>
              </p>
            </article>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

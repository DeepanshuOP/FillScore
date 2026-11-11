import type { Metadata } from 'next';
import Link from 'next/link';
import data from './methodology.json';

export const metadata: Metadata = {
  title: 'Methodology — FillScore',
  description: 'How FillScore measures execution quality from public market prints, and how the measured score is computed.',
};

const H2 = { fontFamily: 'var(--font-inter)', fontSize: '1.05rem', fontWeight: 600, color: '#ede8e0', margin: '2rem 0 0.75rem' } as const;
const P = { fontFamily: 'var(--font-inter)', fontSize: '0.9rem', lineHeight: 1.75, color: '#a09890', marginBottom: '0.75rem' } as const;
const MONO = { fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#c8bfb4' } as const;
const NAMES: Record<string, string> = { slippage: 'Slippage', fees: 'Fees', timing: 'Timing', spread: 'Spread' };

/** Rendered from methodology.json, which ml-service/scripts/gen_methodology.py generates from the metric registry and
 *  the committed scoring version file. A test fails when the JSON is stale, so this page matches the code. */
export default function MethodologyPage() {
  const s = data.scoring;
  return (
    <main style={{ minHeight: '100vh', background: '#0f0f0f', padding: '96px 16px 80px' }}>
      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontWeight: 400, fontSize: '2rem', color: '#ede8e0', marginBottom: '0.5rem' }}>
          Methodology
        </h1>
        <p style={{ ...MONO, letterSpacing: '0.12em', color: '#888078', marginBottom: '1.5rem' }}>
          MEASUREMENT {data.measureVersion} · SCORING {s.version}
        </p>
        <p style={P}>
          FillScore grades past executions. It does not predict prices or tell anyone how to trade. Every number on
          the dashboard comes from the code described here. AI text may explain a number, but it never produces one.
        </p>

        <h2 style={H2}>Two scores, side by side</h2>
        <p style={P}>
          The v1 score is rule-based: it uses fixed rules written before real market data was measured. It stays
          unchanged so that published grades never move. The v2 score is measured: every input comes from public trade
          prints and from the account&apos;s own orders and commission rates.
        </p>

        <h2 style={H2}>Benchmarks from public prints</h2>
        <p style={P}>
          The exchange marks the aggressor side of every public trade. The last buyer-initiated print stands in for the
          best ask, and the last seller-initiated print for the best bid. Only prints strictly before the fill are used,
          so a fill never sets its own benchmark. Each side is at most {data.benchmarks.maxQuoteAgeMs / 1000} seconds old.
          When only one side is fresh, the last print is the reference. When nothing is fresh, the fill is shown as not
          measured. No value is ever filled in.
        </p>
        <p style={P}>Horizons for realized spread and price impact: {data.benchmarks.horizonsS.join(', ')} seconds.</p>

        <h2 style={H2}>Metrics</h2>
        {data.metrics.map(m => (
          <section key={m.id} style={{ marginBottom: '1.25rem' }}>
            <p style={{ ...MONO, marginBottom: '0.25rem' }}>{m.id} · {m.unit}</p>
            <p style={{ ...P, marginBottom: '0.25rem' }}>{m.doc}</p>
            <p style={{ ...P, fontSize: '0.8rem', color: '#888078' }}>Inputs: {m.inputs.join(', ')}</p>
          </section>
        ))}

        <h2 style={H2}>The measured score ({s.version})</h2>
        <p style={P}>Four components, each scored 0–100. Lower cost scores higher. {s.anchorRule}</p>
        {Object.entries(s.weights).map(([k, w]) => (
          <section key={k} style={{ marginBottom: '1rem' }}>
            <p style={{ ...MONO, marginBottom: '0.25rem' }}>{NAMES[k] ?? k} · weight {Math.round(w * 100)}%</p>
            <p style={P}>{(s.components as Record<string, string>)[k]}</p>
          </section>
        ))}
        <p style={P}>
          A letter grade is shown only when at least {s.minFills} fills were measured in every component. With fewer
          fills the dashboard shows a 95% bootstrap range and the reason instead of a letter. A component without
          measured fills reads &quot;insufficient data&quot;.
        </p>
        <p style={P}>
          Calibration: {s.symbols.join(', ')}, from {s.calibrationFiles} checksum-verified daily files of Binance public
          trades ({s.calibrationWindow.days.join(', ')}; rule: {s.calibrationWindow.rule}). A symbol outside this set
          reads &quot;insufficient data&quot; for spread, slippage and timing.
        </p>

        <h2 style={H2}>Verifying a score</h2>
        <p style={P}>
          Each measured score stores an integrity hash: SHA-256 over the version file, every stored measurement it used
          and the checksums of the market data. &quot;Verify integrity&quot; on the dashboard recomputes the hash from the
          stored inputs. The version file has SHA-256 <span style={MONO}>{s.versionFileSha256.slice(0, 16)}…</span>
        </p>

        <p style={{ ...P, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '1.5rem' }}>
          <Link href="/dashboard" style={{ color: '#a78b71' }}>Back to the dashboard</Link>
        </p>
      </article>
    </main>
  );
}

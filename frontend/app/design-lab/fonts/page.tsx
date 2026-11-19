import { LabShell } from '../LabShell'
import { TabularCheck } from '../TabularCheck'
import { parseLab } from '../params'
import mock from '../fixtures/dashboard-mock.json'

const FAMILIES = [
  { id: 'plex', name: 'IBM Plex Sans', css: 'var(--font-plex-sans)', note: 'Grotesque with a documentary, ledger-like tone; shares a skeleton with IBM Plex Mono, which sets the hashes and ids.', fits: 'direction A, and a second choice for B.' },
  { id: 'hanken', name: 'Hanken Grotesk', css: 'var(--font-hanken)', note: 'Neutral and slightly geometric; one variable file.', fits: 'direction B, and a second choice for A.' },
  { id: 'schibsted', name: 'Schibsted Grotesk', css: 'var(--font-schibsted)', note: 'Editorial grotesque with open apertures. Shown for comparison: the measurement below decides whether it can set a column of figures. Under tabular figures its punctuation also widens ("$52 . 08"), as this specimen shows.', fits: 'neither direction unless the measurement reads "true tabular figures".' },
] as const

export default async function Fonts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseLab(await searchParams)
  const t = mock.totals
  return (
    <LabShell params={params} page="/design-lab/fonts" title="Three sans families, measured for tabular figures"
      intro="All three are on Google Fonts under the SIL Open Font License and are self-hosted by next/font. Each specimen sets the real headline of the dashboard mock, a column of real per-symbol figures, and a hash in IBM Plex Mono, which is used only for code-like content. The digit widths are measured in this browser, not assumed.">
      {FAMILIES.map((f) => (
        <section key={f.id} aria-labelledby={`f-${f.id}`} className="border-t border-ui-rule pt-6">
          <h2 id={`f-${f.id}`} className="text-[1.25rem] leading-7 font-semibold text-ui-ink">{f.name}</h2>
          <p className="mt-1 max-w-[68ch] text-sm text-ui-graphite">{f.note} Proposed for: {f.fits}</p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1.2fr_1fr]" style={{ fontFamily: f.css }}>
            <div>
              <p className="max-w-[26ch] text-[1.75rem] leading-[1.3] font-semibold text-balance text-ui-ink sm:text-[2.5rem] sm:leading-[1.15]">The {t.orders} orders paid ${t.usd.toFixed(2)} in total.</p>
              <p className="mt-4 max-w-[60ch] text-ui-ink">Market orders cost less than the modelled cost of a taker event of the same size in the hour before the order. Spread paid and impact and timing were each below zero in this period. Fees were the largest term.</p>
              <p className="mt-3 max-w-[60ch] text-sm text-ui-graphite">Body text at 14 px in graphite, the size of notes, captions and table cells.</p>
              <p className="mt-4 text-sm text-ui-graphite">Key fingerprint <code className="rounded-ui border border-ui-rule px-1.5 py-0.5 text-[0.8125rem] text-ui-ink" style={{ fontFamily: 'var(--ui-mono)' }}>{mock.evidenceKeyFingerprint}</code></p>
            </div>
            <div>
              <table className="w-full text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <thead><tr><th scope="col" className="border-b border-ui-edge py-1.5 text-left font-medium text-ui-graphite">Symbol</th><th scope="col" className="border-b border-ui-edge py-1.5 text-right font-medium text-ui-graphite">Orders</th><th scope="col" className="border-b border-ui-edge py-1.5 text-right font-medium text-ui-graphite">Median cost, bps</th><th scope="col" className="border-b border-ui-edge py-1.5 text-right font-medium text-ui-graphite">Total, $</th></tr></thead>
                <tbody>{mock.symbols.map((s) => (
                  <tr key={s.symbol} className="border-b border-ui-rule"><th scope="row" className="py-1.5 text-left font-normal text-ui-ink">{s.symbol}</th><td className="py-1.5 text-right text-ui-ink">{s.orders}</td><td className="py-1.5 text-right text-ui-ink">{s.medianTotalBps.toFixed(2)}</td><td className="py-1.5 text-right text-ui-ink">{s.totalUsd.toFixed(2)}</td></tr>
                ))}</tbody>
              </table>
              <div className="mt-5 text-ui-ink"><TabularCheck family={f.css} /></div>
            </div>
          </div>
        </section>
      ))}
    </LabShell>
  )
}

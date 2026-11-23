'use client'
import { useState } from 'react'
import { FileCheck2, Upload } from 'lucide-react'
import { bps, money, tableTime } from '../../lib/format'
import { Tile } from '../../components/Blocks'

/**
 * "Check a broker file" (PROPOSAL §5). The sample runs through the production route (POST /api/check/sample); every figure in
 * the result is the server's answer. In the lab without a backend the request fails and the page says so.
 */
interface Fill { txid: string; symbol: string; side: number; ts_ms: number; price: number; qty: number; eff_half_bps: number | null; fee_usd: number | null; unmeasured_reason: string | null }
interface Result { summary: { fills: number; measured: number; median_eff_half_bps: number | null; total_eff_cost_usd: number | null; total_fee_usd: number | null }; fills: Fill[]; sample?: { label: string } }

export function CheckClient() {
  const [state, setState] = useState<{ kind: 'idle' | 'loading' | 'error' } | { kind: 'done'; r: Result }>({ kind: 'idle' })
  const run = async () => {
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/check/sample', { method: 'POST' })
      if (!res.ok) throw new Error(String(res.status))
      setState({ kind: 'done', r: await res.json() })
    } catch { setState({ kind: 'error' }) }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="v-card flex flex-col items-center gap-3 border-dashed p-8 text-center">
        <Upload size={28} aria-hidden="true" className="text-[var(--v-text-2)]" />
        <p className="text-[16px] font-semibold">Drop a broker export here</p>
        <p className="max-w-[52ch] text-[14px] text-[var(--v-text-2)]">Kraken trades export, or any CSV with time, symbol, side, price and size columns. The file is read once and not stored. Checking your own file needs a signed-in account.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" className="v-btn" disabled aria-disabled="true" title="Sign in to check your own file">Choose a file</button>
          <button type="button" data-testid="try-sample" className="v-btn v-btn-primary" onClick={run} disabled={state.kind === 'loading'}>
            <FileCheck2 size={16} aria-hidden="true" />{state.kind === 'loading' ? 'Checking…' : 'Try the sample file'}
          </button>
        </div>
      </div>
      {state.kind === 'error' ? <p role="alert" className="text-[14px]">The sample check could not run here (no server in the design lab).</p> : null}
      {state.kind === 'done' ? (
        <section className="flex flex-col gap-3" aria-label="Result">
          {state.r.sample ? <p data-testid="sample-label" className="rounded-md border border-[var(--v-banner-border)] bg-[var(--v-banner)] px-3 py-2 text-[14px] text-[var(--v-banner-text)]">{state.r.sample.label}</p> : null}
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Tile label="Fills checked" value={`${state.r.summary.measured} of ${state.r.summary.fills}`} sub="compared with a public price" />
            <Tile label="Median cost vs mid" value={bps(state.r.summary.median_eff_half_bps) ?? 'insufficient data'} sub="per fill" />
            <Tile label="Cost vs mid" value={money(state.r.summary.total_eff_cost_usd) ?? 'insufficient data'} sub="all fills" />
            <Tile label="Fees" value={money(state.r.summary.total_fee_usd) ?? 'not computed'} sub="as the file states them" />
          </div>
          <div className="overflow-x-auto rounded-[10px] border border-[var(--v-border)] bg-[var(--v-surface)]">
            <table className="v-table">
              <thead><tr><th>Time (UTC)</th><th>Symbol</th><th>Side</th><th className="num">Price</th><th className="num">Size</th><th className="num">Cost vs mid</th><th className="num">Fee</th></tr></thead>
              <tbody>{state.r.fills.map((f) => (
                <tr key={f.txid}><td>{tableTime(new Date(f.ts_ms).toISOString())}</td><td>{f.symbol}</td><td>{f.side > 0 ? 'Buy' : 'Sell'}</td><td className="num">{f.price.toLocaleString('en-US')}</td><td className="num">{f.qty}</td>
                  <td className="num">{bps(f.eff_half_bps) ?? `insufficient data${f.unmeasured_reason ? `: ${f.unmeasured_reason}` : ''}`}</td><td className="num">{money(f.fee_usd) ?? 'not computed'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}

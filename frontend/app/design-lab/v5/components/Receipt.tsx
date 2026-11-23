import type { Replay } from '../lib/data'
import { bps, money, qty } from '../lib/format'

/**
 * The order receipt, kept as FillScore's signature object (PROPOSAL §5): paper, mono, uppercase printed labels at 13 px or more,
 * 14 px lines on a desktop. Every figure is the replay's (backend `orderReplay.ts`, cut into the fixtures). A missing cost
 * prints NOT COMPUTED, never 0; a demo prints NOT SIGNED; published-rate fees say so on the line and in words.
 */
const LABEL: Record<string, string> = { execution: 'Execution cost', spread: 'Spread paid', impactTiming: 'Impact and timing', unfilled: 'Unfilled orders (modelled)', fees: 'Fees', total: 'Total' }

export function Receipt({ replay, demo }: { replay: Replay; demo: boolean }) {
  const o = replay.order
  const lines = replay.decomposition.filter((d) => d.key !== 'total')
  const total = replay.decomposition.find((d) => d.key === 'total')
  return (
    <article data-testid="explain-replay" className="v-receipt rounded-md px-5 py-5 shadow-sm ring-1 ring-black/5">
      <header className="mb-3 text-center">
        <p className="text-[18px] font-bold tracking-tight" style={{ fontFamily: 'var(--f-cabinet)' }}>FillScore</p>
        <p className="lab">Order receipt</p>
        {demo ? <p className="lab">Synthetic trader, real prices</p> : null}
      </header>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-0.5 border-y border-dashed border-current/30 py-2">
        <dt className="lab">Order</dt><dd className="truncate">{o.orderId}</dd>
        <dt className="lab">Market</dt><dd>{o.symbol} {o.side} {o.type}</dd>
        <dt className="lab">Placed</dt><dd>{o.createdAt.slice(0, 19).replace('T', ' ')} UTC</dd>
        <dt className="lab">Status</dt><dd>{o.status}, {qty(o.executedQuantity)} of {qty(o.quantity)}</dd>
      </dl>
      <p className="lab mt-3 text-center">Fills</p>
      {replay.fills.length ? (
        <ul className="mt-1">
          {replay.fills.map((f) => (
            <li key={f.tradeId} className="flex justify-between gap-3"><span>{f.time.slice(11, 19)} {qty(f.quantity)} @ {f.price.toLocaleString('en-US')}</span><span>fee {money(f.feeUsd) ?? 'not computed'}</span></li>
          ))}
        </ul>
      ) : <p className="mt-1 text-center">No fills</p>}
      <p className="lab mt-3 text-center">Costs</p>
      <ul className="mt-1">
        {lines.map((d) => {
          const label = d.key === 'fees' && demo ? 'Fees (published rate)' : LABEL[d.key] ?? d.label
          const missing = d.usd === null || d.bps === null
          return (
            <li key={d.key} className={`flex justify-between gap-3 ${d.partOf ? 'pl-4' : ''}`}>
              <span>{label}</span>
              {missing ? <span className="border border-dotted border-current px-1">NOT COMPUTED</span> : <span className="whitespace-nowrap">{bps(d.bps)} · {money(d.usd)}</span>}
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex items-baseline justify-between border-t border-dashed border-current/30 pt-3">
        <span className="lab">Total</span>
        {total && total.usd !== null ? <span className="text-[22px] font-bold" style={{ fontFamily: 'var(--f-cabinet)' }}>{money(total.usd)} <span className="text-[14px] font-normal">{bps(total.bps)}</span></span> : <span>NOT COMPUTED</span>}
      </div>
      {demo ? <p className="mt-2 text-[13px]" style={{ fontFamily: 'var(--f-cabinet)' }}>Fees at the published rate: not independently measured.</p> : null}
      <details className="mt-3">
        <summary className="lab cursor-pointer py-2">Notes ({replay.notes.length + replay.sources.length})</summary>
        <ul className="flex flex-col gap-1 text-[13px]" style={{ fontFamily: 'var(--f-cabinet)' }}>
          {replay.notes.map((n) => <li key={n}>{n}</li>)}
          {replay.expectedCost && !replay.expectedCost.applies && replay.expectedCost.reason ? <li>Model estimate: does not apply ({replay.expectedCost.reason}).</li> : null}
          {replay.sources.map((s) => <li key={s.sha256} className="break-all">{s.label} · SHA-256 <span className="v-mono">{s.sha256.slice(0, 16)}…</span></li>)}
        </ul>
      </details>
      {demo ? <p className="mt-3 inline-block -rotate-2 border-2 border-current px-2 py-0.5 text-[16px] font-bold tracking-wide">NOT SIGNED <span className="block text-[13px] font-normal">demo: nothing of yours to sign</span></p> : null}
    </article>
  )
}

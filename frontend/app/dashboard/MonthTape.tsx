'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatSignedBps, formatUsd } from '../ui/format'
import { ValueState } from '../ui/ValueState'
import { baselineShare, dayMarks, monthTicks, nearestTick } from './monthTape'
import { formatUtc, ledgerRows, withParams, type OrderRow } from './ordersTable'

type ExplainRequest = (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; body: unknown }>

const H = 132
const PAD = 18

/**
 * The period as a ticker tape (design v3): one tick per order on the time axis, height = the order's total cost in
 * dollars from the server's ledger (design v3 fixes B1; a price improvement hangs below the line, same scale). Hover,
 * focus and the arrow keys preview the order as a small receipt; a click or Enter prints its full receipt (the Orders
 * section with that order open). The rows are the ones the Orders ledger reads (GET /audit/orders-ledger).
 */
export function MonthTape({ query, request, period, periodLabel, onOpen }: {
  query: string
  request: ExplainRequest
  period: { start: string; end: string }
  periodLabel: string
  onOpen: (row: OrderRow) => void
}) {
  const [rows, setRows] = useState<OrderRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [active, setActive] = useState<number | null>(null)

  useEffect(() => {
    let live = true
    request(withParams('/audit/orders-ledger', query))
      .then((res) => {
        if (!live) return
        if (res.status !== 200) { setFailed(true); return }
        setRows(ledgerRows(res.body) ?? [])
      })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [query, request])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows])

  const ticks = useMemo(() => (rows ? monthTicks(rows, period.start, period.end) : []), [rows, period.start, period.end])
  const days = useMemo(() => dayMarks(period.start, period.end), [period.start, period.end])
  const x = useCallback((t: number) => PAD + t * Math.max(0, w - 2 * PAD), [w])
  // B1: bars share one dollar scale; the baseline sits where the largest cost ends, improvements hang below it
  const base = H - 30, top = 12, D = base - top
  const zero = top + D * baselineShare(ticks)
  const open = useCallback((i: number) => { const r = ticks[i]?.row; if (r?.orderId) onOpen(r) }, [ticks, onOpen])

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = ticks.length, cur = active ?? -1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(n - 1, cur + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, cur < 0 ? 0 : cur - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if ((e.key === 'Enter' || e.key === ' ') && active !== null) { e.preventDefault(); open(active); return }
    if (next !== null) { e.preventDefault(); setActive(next) }
  }

  const head = (
    <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <h2 className="text-[1.375rem] font-bold tracking-[-0.02em] text-ui-ink">{periodLabel}, order by order</h2>
      <p className="text-sm text-ui-graphite">Height: the order&apos;s total cost in dollars; a price improvement is drawn below the line. Hover, or focus the tape and use the arrow keys; Enter prints the receipt.</p>
    </div>
  )
  if (failed) return <section aria-label="Orders over the period">{head}<ValueState state="not-computed" label="Orders over the period" reason="The orders could not be loaded." /></section>
  if (rows && ticks.length === 0) return <section aria-label="Orders over the period">{head}<ValueState state="not-computed" label="Orders over the period" reason="No order fell inside the period." /></section>

  const a = active !== null ? ticks[active] : null
  return (
    <section aria-label="Orders over the period">
      {head}
      <div ref={box} className="fs-strip fs-sprockets relative outline-offset-[6px]" style={{ height: H }}
        tabIndex={rows ? 0 : -1} role="listbox" aria-label={`${ticks.length} orders in ${periodLabel}`} aria-busy={!rows}
        aria-activedescendant={active !== null ? `tk-${ticks[active].key}` : undefined} onKeyDown={onKeyDown}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = nearestTick(ticks.map((t) => x(t.t)), e.clientX - r.left, 12); if (i !== null) setActive(i) }}
        onPointerLeave={() => setActive(null)} onClick={() => { if (active !== null) open(active) }} onBlur={() => setActive(null)}>
        {w > 0 && rows ? (
          <svg className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
            {days.map((d) => (
              <g key={d.t}>
                <line x1={x(d.t)} x2={x(d.t)} y1={base + 2} y2={base + 7} stroke="var(--ui-rule)" />
                {d.day % 2 === 1 && w > 500 || d.day % 5 === 1 ? <text x={x(d.t) + 3} y={base + 18} className="fill-ui-graphite font-mono text-[10px]">{d.day}</text> : null}
              </g>
            ))}
            <line x1={PAD} x2={Math.max(PAD, w - PAD)} y1={zero} y2={zero} stroke="var(--ui-rule)" />
            {ticks.map((t, i) => (
              // a measured cost: a bar from the baseline (up = cost, down = price improvement), at least 1.5 px so a
              // tiny cost is seen; no measured cost: a short dashed mark across the line
              <line key={t.key} x1={x(t.t)} x2={x(t.t)}
                y1={t.measured ? zero : zero - 3} y2={t.measured ? zero - (Math.sign(t.v) || 1) * Math.max(1.5, D * Math.abs(t.v)) : zero + 3}
                strokeDasharray={t.measured ? undefined : '1.5 1.5'}
                stroke={active === i ? 'var(--ui-pen)' : t.measured ? 'var(--ui-ink)' : 'var(--ui-graphite)'} strokeWidth={active === i ? 3 : 1.6} />
            ))}
          </svg>
        ) : <p className="absolute inset-x-5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ui-graphite">Feeding the tape</p>}
        {/* the options, for assistive technology: one per tick, named with what the preview prints */}
        <div className="absolute inset-0 overflow-hidden">
          {ticks.map((t, i) => (
            <span key={t.key} id={`tk-${t.key}`} role="option" aria-selected={active === i} className="sr-only">
              {`${t.row.symbol} ${t.row.side} ${t.row.type}, ${formatUtc(t.row.when)} UTC, ${t.row.cost ? `total cost ${formatUsd(t.row.cost.usd)}, ${formatSignedBps(t.row.cost.bps)}` : 'total cost not measured'}`}
            </span>
          ))}
        </div>
        {a ? (
          <div aria-hidden="true" className="pointer-events-none absolute bottom-[calc(100%+10px)] z-10 w-[250px] bg-ui-raised px-3.5 pt-3 pb-4 font-mono text-[12px] leading-normal text-ui-ink shadow-ui-float"
            style={{ left: Math.max(0, Math.min(w - 250, x(a.t) - 125)) }}>
            <div className="flex justify-between gap-2"><span>{a.row.symbol} {a.row.side}</span><span>{a.row.type.toUpperCase()}</span></div>
            <div className="text-ui-graphite">{formatUtc(a.row.when)} UTC</div>
            <div className="mt-1.5 flex justify-between"><span>COST</span><span>{a.row.cost ? `${formatUsd(a.row.cost.usd)}, ${formatSignedBps(a.row.cost.bps)}` : 'not measured'}</span></div>
            <div className="flex justify-between"><span>VALUE</span><span>{formatUsd(a.row.notionalUsd)}</span></div>
            <div className="flex justify-between"><span>FILLS</span><span>{a.row.fills}</span></div>
            <div className="flex justify-between"><span>FEES</span><span>{a.row.feesUsd === null ? 'not recorded' : formatUsd(a.row.feesUsd)}</span></div>
            <div className="mt-1.5 text-[11px] text-ui-graphite">{a.row.orderId ? 'Click or Enter prints the receipt' : 'No order id: no receipt'}</div>
            <div aria-hidden="true" className="fs-torn-bottom absolute inset-x-0 -bottom-[11px] h-2.5" />
          </div>
        ) : null}
      </div>
    </section>
  )
}

'use client'

import { useState } from 'react'
import { USD_FORMAT } from '../../../ui/Figure'
import { formatScore } from '../../../ui/format'
import { Counter } from '../Counter'
import { ACCOUNT, account, FILTERS, formatSignedBps, formatUsd, monthTotals, orders, PERIOD_LABEL, PROVENANCE, term, termTotals, utcDateTime, type OrderFilter } from '../data'
import { nearest, useMonthTicks, useTickNav } from '../month'
import { ThemeToggle } from '../ThemeScope'
import { Cols, GridBar } from './GridBar'
import { GridReceipt } from './GridReceipt'

const FH = 150

function MonthField({ onOpen }: { onOpen: (i: number) => void }) {
  const { ref, w, ticks, days } = useMonthTicks(FH - 40, 0)
  const { active, setActive, onKeyDown } = useTickNav(ticks.length, onOpen)
  const base = FH - 22
  const a = active !== null ? ticks[active] : null
  return (
    <section className="g-month">
      <div className="g-month-head">
        <h2>January, order by order</h2>
        <p>tick height: measured cost; arrows to move, enter to open</p>
      </div>
      <div ref={ref} className="g-mfield" tabIndex={0} role="listbox" aria-label={`${orders.length} orders in ${PERIOD_LABEL}`}
        aria-activedescendant={active !== null ? `gk-${active}` : undefined} onKeyDown={onKeyDown}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = nearest(ticks, e.clientX - r.left); if (i !== null) setActive(i) }}
        onPointerLeave={() => setActive(null)} onClick={() => { if (active !== null) onOpen(active) }}>
        {w > 0 && (
          <svg>
            <line className="base" x1={0} x2={w} y1={base} y2={base} />
            {days.map((d) => <text key={d.d} className="day" x={d.x + 2} y={base + 15}>{String(d.d).padStart(2, '0')}</text>)}
            {ticks.map((t, i) => (
              <g key={t.o.order.orderId} id={`gk-${i}`} role="option" aria-selected={active === i}
                aria-label={`${t.o.order.symbol} ${t.o.order.side} ${t.o.order.type}, ${utcDateTime(t.o.order.createdAt)}, total ${formatUsd(t.usd)}`}>
                <line className="tk" data-on={active === i} x1={t.x} x2={t.x} y1={base} y2={base - t.h} strokeDasharray={t.measured ? undefined : '2 3'} />
              </g>
            ))}
          </svg>
        )}
        {a && (
          <div className="g-pv" style={{ left: Math.max(0, Math.min(w - 280, a.x - 140)) }} aria-hidden>
            <div className="r"><span>{a.o.order.orderId}</span></div>
            <div className="r"><span>{a.o.order.symbol} {a.o.order.side.toLowerCase()}, {(a.o.order.type ?? '').toLowerCase()}</span><span>{utcDateTime(a.o.order.createdAt).slice(5, 16)}</span></div>
            <div className="r t"><span>Total</span><span><span className="hl">{formatUsd(a.usd)}</span> {formatSignedBps(term(a.o, 'total')?.bps)}</span></div>
          </div>
        )}
      </div>
    </section>
  )
}

export function GridOverview({ initialOpen = null }: { initialOpen?: string | null }) {
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [openId, setOpenId] = useState<string | null>(initialOpen)
  const m = monthTotals(filter)
  const t = termTotals(filter)
  const open = openId ? orders.find((o) => o.order.orderId === openId) ?? null : null
  const TERMS = [['spread', 'Spread paid'], ['impactTiming', 'Impact and timing'], ['unfilled', 'Unfilled part'], ['fees', 'Fees']] as const
  return (
    <div className="g-ov" style={{ minHeight: '100dvh' }}>
      <Cols />
      <div className="g-wrap" style={{ borderBottom: '1px solid var(--v3-rule)' }}>
        <GridBar app>
          <span style={{ gridColumn: '3 / span 2', fontWeight: 700, fontSize: 14 }}>{ACCOUNT}</span>
          <span className="g-chip" style={{ gridColumn: '5 / span 3' }}>{PROVENANCE.toLowerCase()}</span>
          <span className="hide-s" style={{ gridColumn: '9 / span 1', fontSize: 14 }}>{PERIOD_LABEL}</span>
          <span className="hide-s" style={{ gridColumn: '10 / span 2' }}><button type="button" className="g-link" style={{ background: 'none', border: 0 }}>Search <span className="mono" style={{ fontSize: 11 }}>⌘K</span></button></span>
          <span style={{ gridColumn: '12 / span 1' }}><ThemeToggle className="g-link" /></span>
        </GridBar>
      </div>
      <main className="g-wrap g-ov-top">
        <h1 className="sr-only">What {PERIOD_LABEL} cost</h1>
        <div className="g-12" style={{ alignItems: 'end' }}>
          <div className="g-total"><Counter value={m.usd} text={formatUsd(m.usd)} format={USD_FORMAT} /></div>
          <div className="g-grade" role="img" aria-label={`Graded ${account.v2.grade}, ${formatScore(account.v2.composite)} of 100`}>
            <span className="letter" aria-hidden>{account.v2.grade}</span>
            <div aria-hidden>
              <div className="sc">{formatScore(account.v2.composite)}</div>
              <div className="meta">measured score, scoring {account.v2.scoringVersion}<br />band {formatScore(account.v2.band[0])} to {formatScore(account.v2.band[1])}<br />v1 (rule-based, frozen): {account.v1.grade}, {formatScore(account.v1.score)}</div>
            </div>
          </div>
          <p className="g-ov-cap">
            <strong><Counter value={m.orders} text={String(m.orders)} format={{ maximumFractionDigits: 0 }} /> orders</strong> paid <span className="hl">{formatUsd(m.usd)}</span> in {PERIOD_LABEL}: {formatSignedBps(m.bps)} of the {formatUsd(m.notional)} they set out to trade, measured against Binance public prints.
          </p>
          <div className="g-seg" role="group" aria-label="Orders">
            {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
          </div>
        </div>
        <MonthField onOpen={(i) => setOpenId(orders[i].order.orderId)} />
        <div className="g-terms">
          {TERMS.map(([k, label], i) => (
            <div key={k} className="g-row">
              <span className="ix">{String(i + 1).padStart(2, '0')}</span>
              <span className={`lab${i % 2 ? ' ind' : ''}`}>{label}</span>
              <span className="src">sum over {m.orders} orders</span>
              <span className="bps" />
              <span className="usd"><Counter value={t[k]} text={formatUsd(t[k])} format={USD_FORMAT} /></span>
            </div>
          ))}
        </div>
      </main>
      <GridReceipt order={open} onClose={() => setOpenId(null)} />
    </div>
  )
}

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { USD_FORMAT } from '../../../ui/Figure'
import { formatScore } from '../../../ui/format'
import { Counter } from '../Counter'
import { ACCOUNT, account, FILTERS, formatSignedBps, formatUsd, monthTotals, orders, PERIOD_LABEL, PROVENANCE, term, termTotals, utcDateTime, type OrderFilter } from '../data'
import { nearest, useMonthTicks, useTickNav } from '../month'
import { ThemeToggle } from '../ThemeScope'
import { GradeStamp } from './GradeStamp'
import { TapeReceipt } from './TapeReceipt'

const INT = { maximumFractionDigits: 0 } as const
const TAPE_H = 132

/** The month as a ticker tape: one tick per order on January's time axis. Hover, focus or arrow keys preview the order's
 *  receipt; a click or Enter prints it. */
function MonthTape({ onOpen }: { onOpen: (i: number) => void }) {
  const { ref, w, ticks, days } = useMonthTicks(TAPE_H - 56, 18)
  const { active, setActive, onKeyDown } = useTickNav(ticks.length, onOpen)
  const base = TAPE_H - 30
  const a = active !== null ? ticks[active] : null
  return (
    <div className="t-month">
      <div className="t-month-head">
        <h2>January, order by order</h2>
        <p>Height: the order&apos;s measured cost. Hover or use the arrow keys; Enter prints the receipt.</p>
      </div>
      <div ref={ref} className="t-mtape" tabIndex={0} role="listbox" aria-label={`${orders.length} orders in ${PERIOD_LABEL}`}
        aria-activedescendant={active !== null ? `tk-${active}` : undefined} onKeyDown={onKeyDown}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const i = nearest(ticks, e.clientX - r.left); if (i !== null) setActive(i) }}
        onPointerLeave={() => setActive(null)} onClick={() => { if (active !== null) onOpen(active) }}>
        {w > 0 && (
          <svg aria-hidden={false}>
            {days.map((d) => (
              <g key={d.d}>
                <line className="t-day-rule" x1={d.x} x2={d.x} y1={base + 2} y2={base + 7} />
                {(d.d === 1 || d.d % 2 === 1) && <text className="t-day" x={d.x + 3} y={base + 18}>{d.d}</text>}
              </g>
            ))}
            {ticks.map((t, i) => (
              <g key={t.o.order.orderId} id={`tk-${i}`} role="option" aria-selected={active === i}
                aria-label={`${t.o.order.symbol} ${t.o.order.side} ${t.o.order.type}, ${utcDateTime(t.o.order.createdAt)}, total ${formatUsd(t.usd)}`}>
                <line className="t-tick" data-on={active === i} x1={t.x} x2={t.x} y1={base} y2={base - t.h} strokeDasharray={t.measured ? undefined : '2 3'} />
              </g>
            ))}
          </svg>
        )}
        {a && (
          <div className="t-preview" style={{ left: Math.max(0, Math.min(w - 250, a.x - 125)) }} aria-hidden>
            <div className="row"><span>{a.o.order.symbol} {a.o.order.side}</span><span>{a.o.order.type}</span></div>
            <div className="row g"><span>{utcDateTime(a.o.order.createdAt).slice(5, 21)}</span></div>
            <div className="row" style={{ marginTop: 6 }}><span>TOTAL</span><span>{formatUsd(a.usd)}</span></div>
            <div className="row g"><span /><span>{formatSignedBps(term(a.o, 'total')?.bps)}</span></div>
            <div className="hint">Click or Enter prints the receipt</div>
          </div>
        )}
      </div>
    </div>
  )
}

export function TapeOverview({ initialOpen = null }: { initialOpen?: string | null }) {
  const [filter, setFilter] = useState<OrderFilter>('all')
  const [openId, setOpenId] = useState<string | null>(initialOpen)
  const m = monthTotals(filter)
  const t = termTotals(filter)
  const open = openId ? orders.find((o) => o.order.orderId === openId) ?? null : null
  return (
    <>
      <header className="t-app-bar">
        <Link href="/design-lab/v3/tape/hero" className="t-mark" aria-label="FillScore">FillScore<i aria-hidden /></Link>
        <span className="t-acct">{ACCOUNT}</span>
        <span className="t-chip">{PROVENANCE}</span>
        <span className="sp" />
        <span style={{ fontSize: 14, fontWeight: 500 }}>{PERIOD_LABEL}</span>
        <button type="button" className="t-k">Search <kbd>⌘K</kbd></button>
        <ThemeToggle className="t-toggle" />
      </header>
      <main className="t-ov">
        <div className="t-ov-top">
          <div>
            <div className="t-seg" role="group" aria-label="Orders">
              {FILTERS.map((f) => <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
            </div>
            <h1 className="sr-only">What {PERIOD_LABEL} cost</h1>
            <div className="t-total"><Counter value={m.usd} text={formatUsd(m.usd)} format={USD_FORMAT} /></div>
            <p className="t-cap">
              <b><Counter value={m.orders} text={String(m.orders)} format={INT} /> orders</b> paid <b>{formatUsd(m.usd)}</b> in {PERIOD_LABEL}, {formatSignedBps(m.bps)} of the {formatUsd(m.notional)} they set out to trade.
            </p>
            <p className="t-sub">Measured against Binance public prints. Fees are the account&apos;s real rates.</p>
          </div>
          <div className="t-stamp-wrap">
            <GradeStamp grade={account.v2.grade} score={account.v2.composite} period={PERIOD_LABEL} version={account.v2.scoringVersion} />
            <p className="t-stamp-note">
              Measured score, band {formatScore(account.v2.band[0])} to {formatScore(account.v2.band[1])}. The earlier rule-based score (v1, frozen) was {account.v1.grade}, {formatScore(account.v1.score)}.
            </p>
          </div>
        </div>
        <MonthTape onOpen={(i) => setOpenId(orders[i].order.orderId)} />
        <div className="t-terms">
          {([['spread', 'Spread paid'], ['impactTiming', 'Impact and timing'], ['unfilled', 'Unfilled part'], ['fees', 'Fees']] as const).map(([k, label]) => (
            <div key={k} className="t-term"><div className="l">{label}</div><div className="v"><Counter value={t[k]} text={formatUsd(t[k])} format={USD_FORMAT} /></div></div>
          ))}
        </div>
      </main>
      <TapeReceipt order={open} onClose={() => setOpenId(null)} />
    </>
  )
}

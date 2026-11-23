'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Search, X } from 'lucide-react'
import type { LedgerOrder, Replay } from '../lib/data'
import { bps, money, tableTime } from '../lib/format'
import { PricePrintsChart, type FillPoint, type TradePoint } from './Charts'
import { Receipt } from './Receipt'

export interface ReceiptData { replay: Replay; trades: TradePoint[]; fills: FillPoint[]; arrivalMs: number | null; quote: string; source: string | null }

const PHONE = '(max-width: 767px)'
const subscribePhone = (cb: () => void) => { const mq = window.matchMedia(PHONE); mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb) }
const sideWord = (s: string) => (s === 'BUY' ? 'Buy' : 'Sell')
const typeWord = (t: string) => t.charAt(0) + t.slice(1).toLowerCase()
const statusWord = (s: string) => (s === 'CANCELED' ? 'Cancelled' : typeWord(s.replace('_', ' ')))

/** Orders (PROPOSAL §5): the cost is a default column; a row opens the receipt in a side sheet (a full-height sheet on phones). */
export function OrdersClient({ orders, receipts, demo, initialOrder }: { orders: LedgerOrder[]; receipts: Record<string, ReceiptData>; demo: boolean; initialOrder?: string }) {
  const [q, setQ] = useState('')
  const [side, setSide] = useState<'all' | 'BUY' | 'SELL'>('all')
  const [open, setOpen] = useState<string | null>(initialOrder ?? null)
  // below 768 px the rows are cards; the server renders the table and the client switches after the first paint
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)
  const opener = useRef<HTMLElement | null>(null)
  const rows = useMemo(() => orders.filter((o) => (side === 'all' || o.side === side) && (!q || `${o.symbol} ${o.orderId}`.toLowerCase().includes(q.toLowerCase()))), [orders, q, side])
  const shown = rows.slice(0, 50)
  const close = () => { setOpen(null); opener.current?.focus() }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const pick = (id: string, el: HTMLElement) => { opener.current = el; setOpen(id) }
  const r = open ? receipts[open] : undefined
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 lg:px-8">
        <label className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
          <span className="sr-only">Search orders</span>
          <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--v-muted)]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol or order id" className="v-input" />
        </label>
        <div className="v-seg" role="group" aria-label="Side">
          {(['all', 'BUY', 'SELL'] as const).map((s) => <button key={s} type="button" aria-pressed={side === s} onClick={() => setSide(s)}>{s === 'all' ? 'All' : sideWord(s)}</button>)}
        </div>
        <p className="ml-auto text-[13px] text-[var(--v-text-2)]">{shown.length < rows.length ? `First 50 of ${rows.length} orders` : `${rows.length} orders`}</p>
      </div>

      {/* desktop and tablet: table (one variant is rendered, chosen by the viewport, so a row has one target) */}
      {!phone ? <div className="mx-4 overflow-x-auto rounded-[10px] border border-[var(--v-border)] bg-[var(--v-surface)] lg:mx-8">
        <table className="v-table">
          <thead><tr><th>Placed (UTC)</th><th>Symbol</th><th>Side</th><th>Type</th><th>Status</th><th className="num">Notional</th><th className="num">{demo ? 'Fees (published rate)' : 'Fees'}</th><th className="num">Cost</th><th className="num">Cost (bps)</th></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.key} data-testid="orders-row" data-clickable tabIndex={0} onClick={(e) => pick(o.orderId, e.currentTarget)} onKeyDown={(e) => { if (e.key === 'Enter') pick(o.orderId, e.currentTarget) }}>
                <td>{tableTime(o.placedAt)}</td><td className="font-medium">{o.symbol}</td><td>{sideWord(o.side)}</td><td>{typeWord(o.type)}</td>
                <td className={o.status === 'FILLED' ? '' : 'text-[var(--v-text-2)]'}>{statusWord(o.status)}</td>
                <td className="num">{money(o.notionalUsd)}</td><td className="num">{money(o.feesUsd)}</td>
                <td className="num font-semibold">{money(o.cost.usd) ?? <span className="text-[var(--v-text-2)]">insufficient data</span>}{o.fills === 0 && o.cost.usd !== null ? <span className="block text-[12px] font-normal text-[var(--v-text-2)]">modelled, not paid</span> : null}</td>
                <td className="num">{bps(o.cost.bps) ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div> : null}

      {/* phone: row cards (time, symbol and side first; cost on the right) */}
      {phone ? <ul className="mx-4 flex flex-col gap-2">
        {shown.map((o) => (
          <li key={o.key}>
            <button type="button" data-testid="orders-row" onClick={(e) => pick(o.orderId, e.currentTarget)} className="v-card flex w-full items-start justify-between gap-3 p-3 text-left">
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold">{o.symbol} · {sideWord(o.side)} {typeWord(o.type).toLowerCase()}</span>
                <span className="block text-[13px] text-[var(--v-text-2)]">{tableTime(o.placedAt)} UTC · {statusWord(o.status)}</span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[15px] font-semibold">{money(o.cost.usd) ?? 'insufficient data'}</span>
                <span className="block text-[13px] text-[var(--v-text-2)]">{o.fills === 0 && o.cost.usd !== null ? 'modelled, not paid' : bps(o.cost.bps) ?? ''}</span>
              </span>
            </button>
          </li>
        ))}
      </ul> : null}

      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Order receipt">
          <button type="button" aria-label="Close" className="v-scrim absolute inset-0 bg-black/40" onClick={close} />
          <div className="v-sheet absolute inset-y-0 right-0 flex w-full max-w-[920px] flex-col overflow-y-auto bg-[var(--v-bg)] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--v-border)] bg-[var(--v-bg)] px-4 py-3 lg:px-6">
              <p className="text-[16px] font-semibold">{r ? `${r.replay.order.symbol} · ${sideWord(r.replay.order.side)} ${typeWord(r.replay.order.type).toLowerCase()}` : 'Order'}</p>
              <button type="button" className="v-icon-btn" aria-label="Close the receipt" onClick={close} autoFocus><X size={20} aria-hidden="true" /></button>
            </div>
            {r ? (
              <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-6">
                <Receipt replay={r.replay} demo={demo} />
                <section className="v-card flex flex-col gap-3 p-4">
                  <h2 className="text-[16px] font-semibold">Public trades around this order</h2>
                  {r.trades.length && r.arrivalMs !== null ? (
                    <>
                      <p className="text-[14px] text-[var(--v-text-2)]">Each mark is a trade on Binance in the seconds around the order; your fills are the diamonds.</p>
                      <PricePrintsChart trades={r.trades} fills={r.fills} quote={r.quote} arrivalMs={r.arrivalMs} />
                      {r.source ? <p className="text-[12px] text-[var(--v-muted)]">Source: {r.source}</p> : null}
                    </>
                  ) : (
                    <p className="text-[14px] text-[var(--v-text-2)]">No public trades were stored for this order: it has no fills, so there was nothing to compare.</p>
                  )}
                </section>
              </div>
            ) : (
              <p className="p-6 text-[14px] text-[var(--v-text-2)]">This order&apos;s receipt is not in the prototype&apos;s fixtures (they hold 14 receipts per demo account); the production page loads it from the server.</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  )
}

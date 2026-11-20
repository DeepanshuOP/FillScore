/**
 * Design v3 lab data. Every number comes from committed fixtures cut by deterministic code from the offline demo build
 * (demo-moderate, January 2024; trader behaviour synthetic, prices real):
 *  - the hero order: ../fixtures/landing-order.* (the order chosen by the stated rule in app/lib/landing/heroOrder.ts,
 *    with the real Binance public prints around it and the production replay);
 *  - the account: ../fixtures/dashboard-mock.json (GET /api/audit/v2 and the order summary, as served);
 *  - the month: ./fixtures/month-orders.json (every order through the production buildOrderReplay; cut-month.ts).
 * Nothing here invents a value; the helpers only filter, sum and format.
 */
import heroInputs from '../../lib/landing/fixtures/landing-order.inputs.json'
import heroReplay from '../../lib/landing/fixtures/landing-order.replay.json'
import dash from '../fixtures/dashboard-mock.json'
import month from './fixtures/month-orders.json'
import { formatSignedBps, formatUsd } from '../../ui/format'

export type TermKey = 'execution' | 'spread' | 'impactTiming' | 'unfilled' | 'fees' | 'total'
export interface Term { key: string; label: string; bps: number | null; usd: number | null; reason?: string | null }
export interface MonthOrder {
  order: { orderId: string; symbol: string; side: string; type: string | null; status: string; createdAt: string; updatedAt: string; quantity: number; executedQuantity: number }
  intendedNotional: number | null
  fills: Array<{ time: string; price: number; quantity: number; notional: number; feeUsd: number | null; isMaker: boolean | null }>
  decomposition: Term[]
  expectedCost: { applies: boolean; expectedBps: number | null; lowBps: number | null; highBps: number | null; reason: string | null } | null
  sources: Array<{ label: string; sha256: string | null }>
  notes: string[]
}

export const ACCOUNT = dash.account
export const PROVENANCE = 'Synthetic trader, real prices'
export const PERIOD_LABEL = 'January 2024'
export const orders = month.orders as unknown as MonthOrder[]
export const HERO_ID = heroInputs.order.orderId
export const heroOrder = orders.find((o) => o.order.orderId === HERO_ID) as MonthOrder

export const account = {
  totals: dash.totals,
  terms: dash.termsUsd,
  v2: dash.v2,
  v1: dash.v1,
  integrityHash: dash.v2.integrityHash,
  keyFingerprint: dash.evidenceKeyFingerprint,
}

export const term = (o: MonthOrder, key: TermKey): Term | undefined => o.decomposition.find((d) => d.key === key)

/** The four cost lines a receipt prints, in the product's order (execution is their parent and is not repeated). */
export const RECEIPT_LINES: Array<{ key: TermKey; label: string }> = [
  { key: 'spread', label: 'Spread paid' },
  { key: 'impactTiming', label: 'Impact and timing' },
  { key: 'unfilled', label: 'Unfilled part' },
  { key: 'fees', label: 'Fees' },
]

export type OrderFilter = 'all' | 'MARKET' | 'LIMIT'
export const FILTERS: Array<{ id: OrderFilter; label: string }> = [
  { id: 'all', label: 'All orders' },
  { id: 'MARKET', label: 'Market' },
  { id: 'LIMIT', label: 'Limit' },
]

/**
 * Sum of the measured totals and of the intended notional over the same orders, for one order type. bps = usd / notional:
 * the rule of backend/src/services/orderSummary.ts termTotals (orders without a stated notional are left out of both).
 */
export function monthTotals(filter: OrderFilter) {
  const rows = orders.filter((o) => filter === 'all' || o.order.type === filter)
  let usd = 0, notional = 0, measured = 0
  for (const o of rows) {
    const t = term(o, 'total')
    if (!t || typeof t.usd !== 'number' || typeof o.intendedNotional !== 'number' || !(o.intendedNotional > 0)) continue
    usd += t.usd; notional += o.intendedNotional; measured++
  }
  return { orders: rows.length, measured, usd, notional, bps: notional > 0 ? (usd / notional) * 1e4 : null }
}

export function termTotals(filter: OrderFilter): Record<'spread' | 'impactTiming' | 'unfilled' | 'fees', number> {
  const out = { spread: 0, impactTiming: 0, unfilled: 0, fees: 0 }
  for (const o of orders) {
    if (filter !== 'all' && o.order.type !== filter) continue
    for (const k of Object.keys(out) as Array<keyof typeof out>) {
      const t = term(o, k)
      if (t && typeof t.usd === 'number') out[k] += t.usd
    }
  }
  return out
}

/* ---------------- the hero tape: real prints, the quote at arrival and the order's fills ---------------- */

export type TapeEntry =
  | { kind: 'print'; ts: number; price: number; qty: number; buyerInitiated: boolean; id: number }
  | { kind: 'quote'; ts: number; bid: number; ask: number; mid: number }
  | { kind: 'fill'; ts: number; price: number; qty: number; feeUsd: number; n: number; of: number }

const tape = heroInputs.tape
export const heroTape = {
  symbol: tape.symbol,
  date: tape.date,
  source: tape.source,
  sourceSha256: tape.sourceSha256,
  arrivalMs: tape.arrivalMs,
  side: heroInputs.order.side,
  type: heroInputs.order.type,
}

export function heroEntries(): TapeEntry[] {
  const quote = [...tape.mid].filter((m) => m.ts <= tape.arrivalMs).sort((a, b) => b.ts - a.ts)[0]
  const fills = [...heroInputs.fills].sort((a, b) => (a.executedAt < b.executedAt ? -1 : 1))
  const rows: TapeEntry[] = [
    ...tape.prints.map((p) => ({ kind: 'print' as const, ts: p.ts, price: p.price, qty: p.qty, buyerInitiated: p.buyerInitiated, id: p.id })),
    { kind: 'quote' as const, ts: tape.arrivalMs, bid: quote.bid, ask: quote.ask, mid: quote.mid },
    ...fills.map((f, i) => ({ kind: 'fill' as const, ts: Date.parse(f.executedAt), price: f.executionPrice, qty: f.quantity, feeUsd: f.feeUsd, n: i + 1, of: fills.length })),
  ]
  // Stable order: by time; at equal time the quote first, then fills, then prints.
  const rank = { quote: 0, fill: 1, print: 2 }
  return rows.sort((a, b) => a.ts - b.ts || rank[a.kind] - rank[b.kind])
}

export const heroCosts = (() => {
  const d = heroReplay.decomposition as Term[]
  const get = (k: string) => d.find((x) => x.key === k) as Term
  const fees = get('fees'), total = get('total')
  return {
    spread: get('spread'), impactTiming: get('impactTiming'), unfilled: get('unfilled'), fees, total,
    // Share of the order's measured total that was fees (both from the replay).
    feeShare: typeof fees.usd === 'number' && typeof total.usd === 'number' && total.usd !== 0 ? fees.usd / total.usd : null,
    expected: heroReplay.expectedCost,
    sources: heroReplay.sources,
    notes: heroReplay.notes,
  }
})()

/* ---------------- formatting (canonical helpers from app/ui/format.ts, plus tape-only forms) ---------------- */

export { formatUsd, formatSignedBps }
const PRICE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatPrice = (v: number) => PRICE.format(v)
export const formatQty = (v: number) => {
  const s = v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
  return s
}
export const formatPct = (v: number | null) => (v === null ? 'not computed' : `${(v * 100).toFixed(2)}%`)
export const utcTime = (ms: number | string) => new Date(ms).toISOString().slice(11, 23)
export const utcDateTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 23)} UTC`
export const dayOfMonth = (iso: string) => Number(iso.slice(8, 10))

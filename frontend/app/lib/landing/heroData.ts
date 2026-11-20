/**
 * The landing page's order, as data (design v3). Every number is copied from the committed fixtures cut from the offline
 * demo build: `fixtures/landing-order.inputs.json` (the real Binance public prints of 28 January 2024 around the order,
 * the quote mid and the order's fills) and `fixtures/landing-order.replay.json` (the production replay of the order).
 * The order is the one the stated rule picks (heroOrder.ts). Nothing here invents a value; the helpers sort and format.
 */
import inputs from './fixtures/landing-order.inputs.json'
import replay from './fixtures/landing-order.replay.json'
import { formatSignedBps, formatUsd } from '../../ui/format'

export interface HeroTerm { key: string; label: string; bps: number | null; usd: number | null }
export type TapeEntry =
  | { kind: 'print'; ts: number; price: number; qty: number; buyerInitiated: boolean; id: number }
  | { kind: 'quote'; ts: number; bid: number; ask: number }
  | { kind: 'fill'; ts: number; price: number; qty: number; n: number; of: number }

const tape = inputs.tape
export const heroTape = { symbol: tape.symbol, date: tape.date, sourceSha256: tape.sourceSha256, side: inputs.order.side, type: inputs.order.type }

/** The prints, the quote in force at the order's arrival, and the fills, in time order (at equal time: quote, fills, prints). */
export function heroEntries(): TapeEntry[] {
  const quote = [...tape.mid].filter((m) => m.ts <= tape.arrivalMs).sort((a, b) => b.ts - a.ts)[0]
  const fills = [...inputs.fills].sort((a, b) => (a.executedAt < b.executedAt ? -1 : 1))
  const rows: TapeEntry[] = [
    ...tape.prints.map((p) => ({ kind: 'print' as const, ts: p.ts, price: p.price, qty: p.qty, buyerInitiated: p.buyerInitiated, id: p.id })),
    { kind: 'quote' as const, ts: tape.arrivalMs, bid: quote.bid, ask: quote.ask },
    ...fills.map((f, i) => ({ kind: 'fill' as const, ts: Date.parse(f.executedAt), price: f.executionPrice, qty: f.quantity, n: i + 1, of: fills.length })),
  ]
  const rank = { quote: 0, fill: 1, print: 2 }
  return rows.sort((a, b) => a.ts - b.ts || rank[a.kind] - rank[b.kind])
}

const terms = replay.decomposition as HeroTerm[]
const get = (k: string) => terms.find((t) => t.key === k) as HeroTerm
export const heroCosts = {
  spread: get('spread'), impactTiming: get('impactTiming'), fees: get('fees'), total: get('total'),
  /** Share of the order's measured total that was fees, both from the replay. */
  feeShare: (() => { const f = get('fees').usd, t = get('total').usd; return typeof f === 'number' && typeof t === 'number' && t !== 0 ? f / t : null })(),
}

const PRICE = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const formatPrice = (v: number) => PRICE.format(v)
export const formatQty = (v: number) => v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
export const formatPct = (v: number | null) => (v === null ? 'not computed' : `${(v * 100).toFixed(2)}%`)
export const utcTime = (ms: number) => new Date(ms).toISOString().slice(11, 23)
export { formatSignedBps, formatUsd }

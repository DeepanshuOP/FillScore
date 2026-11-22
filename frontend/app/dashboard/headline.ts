/**
 * View model of the dashboard headline (M8 phase 2b, part 1). Pure: every number is copied from GET /api/audit/orders-summary
 * and GET /api/audit/v2, which computed them from stored documents; this file only arranges them, in the past tense.
 * A figure that was not measured is null (the screen then shows a ValueState), never zero.
 */
import { formatSignedBps, formatUsd } from '../ui/format'
import { formatBps } from '../utils/formatBps'
import type { BarRow } from '../ui/ChartFrame'
import type { CostVsExpected } from './scoreV2'
import type { OrderCounts } from './ordersTable'
import { formatPeriodLabel } from '../utils/periodLabel'

interface Term { usd: number; bps: number; n: number }
interface Totals { execution?: Term | null; spread?: Term | null; impactTiming?: Term | null; opportunity?: Term | null; fees?: Term | null; total?: Term | null }
interface OrdersBody { available?: boolean; unfilledCost?: { usd?: number | null; count?: number; measured?: number } | null; shortfall?: { n: number; unmeasured: number; totals?: Totals | null } | null }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export interface Headline {
  /** Orders the total covers. */
  orders: number
  totalUsd: number
  totalBps: number
  /** The part measured against market prices. For a demo account the fees are generated at the published rate and are left out. */
  measuredUsd: number
  /** Present for a demo account: the fees at the published rate, which no market data checks. */
  feesUsd: number | null
  feesNotMeasured: boolean
  unmeasuredOrders: number
  /** The server's dollars of the total that sit in orders that never filled (modelled, not paid); null when not measured. */
  unfilledUsd: number | null
  /** The orders that never filled and were measured: the ones the dollars above come from; null when none. */
  unfilledOrders: number | null
}

function totalsOf(body: unknown): Totals | null {
  const b = body as OrdersBody | null
  if (!b || b.available !== true) return null
  return b.shortfall?.totals ?? null
}

export function describeHeadline(body: unknown, isDemo: boolean): Headline | null {
  const t = totalsOf(body)
  const total = t?.total
  if (!t || !total || !isNum(total.usd) || !isNum(total.bps)) return null
  const fees = t.fees && isNum(t.fees.usd) ? t.fees.usd : null
  const split = isDemo && fees !== null
  return {
    orders: total.n,
    totalUsd: total.usd,
    totalBps: total.bps,
    measuredUsd: split ? total.usd - fees : total.usd,
    feesUsd: split ? fees : null,
    feesNotMeasured: split,
    unmeasuredOrders: (body as OrdersBody).shortfall?.unmeasured ?? 0,
    unfilledUsd: isNum((body as OrdersBody).unfilledCost?.usd) ? ((body as OrdersBody).unfilledCost!.usd as number) : null,
    unfilledOrders: isNum((body as OrdersBody).unfilledCost?.measured) ? ((body as OrdersBody).unfilledCost!.measured as number) : null,
  }
}

const bps3 = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(v).toFixed(3)} bps`

/** The ruler dot's note (design v3.1 fixes A6): paid, expected and the difference as the server sent them, to three decimals. */
export function dotNote(c: { paidBps: number; expectedBps: number; excessBps: number }): string {
  return `Paid ${bps3(c.paidBps)}, expected ${bps3(c.expectedBps)}, difference ${bps3(c.excessBps)}.`
}

/** A demo's total cost as the server sent it, in bps of the value ordered ("11.7 bps"); null without a headline. */
export function totalBpsLabel(h: Pick<Headline, 'totalBps'> | null): string | null {
  return h ? formatBps(h.totalBps) : null
}

/**
 * The total's one sentence (design v3.1 fixes A1). The total includes the modelled cost of orders that never filled,
 * which nobody paid, so it says "cost" and names that share as the server sent it. No share (none unfilled, or not
 * measured) leaves the clause out; it never prints a zero it was not sent.
 */
export function totalSentence(h: Pick<Headline, 'orders' | 'totalUsd' | 'unfilledUsd' | 'unfilledOrders'>): string {
  const noun = `The ${h.orders.toLocaleString('en-US')} ${h.orders === 1 ? 'order' : 'orders'} cost ${formatUsd(h.totalUsd)}`
  if (h.unfilledUsd === null || !(h.unfilledUsd > 0) || !h.unfilledOrders) return `${noun} in total.`
  return `${noun}, including ${formatUsd(h.unfilledUsd)} the market moved away from ${missedOrders(h.unfilledOrders)}.`
}

/** F2: "11 orders that never filled". Money did not leave the account for them: the market moved away from the order. */
export const missedOrders = (n: number): string => `${n.toLocaleString('en-US')} ${n === 1 ? 'order that never filled' : 'orders that never filled'}`

export interface Bars {
  title: string
  summary: string
  rows: BarRow[]
  table: Array<{ label: string; value: string; note?: string }>
}

const BAR_TERMS: Array<[keyof Totals, string]> = [['fees', 'Fees'], ['opportunity', 'Unfilled orders'], ['spread', 'Spread paid'], ['impactTiming', 'Impact and timing']]

/** Where the money went: one row per term, in dollars. A term with no value is left out of the bars and read "not computed" in the table. */
export function barRows(body: unknown, isDemo: boolean): Bars | null {
  const t = totalsOf(body)
  const total = t?.total
  if (!t || !total || !isNum(total.usd)) return null
  const rows: BarRow[] = []
  const table: Bars['table'] = []
  for (const [key, label] of BAR_TERMS) {
    const term = t[key]
    const demoFee = isDemo && key === 'fees'
    if (!term || !isNum(term.usd)) {
      table.push({ label, value: 'not computed' })
      continue
    }
    rows.push({ label, value: term.usd, valueLabel: formatUsd(term.usd), ...(demoFee ? { unmeasured: true, note: 'published rate' } : {}) })
    table.push({ label, value: formatUsd(term.usd), ...(demoFee ? { note: 'at the published rate, not independently measured' } : {}) })
  }
  table.push({ label: 'Total', value: formatUsd(total.usd) })
  const said = rows.map((r) => `${r.label.charAt(0).toLowerCase()}${r.label.slice(1)} ${r.valueLabel}`).join('; ')
  return { title: `Where the ${formatUsd(total.usd)} went`, summary: `By term: ${said}.`, rows, table }
}

/** The orders the total leaves out, in a sentence that agrees in number ("" when every order was measured). */
export function unmeasuredNote(n: number): string {
  if (n <= 0) return ''
  return n === 1 ? '1 order was not measured and is not in it.' : `${n} orders were not measured and are not in it.`
}

const plus = (v: number) => (v > 0 ? '+' : '') + formatSignedBps(v)

/**
 * The one short sentence under the headline: difference, interval and n. The method (what "expected" is, what the
 * interval leaves out) is in the section "Cost against what was expected", not here.
 */
export function costSentence(c: CostVsExpected | undefined): string | null {
  if (!c || c.insufficient) return null   // no number: the headline shows a ValueState with costInsufficientReason instead
  const interval = c.lowBps !== null && c.highBps !== null
    ? `${Math.round(c.level * 100)}% interval ${plus(c.lowBps)} to ${plus(c.highBps)}` : 'no interval'
  return `Market orders cost ${formatSignedBps(c.paidBps)} against ${formatSignedBps(c.expectedBps)} expected: difference ${plus(c.excessBps)}, ${interval}, ${c.n} orders.`
}

/** What is missing when cost against expected has no figure; null when there is one. */
export function costInsufficientReason(c: CostVsExpected | undefined): string | null {
  if (!c) return 'no market context was stored for these orders'
  return c.insufficient ? c.reason : null
}

interface Current { fills: number; orders: number; notionalUsd: number | null; makerRatio: number | null }
interface AuditScope { totalTrades: number; totalNotional: number; breakdown: { makerRatio: number }; period: { start: string; end: string }; exchange: string }
const VENUES: Record<string, string> = { binance: 'Binance', bybit: 'Bybit', okx: 'OKX', multi: 'Several venues' }
const int = new Intl.NumberFormat('en-US')
const pct = (r: number | null) => (r === null ? 'not computed' : `${Math.round(r * 100)}%`)

/** The facts that say what the headline covers, as label and value. A rebuilt account (`current`) reads its present fills and orders. */
export function scopeFacts(audit: AuditScope, current: Current | null | undefined, counts?: OrderCounts | null): Array<[string, string]> {
  const period = formatPeriodLabel(audit.period.start, audit.period.end)
  const venue = VENUES[audit.exchange?.toLowerCase()] ?? audit.exchange
  // A5: the orders that produced fills, as the server counts them (orderCounts), when it sent the counts
  const fills = counts ? counts.fills : current?.fills
  // orders with fills: the stored orders that have a fill, plus the fill groups whose order is not stored (each is one order)
  const orders = counts ? counts.withFills + counts.unrecorded : current?.orders
  const rest: Array<[string, string]> = current && typeof fills === 'number' && typeof orders === 'number'
    ? [['Fills', `${int.format(fills)}, in ${int.format(orders)} ${orders === 1 ? 'order' : 'orders'}`],
      ['Value traded', formatUsd(current.notionalUsd)], ['Maker share of fills', pct(current.makerRatio)]]
    : [['Fills', int.format(audit.totalTrades)], ['Value traded', formatUsd(audit.totalNotional)], ['Maker share of fills', pct(audit.breakdown.makerRatio)]]
  return [['Period', period], ['Venue', venue], ...rest]
}

export type GradeView =
  | { kind: 'graded'; letter: string; score: number; scoringVersion: string }
  | { kind: 'none'; text: string }

/** The measured (v2) grade for the headline. No letter is shown below the minimum sample. null while the answer is not in. */
export function gradeView(status: number | null, body: unknown): GradeView | null {
  if (status === null) return null
  if (status === 404) return { kind: 'none', text: 'No measured grade yet. It is computed after the orders are synced and measured.' }
  const b = body as { scoringVersion?: string; result?: { grade: string | null; composite: number | null; reason: string | null; fills: number } } | null
  if (status !== 200 || !b?.result) return { kind: 'none', text: 'The measured grade could not be loaded.' }
  const r = b.result
  if (r.grade && r.composite !== null) return { kind: 'graded', letter: r.grade, score: r.composite, scoringVersion: b.scoringVersion ?? '' }
  const why = r.reason?.startsWith('fewer than') ? `${r.reason} (${r.fills} so far)` : 'at least one component had insufficient data'
  return { kind: 'none', text: `No letter grade: ${why}.` }
}

import type { GradeView, Headline } from './headline'
import { bps, count, money } from '../lib/format'

/**
 * The four KPI tiles of Home and Costs (design v5, PROPOSAL §5): Total cost, Fees, Unfilled orders (modelled), Execution grade.
 * Formatting and selection of served values only: nothing is computed. A figure that is missing reads "not computed" (the state the
 * production page already used for a missing headline); a fee that was not independently measured says so under the figure, and the
 * total says how much of it was modelled for unfilled orders (review of 2026-11-24: part of a demo's total was never paid).
 */
export interface TileSpec { id: 'total' | 'fees' | 'unfilled' | 'grade'; label: string; value: string; sub?: string }

interface Term { usd: number; bps: number }
const termOf = (ordersBody: unknown, key: 'fees'): Term | null => {
  const t = (ordersBody as { shortfall?: { totals?: Record<string, Term | null> | null } | null } | null)?.shortfall?.totals?.[key]
  return t && Number.isFinite(t.usd) ? t : null
}

export function kpiTiles(headline: Headline | null, ordersBody: unknown, grade: GradeView | null, band: [number, number] | null): TileSpec[] {
  const fees = termOf(ordersBody, 'fees')
  const total: TileSpec = headline
    ? { id: 'total', label: 'Total cost', value: money(headline.totalUsd) ?? 'not computed',
        sub: [bps(headline.totalBps), count(headline.orders, 'order'), headline.unfilledUsd ? `includes ${money(headline.unfilledUsd)} modelled for unfilled orders` : null].filter(Boolean).join(', ') }
    : { id: 'total', label: 'Total cost', value: 'not computed' }
  const feeTile: TileSpec = fees
    ? { id: 'fees', label: 'Fees', value: money(fees.usd) ?? 'not computed', sub: headline?.feesNotMeasured ? 'published rate, not independently measured' : (bps(fees.bps) ?? undefined) }
    : { id: 'fees', label: 'Fees', value: 'insufficient data', sub: 'no fee was stored for these orders' }
  const unfilled: TileSpec = headline && headline.unfilledUsd !== null
    ? { id: 'unfilled', label: 'Unfilled orders (modelled)', value: money(headline.unfilledUsd) ?? 'not computed',
        sub: headline.unfilledOrders !== null ? `${count(headline.unfilledOrders, 'order')} that never filled` : undefined }
    : { id: 'unfilled', label: 'Unfilled orders (modelled)', value: 'insufficient data', sub: 'no unfilled order was measured' }
  const g: TileSpec = grade && grade.kind === 'graded'
    ? { id: 'grade', label: 'Execution grade', value: `${grade.letter}, ${grade.score.toFixed(1)}`,
        sub: `of 100, measured (score ${grade.scoringVersion.replace(/^v/, '')})${band ? `, range ${band[0].toFixed(1)} to ${band[1].toFixed(1)}` : ''}` }
    : { id: 'grade', label: 'Execution grade', value: 'not computed', sub: grade?.kind === 'none' ? grade.text : undefined }
  return [total, feeTile, unfilled, g]
}

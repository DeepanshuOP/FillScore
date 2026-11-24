/**
 * The receipt's explanatory sentences (design v3 fixes A5): sentence case, past tense. Only printed labels (ORDER,
 * MARKET, FILLS, COSTS, TOTAL, SOURCE) are uppercase. Figures come from the replay API, formatted by formatSignedBps.
 */
import { formatSignedBps, formatUsd } from '../ui/format'

export interface ExpectedCost { expectedBps: number | null; lowBps: number | null; highBps: number | null; level: number; reason?: string | null }

export function expectedLine(ec: ExpectedCost): string {
  if (ec.expectedBps === null) return `Cost estimate: insufficient data (${ec.reason ?? 'no reason was stored'}).`
  const range = ec.lowBps !== null && ec.highBps !== null
    ? ` (${Math.round(ec.level * 100)}% range ${formatSignedBps(ec.lowBps)} to ${formatSignedBps(ec.highBps)})` : ''
  return `Orders like it were modelled to cost ${formatSignedBps(ec.expectedBps)}${range}.`
}

/**
 * The receipt's unfilled-line note (fixes F2): the figure on the "Unfilled orders" line is a modelled cost, not money that
 * left the account. null when the line has no figure or it is zero (nothing to explain).
 */
export function unfilledLineNote(usd: number | null | undefined): string | null {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd === 0) return null
  return `Unfilled orders, ${formatUsd(usd)}: the market moved away from the part that never filled. No money left the account for it.`
}

/** Deepanshu's decision 2026-11-23: a fee line says on the line that the rate is the published one (the unfilled line says modelled). */
export const FEE_LINE = 'Fees (published rate)'

/** The printed label of one cost line on the order receipt. */
export function costLineLabel(d: { key?: string; label: string }): string {
  if (d.key === 'fees' || (d.key === undefined && d.label === 'Fees')) return FEE_LINE
  if (d.key === 'unfilled') return 'Unfilled orders (modelled)'
  return d.label
}

export const NO_FILLS = 'No fills: the order did not trade.'
export const NO_COST_TERMS = 'Insufficient data: no cost terms were stored.'
// Design v5 words (PROPOSAL §1): "prints" and "tape" are trade slang; the reader sees "public trades".
export const CHART_NOTE = 'Fills only; the public trades are in the source file.'
// Demo orders (the public trades are drawn): what the marks are. Past tense, no advice, no cause.
export const PRINTS_LEGEND = 'The triangles are buyer-initiated public trades and the circles seller-initiated ones. The diamonds are this order\'s fills and the dashed line is when the order was placed. The full day of public trades is in the source file.'
export const BARS_NOTE = 'SHA-256 of the order record. The bars draw it; they are not a scannable code.'

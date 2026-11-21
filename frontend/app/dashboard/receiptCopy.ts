/**
 * The receipt's explanatory sentences (design v3 fixes A5): sentence case, past tense. Only printed labels (ORDER,
 * MARKET, FILLS, COSTS, TOTAL, SOURCE) are uppercase. Figures come from the replay API, formatted by formatSignedBps.
 */
import { formatSignedBps } from '../ui/format'

export interface ExpectedCost { expectedBps: number | null; lowBps: number | null; highBps: number | null; level: number; reason?: string | null }

export function expectedLine(ec: ExpectedCost): string {
  if (ec.expectedBps === null) return `Expected cost: insufficient data (${ec.reason ?? 'no reason was stored'}).`
  const range = ec.lowBps !== null && ec.highBps !== null
    ? ` (${Math.round(ec.level * 100)}% range ${formatSignedBps(ec.lowBps)} to ${formatSignedBps(ec.highBps)})` : ''
  return `Orders like it were modelled to cost ${formatSignedBps(ec.expectedBps)}${range}.`
}

export const NO_FILLS = 'No fills: the order did not trade.'
export const NO_COST_TERMS = 'Insufficient data: no cost terms were stored.'
export const CHART_NOTE = 'Fills only; the public prints are in the source file.'
export const BARS_NOTE = 'SHA-256 of the order record. The bars draw it; they are not a scannable code.'

/**
 * View model of the overview's cost strip (design v3.1, chapter 3 "Where it went"). Pure; tested in costStrip.test.ts.
 * Every figure and every share is the server's (`strip` on GET /audit/orders-summary, backend `costStrip`); this file
 * only names the parts and turns a share into a CSS width. A part with no positive dollars has no width and is listed
 * apart as a price improvement or a rebate, never drawn as a negative bar.
 */
import { formatUsd } from '../ui/format'

export interface StripPart { key: 'market' | 'fees'; label: string; amount: string; usd: number; width: string; dashed: boolean; drawn: boolean }
export interface StripView { parts: StripPart[]; sentence: string }

interface Seg { key?: unknown; usd?: unknown; share?: unknown }
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function describeStrip(body: unknown, feesNotMeasured: boolean): StripView | null {
  const s = (body as { available?: boolean; strip?: { totalUsd?: unknown; segments?: Seg[] } | null } | null)
  if (!s || s.available !== true || !s.strip || !num(s.strip.totalUsd) || !Array.isArray(s.strip.segments)) return null
  const parts: StripPart[] = []
  for (const g of s.strip.segments) {
    if ((g.key !== 'market' && g.key !== 'fees') || !num(g.usd) || !num(g.share)) return null
    const fees = g.key === 'fees'
    const dashed = fees && feesNotMeasured
    parts.push({
      key: g.key,
      label: fees ? (dashed ? 'Fees, at the published rate' : 'Fees') : 'Measured against market prices',
      amount: formatUsd(g.usd),
      usd: g.usd,
      width: `${(g.share * 100).toFixed(3)}%`,
      dashed,
      drawn: g.share > 0,
    })
  }
  const fees = parts.find((p) => p.key === 'fees')
  const market = parts.find((p) => p.key === 'market')
  const total = formatUsd(s.strip.totalUsd)
  // the fee figure names its basis when it was not measured (design v3.1 review); when the market part is a price
  // improvement larger than the other costs, fees exceed the total, so the sentence states all three as served
  const feesName = fees?.dashed ? 'Fees, at the published rate,' : 'Fees'
  const sentence = fees && market && market.usd < 0
    ? `${feesName} were ${fees.amount}; measured against market prices the cost was ${market.amount}, a price improvement; ${total} in total.`
    : fees && fees.usd > 0 ? `${feesName} were ${fees.amount} of the ${total}.` : `The orders paid ${total}.`
  return { parts, sentence }
}

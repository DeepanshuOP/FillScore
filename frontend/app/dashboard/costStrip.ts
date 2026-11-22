/**
 * View model of the overview's cost strip (design v3.1, chapter 3 "Where it went"; fixes F1). Pure; tested in
 * costStrip.test.ts. Every figure and every share is the server's (`strip` on GET /audit/orders-summary, backend
 * `costStrip`): fees + missed fills + filled-order execution add up to the total. This file only names the parts and
 * turns a share into a CSS width. A part with no positive dollars has no width; a price improvement is drawn below the
 * line at the server's `below` share, never as a negative bar.
 */
import { formatUsd } from '../ui/format'

export type StripKey = 'execution' | 'missed' | 'fees'
export interface StripPart {
  key: StripKey; label: string; caption: string | null; amount: string; usd: number
  width: string; /** the improvement's width below the line, or null */ below: string | null
  dashed: boolean; drawn: boolean
}
export interface StripView { parts: StripPart[]; sentence: string }

interface Seg { key?: unknown; usd?: unknown; share?: unknown; below?: unknown }
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pct = (v: number) => `${(v * 100).toFixed(3)}%`
const ORDER: StripKey[] = ['execution', 'missed', 'fees']

export function describeStrip(body: unknown, feesNotMeasured: boolean): StripView | null {
  const s = (body as { available?: boolean; strip?: { totalUsd?: unknown; segments?: Seg[] } | null } | null)
  if (!s || s.available !== true || !s.strip || !num(s.strip.totalUsd) || !Array.isArray(s.strip.segments)) return null
  const uc = (body as { unfilledCost?: { usd?: unknown; count?: unknown } | null }).unfilledCost
  const unfilled = { usd: num(uc?.usd) ? uc!.usd as number : null, count: num(uc?.count) ? uc!.count as number : 0 }
  const byKey = new Map<StripKey, StripPart>()
  for (const g of s.strip.segments) {
    if (!ORDER.includes(g.key as StripKey) || !num(g.usd) || !num(g.share) || !num(g.below)) return null
    const key = g.key as StripKey
    const dashed = key === 'fees' && feesNotMeasured
    // the key 'missed' is the server's name for the part; the printed word is "Unfilled orders" (adviceCopy.test bans "missed")
    const label = key === 'fees' ? 'Fees' : key === 'missed' ? 'Unfilled orders'
      : g.usd < 0 ? "Filled orders' execution, better than the market" : "Filled orders' execution"
    // unfilled orders that exist but were not measured are not in the total: say so, never print a zero for them
    const noMeasure = key === 'missed' && unfilled.count > 0 && unfilled.usd === null
    const caption = key === 'fees' ? (dashed ? 'at the published rate, not independently measured' : null)
      : key === 'missed' ? (noMeasure ? `insufficient data: none of the ${unfilled.count} unfilled orders was measured` : g.usd > 0 ? 'the market moved away from them' : null) : null
    byKey.set(key, {
      key, label, caption, amount: noMeasure ? 'insufficient data' : formatUsd(g.usd), usd: g.usd,
      width: pct(g.share), below: g.below > 0 ? pct(g.below) : null, dashed, drawn: g.share > 0,
    })
  }
  if (!ORDER.every((k) => byKey.has(k))) return null
  const parts = ORDER.map((k) => byKey.get(k)!)
  const [exec, missed, fees] = parts
  const total = formatUsd(s.strip.totalUsd)
  // the fee figure names its basis when it was not measured (design v3.1 review). An unfilled order did not take money
  // out of the account: the market moved away from it (F2), so the clause says that. A price improvement is stated as one.
  const feesName = fees.dashed ? 'Fees, at the published rate,' : 'Fees'
  const rest: string[] = []
  if (missed.usd > 0) rest.push(`the market moved ${missed.amount} away from orders that never filled`)
  if (exec.usd > 0) rest.push(`filled orders' execution cost ${exec.amount}`)
  else if (exec.usd < 0) rest.push(`filled orders came out ${formatUsd(-exec.usd)} better than the market`)
  const feesLead = fees.usd > 0
  // fees above the total (an improvement larger than the other costs): do not say "of the" total
  const lead = feesLead ? (fees.usd <= s.strip.totalUsd ? `${feesName} were ${fees.amount} of the ${total}` : `${feesName} were ${fees.amount}`) : null
  const tail = feesLead && fees.usd > s.strip.totalUsd ? `${total} in total` : null
  const clauses = [...(lead ? [lead] : []), ...rest, ...(tail ? [tail] : [])]
  const sentence = !feesLead && rest.length <= 1 ? `The orders cost ${total}.`
    : `${lead ?? `The orders cost ${total}`}${rest.length || tail ? `; ${clauses.slice(lead ? 1 : 0).join('; ')}` : ''}.`
  return { parts, sentence }
}

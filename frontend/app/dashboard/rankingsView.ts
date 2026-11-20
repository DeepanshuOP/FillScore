/**
 * View model of the rankings chart (dot and interval per group). Pure; every number comes from GET /api/audit/rankings
 * (backend rankWithNoise: rank = 1 + the number of ranked groups whose interval lies entirely below this one's, so the
 * cheapest interval is always rank 1 and overlapping intervals share a rank). This file only orders and labels.
 */
import type { RankingsApi } from './explainView'

export interface RankRow { key: string; n: number; median: number; low: number; high: number; rank: number; tie: string | null }
export interface RankPlotView {
  ranked: RankRow[]
  tooFew: Array<{ key: string; n: number; text: string }>
  domain: [number, number] | null
  empty: string | null
  level: number
  minOrders: number
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function describeRankPlot(body: RankingsApi): RankPlotView {
  const base = { level: body.level, minOrders: body.minOrders }
  if (!body.groups.length) return { ranked: [], tooFew: [], domain: null, empty: 'Insufficient data: no measured orders.', ...base }
  const ranked: RankRow[] = body.groups
    .filter((g) => g.status === 'ranked' && num(g.rank) && g.rank >= 1 && num(g.median) && num(g.low) && num(g.high))
    .map((g) => ({ key: g.key, n: g.n, median: g.median as number, low: g.low as number, high: g.high as number, rank: g.rank as number,
      tie: g.tiedWith.length ? `not distinguishable from ${g.tiedWith.join(', ')}` : null }))
    .sort((a, b) => a.rank - b.rank || a.median - b.median)
  const rankedKeys = new Set(ranked.map((r) => r.key))
  const tooFew = body.groups.filter((g) => !rankedKeys.has(g.key))
    .map((g) => ({ key: g.key, n: g.n, text: `too few to tell (${g.n} orders; ${body.minOrders} are needed)` }))
  const domain: [number, number] | null = ranked.length
    ? [Math.min(...ranked.map((r) => r.low)), Math.max(...ranked.map((r) => r.high))] : null
  return { ranked, tooFew, domain, empty: null, ...base }
}

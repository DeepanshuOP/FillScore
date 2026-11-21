/**
 * View model of the overview's month tape (design v3). Pure; tested in monthTape.test.ts. One tick per order on the
 * period's time axis. Design v3 fixes B1: the height is the order's total cost in dollars, which the server computes
 * per order (GET /audit/orders-ledger, `cost.usd`, the receipt's formula); a price improvement (negative cost) is drawn
 * below the baseline on the same scale. This file only places the server's figures; it computes no cost.
 */
import type { OrderRow } from './ordersTable'

/** v: the cost as a signed share of the span (largest cost + largest improvement); measured: the order has a cost. */
export interface MonthTick { key: string; t: number; v: number; measured: boolean; row: OrderRow }

export function monthTicks(rows: OrderRow[], start: string, end: string): MonthTick[] {
  const t0 = Date.parse(start), t1 = Date.parse(end)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return []
  const inside = rows
    .map((row) => ({ row, ms: Date.parse(row.when) }))
    .filter(({ ms }) => Number.isFinite(ms) && ms >= t0 && ms < t1)
    .sort((a, b) => a.ms - b.ms)
  const usd = (r: OrderRow) => (r.cost && Number.isFinite(r.cost.usd) ? r.cost.usd : null)
  const up = Math.max(0, ...inside.map(({ row }) => usd(row) ?? 0))
  const down = Math.max(0, ...inside.map(({ row }) => -(usd(row) ?? 0)))
  const span = up + down
  return inside.map(({ row, ms }) => {
    const u = usd(row)
    return { key: row.key, t: (ms - t0) / (t1 - t0), v: u !== null && span > 0 ? u / span : 0, measured: u !== null, row }
  })
}

/** Where the baseline sits, as a share of the drawable height from the top: the largest cost's share (1 when none). */
export function baselineShare(ticks: MonthTick[]): number {
  const up = Math.max(0, ...ticks.map((t) => t.v))
  const down = Math.max(0, ...ticks.map((t) => -t.v))
  return up + down > 0 ? up : 1
}

/** The start of each UTC day inside the period, as a share of the axis. */
export function dayMarks(start: string, end: string): Array<{ day: number; t: number }> {
  const t0 = Date.parse(start), t1 = Date.parse(end)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return []
  const out: Array<{ day: number; t: number }> = []
  const first = new Date(t0)
  let d = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())
  if (d < t0) d += 86_400_000
  for (; d < t1 && out.length < 400; d += 86_400_000) out.push({ day: new Date(d).getUTCDate(), t: (d - t0) / (t1 - t0) })
  return out
}

/** Index of the x closest to `x` within `reach` pixels, or null. */
export function nearestTick(xs: number[], x: number, reach: number): number | null {
  let best: number | null = null, d = reach
  xs.forEach((tx, i) => { const dd = Math.abs(tx - x); if (dd <= d) { d = dd; best = i } })
  return best
}

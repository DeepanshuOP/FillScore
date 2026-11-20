/**
 * View model of the overview's month tape (design v3): one tick per order on the period's time axis. Pure; tested in
 * monthTape.test.ts. The height is the order's value (the square root of its notional, as a share of the largest), the
 * only per-order size the overview has without fetching every replay; the tape says so. The order's cost is on its
 * receipt, one click away.
 */
import type { OrderRow } from './ordersTable'

export interface MonthTick { key: string; t: number; v: number; row: OrderRow }

export function monthTicks(rows: OrderRow[], start: string, end: string): MonthTick[] {
  const t0 = Date.parse(start), t1 = Date.parse(end)
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return []
  const inside = rows
    .map((row) => ({ row, ms: Date.parse(row.firstFill) }))
    .filter(({ ms }) => Number.isFinite(ms) && ms >= t0 && ms < t1)
    .sort((a, b) => a.ms - b.ms)
  const root = (n: number) => (Number.isFinite(n) && n > 0 ? Math.sqrt(n) : 0)
  const max = Math.max(0, ...inside.map(({ row }) => root(row.notionalUsd)))
  return inside.map(({ row, ms }) => ({ key: row.key, t: (ms - t0) / (t1 - t0), v: max > 0 ? root(row.notionalUsd) / max : 0, row }))
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

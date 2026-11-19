/** Pure geometry of the hero drawing. No React, no DOM, no animation: tested by hand values. */

export function linearScale(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  const k = (r1 - r0) / (d1 - d0)
  return (v) => r0 + (v - d0) * k
}

/** Price distance of `bps` basis points of the placement mid: bps x mid / 10,000. */
export function bracketPriceSpan(bps: number, mid: number): number {
  return (bps * mid) / 1e4
}

export interface RulerSegment { key: string; bps: number; x: number; width: number }

/** Terms laid end to end on one bps scale from x0; width = bps x (x1 - x0) / maxBps. A null or zero term is left out. */
export function rulerSegments(terms: Array<{ key: string; bps: number | null }>, x0: number, x1: number, maxBps: number): RulerSegment[] {
  const perBps = (x1 - x0) / maxBps
  const out: RulerSegment[] = []
  let x = x0
  for (const t of terms) {
    if (t.bps === null || t.bps === 0) continue
    const width = t.bps * perBps
    out.push({ key: t.key, bps: t.bps, x, width })
    x += width
  }
  return out
}

/** Step function through (t, v) points: it holds each value until the next point, then to `endT`. */
export function stepPath(points: Array<{ t: number; v: number }>, endT: number, x: (t: number) => number, y: (v: number) => number): string {
  if (points.length === 0) return ''
  const f = (n: number) => String(Math.round(n * 100) / 100)
  let d = `M${f(x(points[0].t))},${f(y(points[0].v))}`
  for (let i = 1; i < points.length; i++) d += ` H${f(x(points[i].t))} V${f(y(points[i].v))}`
  return `${d} H${f(x(endT))}`
}

/** Radius of a print's mark: grows with the logarithm of its size, bounded between 3 and 6.2. */
export function printRadius(qty: number): number {
  const q = Math.max(0, qty)
  return 3 + 3.2 * Math.min(1, Math.log10(1 + q) / Math.log10(11))
}

/** Seconds into the sweep at which real tape time `ts` is reached, when [start, end] ms of tape is played in `total` s. */
export function sweepSeconds(ts: number, start: number, end: number, total: number): number {
  return ((ts - start) / (end - start)) * total
}

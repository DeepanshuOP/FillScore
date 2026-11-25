/**
 * Round tick values for a chart axis (design v5 correction: ticks at $0, $1, $2, never at odd values). Pure layout arithmetic over
 * the served domain; the ticks are positions on an axis, not findings. The step is 1, 2 or 5 times a power of ten, chosen so the
 * axis carries about `target` ticks; the ticks are the multiples of the step that lie inside [lo, hi] widened to the step.
 */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return Number.isFinite(lo) ? [lo] : []
  const raw = (hi - lo) / Math.max(1, target)
  const pow = 10 ** Math.floor(Math.log10(raw))
  const m = raw / pow
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * pow
  const first = Math.ceil(lo / step - 1e-9) * step
  const out: number[] = []
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))   // review fix: no float noise such as 0.6000000000000001
  for (let k = Math.round(first / step); k * step <= hi + step * 1e-9; k++) out.push(+(k * step).toFixed(decimals) + 0)   // "+ 0" turns -0 into 0
  return out
}

/** Round steps of a clock axis, in ms: 1, 2, 5 times a power of ten up to 500 ms, then 1, 2, 5, 10, 15, 30 s and 1, 2, 5, 10, 30, 60 min. */
const TIME_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000, 3_600_000]

/** The step `niceTimeTicks` chooses for a range: the smallest round step at or above range / target. */
export function timeStep(lo: number, hi: number, target = 4): number {
  const raw = (hi - lo) / Math.max(1, target)
  return TIME_STEPS.find((s) => s >= raw) ?? TIME_STEPS[TIME_STEPS.length - 1]
}

/**
 * Tick positions (epoch ms) for a clock axis: the multiples of a round step inside [lo, hi], so a tick reads 14:00:00.200 or 14:00:15,
 * never 14:00:00.123. Layout arithmetic over the served range, like `niceTicks`.
 */
export function niceTimeTicks(lo: number, hi: number, target = 4): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return []
  if (hi <= lo) return [lo]
  const step = timeStep(lo, hi, target)
  const out: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) out.push(t)
  return out
}

/** A tick label in UTC: milliseconds only when the step is under a second. */
export function clockTick(t: number, step: number): string {
  const s = new Date(t).toISOString().slice(11, 23)
  return step < 1000 ? s : s.slice(0, 8)
}

/**
 * The decimals a price axis prints: the most decimals any stored price uses. Trade prices are multiples of the symbol's tick size, so
 * the decimals they use are the tick's (the tick size itself is not stored). No price: 2.
 */
export function priceDecimals(prices: readonly number[]): number {
  let max = -1
  for (const p of prices) {
    if (!Number.isFinite(p)) continue
    const s = p.toFixed(8).replace(/0+$/, '')
    max = Math.max(max, s.endsWith('.') ? 0 : s.length - s.indexOf('.') - 1)
  }
  return max < 0 ? 2 : max
}

/** The axis range that holds the served domain and the zero line, widened to the tick step so the end ticks are round. */
export function niceDomain(lo: number, hi: number, target = 4): [number, number] {
  const a = Math.min(lo, 0), b = Math.max(hi, 0)
  const t = niceTicks(a, b, target)
  if (t.length < 2) return [a, b === a ? a + 1 : b]
  const step = t[1] - t[0]
  return [Math.floor(a / step + 1e-9) * step + 0, Math.ceil(b / step - 1e-9) * step + 0]   // the epsilons keep an exact multiple on its own tick
}

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

/** The axis range that holds the served domain and the zero line, widened to the tick step so the end ticks are round. */
export function niceDomain(lo: number, hi: number, target = 4): [number, number] {
  const a = Math.min(lo, 0), b = Math.max(hi, 0)
  const t = niceTicks(a, b, target)
  if (t.length < 2) return [a, b === a ? a + 1 : b]
  const step = t[1] - t[0]
  return [Math.floor(a / step + 1e-9) * step + 0, Math.ceil(b / step - 1e-9) * step + 0]   // the epsilons keep an exact multiple on its own tick
}

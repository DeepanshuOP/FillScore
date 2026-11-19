/** Number formatting for the design-system components. Pure; never colours or judges a value. */
import { formatBps } from '../utils/formatBps'

/** USD: two decimals from one dollar, three below it (a small real cost is not rounded to zero). */
export function formatMoney(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'not computed'
  if (v === 0) return '$0.00'
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 1) return `${sign}$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (a < 0.0005) return v > 0 ? '<$0.001' : '>-$0.001'
  return `${sign}$${a.toFixed(3)}`
}

export function formatScore(v: number): string {
  return v.toFixed(1)
}

/** bps with a real minus sign (U+2212) for a negative value; the rules of formatBps otherwise. */
export function formatSignedBps(v: number | null | undefined): string {
  return formatBps(v).replace('-', '−')
}

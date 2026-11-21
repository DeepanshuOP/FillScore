/** Number formatting for every rebuilt screen. Pure; never colours or judges a value. */
import { formatBps } from '../utils/formatBps'

const TWO_DECIMALS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * USD, one rule everywhere: two decimals with thousands separators; a negative value takes a true minus sign (U+2212);
 * a value that is not zero but would read "$0.00" reads "<$0.01" ("−$0.00" if negative, with the exact value in the
 * title: `exactTitle`), so a real cost is never shown
 * as nothing; a value that is not a finite number reads "not computed", never zero.
 */
export function formatUsd(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'not computed'
  if (v === 0) return '$0.00'
  const shown = TWO_DECIMALS.format(Math.abs(v))
  if (shown === '0.00') return v > 0 ? '<$0.01' : '−$0.00'
  return `${v < 0 ? '−' : ''}$${shown}`
}

/** True for a non-zero value the display rounds away: "<$0.01"/"−$0.00", or "<0.01 bps"/"−0.00 bps". */
function belowPrecision(v: number, unit: 'usd' | 'bps'): boolean {
  if (v === 0) return false
  return unit === 'usd' ? TWO_DECIMALS.format(Math.abs(v)) === '0.00' : Math.abs(v) < 0.01
}

/**
 * The exact value of a figure the display shows below its precision (design v3 fixes A3), for its title and its
 * screen-reader text: "Exactly −0.004000 bps". null when the display already shows the figure.
 */
export function exactTitle(v: number | null | undefined, unit: 'usd' | 'bps'): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v) || !belowPrecision(v, unit)) return null
  const digits = Math.abs(v).toPrecision(4)
  const sign = v < 0 ? '−' : ''
  return unit === 'usd' ? `Exactly ${sign}$${digits}` : `Exactly ${sign}${digits} bps`
}

export function formatScore(v: number): string {
  return v.toFixed(1)
}

/** bps with a real minus sign (U+2212) for a negative value; the rules of formatBps otherwise. */
export function formatSignedBps(v: number | null | undefined): string {
  // display only (design v3 fixes A3): a tiny negative reads "−0.00 bps"; utils/formatBps (shared with the PDF) is unchanged
  if (typeof v === 'number' && Number.isFinite(v) && v < 0 && belowPrecision(v, 'bps')) return '−0.00 bps'
  return formatBps(v).replace('-', '−')
}

/** Number formatting for every rebuilt screen. Pure; never colours or judges a value. */
import { formatBps } from '../utils/formatBps'

const TWO_DECIMALS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * USD, one rule everywhere: two decimals with thousands separators; a negative value takes a true minus sign (U+2212);
 * a value that is not zero but would read "$0.00" reads "<$0.01" (">−$0.01" if negative), so a real cost is never shown
 * as nothing; a value that is not a finite number reads "not computed", never zero.
 */
export function formatUsd(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'not computed'
  if (v === 0) return '$0.00'
  const shown = TWO_DECIMALS.format(Math.abs(v))
  if (shown === '0.00') return v > 0 ? '<$0.01' : '>−$0.01'
  return `${v < 0 ? '−' : ''}$${shown}`
}

export function formatScore(v: number): string {
  return v.toFixed(1)
}

/** bps with a real minus sign (U+2212) for a negative value; the rules of formatBps otherwise. */
export function formatSignedBps(v: number | null | undefined): string {
  return formatBps(v).replace('-', '−')
}

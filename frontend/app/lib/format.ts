/**
 * Design v5 number styles (PROPOSAL §2): one style per kind. Formatting only: every value comes from the server or a fixture.
 * A value that rounds to zero never prints a sign ("-0.00" was AUDIT #7); a non-zero amount under a cent prints "<$0.01".
 */
const MINUS = '−'
const USD = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

export function money(v: number | null | undefined): string | null {
  if (!isNum(v)) return null
  if (v !== 0 && Math.abs(v) < 0.005) return '<$0.01'
  const s = `$${USD.format(Math.abs(v))}`
  return v < 0 && s !== '$0.00' ? `${MINUS}${s}` : s
}

export function bps(v: number | null | undefined): string | null {
  if (!isNum(v)) return null
  const s = Math.abs(v).toFixed(1)
  return `${v < 0 && s !== '0.0' ? MINUS : ''}${s} bps`
}

export function count(n: number, noun: string): string {
  return `${INT.format(n)} ${noun}${n === 1 ? '' : 's'}`
}

export function share(v: number): string {
  const p = v * 100
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`
}

export const qty = (v: number) => v.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function textTime(iso: string): string {
  const d = new Date(iso)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${iso.slice(11, 16)} UTC`
}
export const tableTime = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 19)}`

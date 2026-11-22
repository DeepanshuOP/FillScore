/**
 * One way to print basis points on screen. Never "-0.0"; a real value smaller than 0.01 in size is not rounded to
 * zero. The same rule is in backend/src/utils/formatBps.ts (PDF report); a test keeps the two equal.
 */
/** formatBps for a screen: the same text with a true minus sign (U+2212) for a negative. Display only; the PDF keeps the hyphen. */
export function formatBpsDisplay(v: number | null | undefined): string {
  return formatBps(v).replace('-', '−');
}

export function formatBps(v: number | null | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 'not computed';
  if (v === 0) return '0.0 bps';
  const a = Math.abs(v);
  if (a < 0.01) return v > 0 ? '<0.01 bps' : '>-0.01 bps';
  return `${v.toFixed(a >= 1 ? 1 : 2)} bps`;
}

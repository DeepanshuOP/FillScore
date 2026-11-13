/**
 * One way to print basis points, for the PDF report (the dashboard has the same rule in frontend/app/utils/formatBps.ts;
 * a test keeps the two equal). Never "-0.0"; a real value smaller than 0.01 in size is not rounded to zero.
 */
export function formatBps(v: number | null | undefined): string {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 'not computed';
    if (v === 0) return '0.0 bps';
    const a = Math.abs(v);
    if (a < 0.01) return v > 0 ? '<0.01 bps' : '>-0.01 bps';
    return `${v.toFixed(a >= 1 ? 1 : 2)} bps`;
}

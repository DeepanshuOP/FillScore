/**
 * One deterministic period label for the dashboard header and footer: UTC dates, inclusive end.
 * An end timestamp at exactly 00:00:00.000 UTC is treated as an exclusive boundary
 * ("up to Feb 1") and shown as the previous day.
 */
const fmt = (d: Date, withYear: boolean) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

/**
 * "January 2024" when the period is exactly one UTC calendar month (start on the 1st at 00:00, end on the next 1st);
 * otherwise the range label. For the grade stamp and the month tape (design v3).
 */
export function monthLabel(start: string, end: string): string {
  const s = new Date(start), e = new Date(end)
  const whole = !Number.isNaN(s.getTime()) && s.getUTCDate() === 1 && s.getUTCHours() === 0 && s.getUTCMinutes() === 0
    && e.getTime() === Date.UTC(s.getUTCFullYear(), s.getUTCMonth() + 1, 1)
  return whole ? s.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : formatPeriodLabel(start, end)
}

export function formatPeriodLabel(start: string | Date, end: string | Date): string {
  const s = new Date(start);
  let e = new Date(end);
  if (e.getTime() > s.getTime() && e.getUTCHours() === 0 && e.getUTCMinutes() === 0 && e.getUTCSeconds() === 0 && e.getUTCMilliseconds() === 0) {
    e = new Date(e.getTime() - 1);
  }
  return `${fmt(s, false)} – ${fmt(e, true)}`;
}

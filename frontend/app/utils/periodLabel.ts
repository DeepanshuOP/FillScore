/**
 * One deterministic period label for the dashboard header and footer: UTC dates, inclusive end.
 * An end timestamp at exactly 00:00:00.000 UTC is treated as an exclusive boundary
 * ("up to Feb 1") and shown as the previous day.
 */
const fmt = (d: Date, withYear: boolean) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

export function formatPeriodLabel(start: string | Date, end: string | Date): string {
  const s = new Date(start);
  let e = new Date(end);
  if (e.getTime() > s.getTime() && e.getUTCHours() === 0 && e.getUTCMinutes() === 0 && e.getUTCSeconds() === 0 && e.getUTCMilliseconds() === 0) {
    e = new Date(e.getTime() - 1);
  }
  return `${fmt(s, false)} – ${fmt(e, true)}`;
}

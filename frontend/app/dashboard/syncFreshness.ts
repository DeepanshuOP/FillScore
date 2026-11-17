/**
 * How fresh the account's data is (M6): the sentence beside the numbers. Pure. `lastSyncAt` and `stale` come from
 * GET /api/onboarding/sync/status (the newest successful sync of any connection; stale = older than 24 hours). The sentence states the
 * age and, for stale data, what that means for the numbers. It gives no instruction.
 */
export interface FreshnessInput { lastSyncAt?: string | null; stale?: boolean | null }
export interface Freshness { stale: boolean; text: string }

const NOT_RECORDED: Freshness = { stale: false, text: 'The time of the last sync was not recorded.' };
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function age(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'less than a minute ago';
  if (m < 60) return `${plural(m, 'minute')} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${plural(h, 'hour')} ago`;
  return `${plural(Math.floor(h / 24), 'day')} ago`;
}

export function describeFreshness(s: FreshnessInput, now: Date = new Date()): Freshness {
  if (!s.lastSyncAt) return NOT_RECORDED;
  const t = new Date(s.lastSyncAt).getTime();
  if (!Number.isFinite(t)) return NOT_RECORDED;
  const when = new Date(t).toISOString().slice(0, 16).replace('T', ' ');
  const base = `Data last synced ${age(Math.max(0, now.getTime() - t))} (${when} UTC).`;
  return s.stale === true ? { stale: true, text: `${base} Fills made since then are not in these numbers.` } : { stale: false, text: base };
}

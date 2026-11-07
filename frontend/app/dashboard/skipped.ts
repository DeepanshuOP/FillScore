/** Disclosure of trades the scorer refused. `undefined` = an audit stored before this field existed: unknown, so
 *  nothing is claimed (never read as 0). */
export interface SkippedTrades { count: number; reasons: Record<string, number> }

export function skippedNotice(s: SkippedTrades | undefined | null): string | null {
  if (!s || !(s.count > 0)) return null
  const reasons = Object.entries(s.reasons ?? {}).map(([k, n]) => `${k}: ${n}`).join(', ')
  return `${s.count} ${s.count === 1 ? 'trade' : 'trades'} couldn't be scored${reasons ? ` (${reasons})` : ''}`
}

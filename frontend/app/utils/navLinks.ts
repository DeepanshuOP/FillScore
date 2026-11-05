/**
 * Nav link target. A signed-in user's own data is resolved from the session, so their links
 * carry no userId. A demo id is only carried for the sample view (and, for a signed-in user,
 * with the explicit `sample=1` opt-in).
 */
export function navHref(path: string, userId: string | undefined, signedIn: boolean): string {
  if (path === '/') return '/';
  if (!userId) return path;
  return signedIn ? `${path}?userId=${userId}&sample=1` : `${path}?userId=${userId}`;
}

/** Venue-comparison note under the single-exchange summary. */
export function venueComparisonNote(signedIn: boolean, isSample: boolean): string {
  if (signedIn && !isSample) return 'Connect another exchange to compare venues.';
  return 'This sample account trades on one exchange; connecting a second exchange adds a venue comparison.';
}

/** Empty-state sentence for a connected account with no trades, naming the lookback used. */
export function lookbackLabel(days: number | null | undefined): string {
  if (days == null) return 'the selected period';
  if (days >= 3650) return 'all available history';
  return `the last ${days} days`;
}

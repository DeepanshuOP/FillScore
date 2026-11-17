import { describe, it, expect } from 'vitest';
import { describeFreshness } from './syncFreshness';
import { findAdviceTerms } from '../../../backend/src/constants/adviceTerms';

// now = 2026-11-18 12:00:00 UTC. The age is read from the API's lastSyncAt; "stale" is the API's own answer (older than 24 hours).
const NOW = new Date('2026-11-18T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000, H = 60 * MIN, D = 24 * H;

describe('describeFreshness', () => {
  it('says how long ago, with the date, and no warning when the data is fresh', () => {
    const f = describeFreshness({ lastSyncAt: ago(3 * H), stale: false }, NOW);
    expect(f).toEqual({ stale: false, text: 'Data last synced 3 hours ago (2026-11-18 09:00 UTC).' });
  });
  it('says what is not in the numbers when the data is stale', () => {
    const f = describeFreshness({ lastSyncAt: ago(3 * D + 2 * H), stale: true }, NOW);
    expect(f.stale).toBe(true);
    expect(f.text).toBe('Data last synced 3 days ago (2026-11-15 10:00 UTC). Fills made since then are not in these numbers.');
  });
  it('uses minutes below an hour, "less than a minute" below a minute, and the singular', () => {
    expect(describeFreshness({ lastSyncAt: ago(5 * MIN), stale: false }, NOW).text).toContain('5 minutes ago');
    expect(describeFreshness({ lastSyncAt: ago(1 * MIN), stale: false }, NOW).text).toContain('1 minute ago');
    expect(describeFreshness({ lastSyncAt: ago(20_000), stale: false }, NOW).text).toContain('less than a minute ago');
    expect(describeFreshness({ lastSyncAt: ago(1 * H), stale: false }, NOW).text).toContain('1 hour ago');
    expect(describeFreshness({ lastSyncAt: ago(1 * D), stale: true }, NOW).text).toContain('1 day ago');
  });
  it('says the time is not recorded when there is none, and does not call that stale', () => {
    expect(describeFreshness({ lastSyncAt: null, stale: null }, NOW)).toEqual({ stale: false, text: 'The time of the last sync was not recorded.' });
    expect(describeFreshness({}, NOW).stale).toBe(false);
  });
  it('a time in the future (clock difference) is shown as just now, never a negative age', () => {
    expect(describeFreshness({ lastSyncAt: new Date(NOW.getTime() + 5 * MIN).toISOString(), stale: false }, NOW).text).toContain('less than a minute ago');
  });
  it('an unreadable date is "not recorded"', () => {
    expect(describeFreshness({ lastSyncAt: 'garbage', stale: false }, NOW).text).toBe('The time of the last sync was not recorded.');
  });
  it('copy is past tense and advice-free', () => {
    for (const s of [{ lastSyncAt: ago(3 * H), stale: false }, { lastSyncAt: ago(3 * D), stale: true }, {}]) {
      expect(findAdviceTerms(describeFreshness(s, NOW).text)).toEqual([]);
    }
  });
});

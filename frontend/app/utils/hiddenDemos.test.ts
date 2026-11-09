import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HIDDEN_DEMO_IDS, isHiddenDemo, visibleDemoProfiles, multiVenueNotice, MULTI_VENUE_UNAVAILABLE } from './hiddenDemos';
import { DEMO_PROFILES } from './demoProfiles';

describe('HIDDEN_DEMO_IDS', () => {
  it('equals the backend list (read from resolveAccount.ts source)', () => {
    const src = readFileSync(resolve(__dirname, '../../../backend/src/middleware/resolveAccount.ts'), 'utf8');
    const m = src.match(/export const HIDDEN_DEMO_IDS = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    const backend = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
    expect(backend).toEqual(['demo-bybit', 'demo-okx', 'demo-multi']);
    expect([...HIDDEN_DEMO_IDS]).toEqual(backend);
  });

  it('isHiddenDemo matches only hidden ids', () => {
    expect(isHiddenDemo('demo-multi')).toBe(true);
    expect(isHiddenDemo('demo-disciplined')).toBe(false);
    expect(isHiddenDemo(null)).toBe(false);
  });

  it('multiVenueNotice returns the unavailable message for each hidden id, null otherwise', () => {
    for (const id of HIDDEN_DEMO_IDS) expect(multiVenueNotice(id)).toBe(MULTI_VENUE_UNAVAILABLE);
    expect(MULTI_VENUE_UNAVAILABLE).toBe('Multi-venue demo temporarily unavailable');
    expect(multiVenueNotice('demo-disciplined')).toBeNull();
    expect(multiVenueNotice(null)).toBeNull();
  });

  it('visibleDemoProfiles keeps only the three non-hidden demos', () => {
    expect(visibleDemoProfiles(DEMO_PROFILES).map((p) => p.id).sort()).toEqual([
      'demo-aggressive', 'demo-disciplined', 'demo-moderate',
    ]);
  });
});

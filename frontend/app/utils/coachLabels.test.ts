import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// The dashboard's static coach labels must describe, never advise.
const src = readFileSync(join(__dirname, '../dashboard/page.tsx'), 'utf8');

describe('dashboard coach labels', () => {
  it('uses the descriptive labels', () => {
    for (const label of ['EXECUTION PATTERNS', 'INSIGHTS', 'BEST-SCORING WINDOW', 'LOWEST-SCORING WINDOW']) {
      expect(src).toContain(label);
    }
  });
  it('has none of the old advice labels', () => {
    for (const old of ['ACTION PLAN', 'RECOMMENDATIONS', 'Your biggest opportunity', 'Trade around', 'historically scores', 'Route flow to']) {
      expect(src).not.toContain(old);
    }
  });
  it('has no unauthenticated-era copy', () => {
    expect(src).not.toMatch(/authenticated version/i);
  });
});

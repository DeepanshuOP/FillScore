import { describe, it, expect } from 'vitest';
import { showCsvExport } from './csvExport';

// F-15: the CSV export button was demo-only, so a signed-in user could never export their trades.
describe('showCsvExport', () => {
  it('shows the button to signed-in users', () => {
    expect(showCsvExport('real')).toBe(true);
  });
  it('still shows it in demo mode', () => {
    expect(showCsvExport('demo')).toBe(true);
  });
  it('hides it while the mode is unresolved or redirecting', () => {
    expect(showCsvExport(null)).toBe(false);
    expect(showCsvExport('redirect')).toBe(false);
  });
});

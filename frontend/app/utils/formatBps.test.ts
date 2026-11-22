import { describe, it, expect } from 'vitest';
import { formatBps, formatBpsDisplay } from './formatBps';
import { formatBps as formatBpsBackend } from '../../../backend/src/utils/formatBps';
import { formatBpsOrNotComputed, NOT_COMPUTED } from './notComputed';

// Size >= 1 -> one decimal; 0.01 .. 1 -> two decimals; a real value below 0.01 is "<0.01 bps" (">-0.01 bps" if negative);
// exact zero (also -0) is "0.0 bps". Never "-0.0". The backend copy (PDF report) must give the same text.
const CASES: Array<[number, string]> = [
  [2, '2.0 bps'], [10, '10.0 bps'], [-3.46, '-3.5 bps'], [0.0006, '<0.01 bps'], [-0.0006, '>-0.01 bps'],
  [0.04, '0.04 bps'], [-0.04, '-0.04 bps'], [0.5, '0.50 bps'], [0, '0.0 bps'], [-0, '0.0 bps'], [0.01, '0.01 bps'],
];
describe('formatBps', () => {
  it.each(CASES)('%s -> %s', (v, out) => expect(formatBps(v)).toBe(out));
  it('missing values read "not computed"', () => {
    expect(formatBps(null)).toBe('not computed');
    expect(formatBps(undefined)).toBe('not computed');
    expect(formatBps(NaN)).toBe('not computed');
  });
  it('the frontend and the backend (PDF) print the same text', () => {
    for (const v of [...CASES.map(c => c[0]), -1e-9, 123.456, -0.004999, null, undefined, NaN]) {
      expect(formatBps(v as number)).toBe(formatBpsBackend(v as number));
    }
  });
  it('formatBpsDisplay is formatBps with a true minus (U+2212), for screens only', () => {
    // hand: -0.054 -> toFixed(2) "-0.05"; -12.34 -> toFixed(1) "-12.3"; -0.004 -> ">-0.01 bps"
    expect(formatBpsDisplay(-0.054)).toBe('−0.05 bps');
    expect(formatBpsDisplay(-12.34)).toBe('−12.3 bps');
    expect(formatBpsDisplay(-0.004)).toBe('>−0.01 bps');
    expect(formatBpsDisplay(4.26)).toBe('4.3 bps');
    expect(formatBps(-12.34)).toBe('-12.3 bps');   // the shared (PDF-equal) text is unchanged
    expect(formatBpsDisplay(null)).toBe('not computed');
  });
  it('the number-only helper never prints a negative zero', () => {
    expect(formatBpsOrNotComputed(-0.0004)).toBe('>−0.01');   // true minus (U+2212) on screen since 2026-11-22; the PDF's formatBps keeps '-'
    expect(formatBpsOrNotComputed(-0)).toBe('0.0');
    expect(formatBpsOrNotComputed(4.26)).toBe('4.3');
    expect(formatBpsOrNotComputed(null)).toBe(NOT_COMPUTED);
  });
});

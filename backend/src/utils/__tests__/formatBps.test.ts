import { describe, it, expect } from 'vitest';
import { formatBps } from '../formatBps';

// Rules: no "-0.0"; a real value below 0.01 in size is shown as "<0.01 bps" (">-0.01 bps" for a negative one), never
// rounded to zero. Size >= 1 -> one decimal; 0.01 .. 1 -> two decimals; exact zero (also -0) -> "0.0 bps".
describe('formatBps', () => {
    it.each([
        [2, '2.0 bps'], [10, '10.0 bps'], [-3.46, '-3.5 bps'], [0.0006, '<0.01 bps'], [-0.0006, '>-0.01 bps'],
        [0.04, '0.04 bps'], [-0.04, '-0.04 bps'], [0.5, '0.50 bps'], [0, '0.0 bps'], [-0, '0.0 bps'], [0.01, '0.01 bps'],
    ])('%s -> %s', (v, out) => expect(formatBps(v)).toBe(out));
    it('missing values are not zero', () => {
        expect(formatBps(null)).toBe('not computed');
        expect(formatBps(undefined)).toBe('not computed');
        expect(formatBps(NaN)).toBe('not computed');
    });
    it('never prints a negative zero', () => {
        for (const v of [-0, -1e-9, -0.004999, -0.0099, -0.99999]) expect(formatBps(v)).not.toMatch(/(^|\s|>|<)-0(\.0+)? bps/);
    });
});

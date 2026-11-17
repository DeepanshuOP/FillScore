import { describe, it, expect } from 'vitest';
import { bestHourLabel, worstHourLabel, weakHourLabel } from './heatmapCopy';
import { findAdviceTerms } from '../../../backend/src/constants/adviceTerms';

// Claims audit (M9): the heatmap lines described the account's own past fills, but "Best execution window" read as guidance for when to trade,
// and "You frequently perform poorly" described a habit the code does not test. The lines now say what the code selected, over which fills:
// best and worst consider hours with at least 2 fills; the weak hour has an average score below 50 over at least 3 fills.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

describe('heatmap labels', () => {
  it('state the hour of the account\'s own past fills with the highest and the lowest score, and the rule that picked it', () => {
    expect(bestHourLabel(DAYS, { day: 0, hour: 14 })).toBe('Highest-scoring hour of your past fills (hours with at least 2 fills): Mon 14:00 UTC');
    expect(worstHourLabel(DAYS, { day: 4, hour: 3 })).toBe('Lowest-scoring hour of your past fills (hours with at least 2 fills): Fri 03:00 UTC');
  });
  it('state the weak hour as an average over past fills, exactly as the code selects it', () => {
    expect(weakHourLabel(DAYS, { day: 6, hour: 23 })).toBe('Your past fills during Sun 23:00 UTC averaged a score below 50 (at least 3 fills)');
  });
  it('contain no advice term and no wording that reads as guidance or as a habit', () => {
    const all = [bestHourLabel(DAYS, { day: 0, hour: 1 }), worstHourLabel(DAYS, { day: 1, hour: 2 }), weakHourLabel(DAYS, { day: 2, hour: 3 })].join(' ');
    expect(findAdviceTerms(all)).toEqual([]);
    expect(all).not.toMatch(/\b(best|worst) execution window\b|frequently perform|you should|avoid|try/i);
  });
});

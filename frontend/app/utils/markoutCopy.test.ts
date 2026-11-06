import { describe, it, expect } from 'vitest';
import { findAdviceTerms } from '../../../backend/src/constants/adviceTerms';
import { MARKOUT_EMPTY_COPY, markoutSentence, markoutSentences, hasMarkouts, MarkoutHorizon } from './markoutCopy';

const rows: MarkoutHorizon[] = [
  { horizonS: 60, n: 5, meanBps: 1, maker: { n: 3, meanBps: 2.34 }, taker: { n: 2, meanBps: -4.0 } },
];

describe('markout card copy', () => {
  it('states past findings with the sign convention', () => {
    expect(markoutSentence('maker', 60, 2.34, 3)).toBe('Prices moved in your favour by 2.3 bps 60 s after your maker fills (3 fills).');
    expect(markoutSentence('taker', 60, -4, 2)).toBe('Prices moved against you by 4.0 bps 60 s after your taker fills (2 fills).');
    expect(markoutSentence('maker', 60, 0.01, 2)).toBe('Prices did not move 60 s after your maker fills (2 fills).');
    expect(markoutSentence('maker', 60, null, 0)).toBeNull();
  });
  it('no advice, counterfactual or causal vocabulary', () => {
    const text = [MARKOUT_EMPTY_COPY, ...markoutSentences(rows), 'Post-trade markouts'].join(' ');
    expect(findAdviceTerms(text)).toEqual([]);
    expect(text).not.toMatch(/\b(due to|because|caused|driven by|led to)\b/i);
  });
  it('hasMarkouts is false for empty data', () => {
    expect(hasMarkouts([{ horizonS: 1, n: 0, meanBps: null, maker: { n: 0, meanBps: null }, taker: { n: 0, meanBps: null } }])).toBe(false);
    expect(hasMarkouts(rows)).toBe(true);
  });
});

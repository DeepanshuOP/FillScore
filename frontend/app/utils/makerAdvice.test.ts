import { describe, it, expect } from 'vitest';
import { makerRatioNote, MAKER_TARGET_PCT } from './makerAdvice';

describe('makerRatioNote', () => {
  it('reports a high maker ratio instead of asking the user to raise it', () => {
    const note = makerRatioNote(100);
    expect(note).toContain('100%');
    expect(note).not.toMatch(/increase/i);
  });

  it('treats exactly the target as already met', () => {
    expect(makerRatioNote(MAKER_TARGET_PCT)).not.toMatch(/increase|shift/i);
  });

  it('suggests more limit orders only when the ratio is below target, and quotes the measured value', () => {
    const note = makerRatioNote(25.4);
    expect(note).toContain('25%');
    expect(note).toMatch(/limit orders/i);
    expect(note).toContain(`${MAKER_TARGET_PCT}%`);
  });

  it('does not offer a figure it cannot back with a number', () => {
    expect(makerRatioNote(NaN)).toBe('Maker ratio is not available for this account yet.');
  });
});

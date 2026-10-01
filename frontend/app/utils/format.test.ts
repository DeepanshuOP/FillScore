import { describe, it, expect } from 'vitest';
import { formatUsd } from './format';

describe('formatUsd', () => {
  it('uses exactly two decimals', () => {
    expect(formatUsd(187.4277)).toBe('$187.43');
    expect(formatUsd(5)).toBe('$5.00');
  });

  it('groups thousands', () => {
    expect(formatUsd(1234567.891)).toBe('$1,234,567.89');
  });

  it('rounds half away from the artefacts of binary floats', () => {
    expect(formatUsd(0.005)).toBe('$0.01');
  });

  it('shows a dash for missing values', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(undefined)).toBe('—');
    expect(formatUsd(NaN)).toBe('—');
  });
});

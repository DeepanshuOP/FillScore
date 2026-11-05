import { describe, it, expect } from 'vitest';
import { formatPeriodLabel } from './periodLabel';

describe('formatPeriodLabel', () => {
  it('exclusive midnight end (Feb 1 00:00Z) is shown as Jan 31 (inclusive)', () => {
    expect(formatPeriodLabel('2024-01-01T00:00:00.000Z', '2024-02-01T00:00:00.000Z')).toBe('Jan 1 – Jan 31, 2024');
  });
  it('an end during the day keeps that day', () => {
    expect(formatPeriodLabel('2024-01-01T08:00:00Z', '2024-01-31T22:15:00Z')).toBe('Jan 1 – Jan 31, 2024');
  });
  it('is independent of the process timezone', () => {
    const prev = process.env.TZ;
    process.env.TZ = 'Pacific/Auckland';
    try { expect(formatPeriodLabel('2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z')).toBe('Jan 1 – Jan 31, 2024'); }
    finally { process.env.TZ = prev; }
  });
  it('same label is used for header and footer (single function)', () => {
    const a = formatPeriodLabel('2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z');
    expect(a).toBe(formatPeriodLabel('2024-01-01T00:00:00Z', '2024-02-01T00:00:00Z'));
  });
});

import { describe, it, expect } from 'vitest';
import { describeV2, describeVerify, isScored, V2Response } from './scoreV2';

const scored = (status: number, body: unknown) => {
  const v = describeV2(status, body);
  if (!isScored(v)) throw new Error(`expected a scored view, got ${v.kind}`);
  return v;
};

const base = (over: Partial<V2Response['result']> = {}): V2Response => ({
  label: 'v2 (measured)', scoringVersion: 'v2.0.0', versionFileSha256: 'f'.repeat(64), measureVersion: '1.0.0',
  integrityHash: 'abcdef0123456789'.repeat(4), computedAt: '2026-11-01T00:00:00.000Z',
  result: {
    components: {
      slippage: { score: 57.5, measured: 25, unmeasured: 0, reason: null },
      fees: { score: 66.666, measured: 25, unmeasured: 0, reason: null },
      timing: { score: 39.13, measured: 25, unmeasured: 0, reason: null },
      spread: { score: null, measured: 0, unmeasured: 25, reason: 'insufficient data' },
    },
    composite: 57.83, grade: 'D', band: [55.1, 60.4], reason: null, orders: 25, fills: 25, ...over,
  },
});

describe('describeV2', () => {
  it('shows the letter, the score and the bootstrap range when the sample is large enough', () => {
    const v = scored(200, base());
    expect(v.kind).toBe('graded');
    expect(v.headline).toBe('D · 58 / 100');
    expect(v.range).toBe('95% range 55–60');
    expect(v.label).toBe('v2 · measured');
  });

  it('never shows a letter below the minimum sample: the range and the reason instead', () => {
    const v = scored(200, base({ grade: null, reason: 'fewer than 20 measured fills', fills: 12 }));
    expect(v.kind).toBe('band');
    expect(v.headline).toBe('No letter grade');
    expect(v.detail).toBe('Fewer than 20 measured fills (12 so far).');
    expect(v.range).toBe('95% range 55–60');
  });

  it('a missing component reads "insufficient data", never a number', () => {
    const v = scored(200, base({ composite: null, grade: null, band: null, reason: 'insufficient data' }));
    expect(v.kind).toBe('band');
    expect(v.range).toBeNull();
    const spread = v.components.find(c => c.key === 'spread')!;
    expect(spread.value).toBe('insufficient data');
    expect(v.components.find(c => c.key === 'fees')!.value).toBe('67');
    expect(v.components.map(c => c.name)).toEqual(['Slippage', 'Fees', 'Timing', 'Spread']);
  });

  it('a rebuilt demo states its provenance, and its fee component is marked not independently measured', () => {
    const v = scored(200, { ...base(), computedAt: null, demo: { dataSource: 'synthetic-demo', basis: 'offline build' } });
    expect(v.note).toBe('Demo trader: the trading behaviour is synthetic; every fill price comes from real public '
      + 'prints of January 2024. Its fees were generated at the published rate, so the fee component is not independently measured.');
    expect(v.components.find(c => c.key === 'fees')!.value).toBe('67 (not independently measured)');
    expect(v.components.find(c => c.key === 'slippage')!.value).toBe('58');
    expect(scored(200, base()).note).toBeNull();                         // a real account carries no demo note
  });

  it('demo and not-yet-computed states', () => {
    expect(describeV2(404, { error: 'v2_not_available_for_demo' }).kind).toBe('demo');
    expect(describeV2(404, { error: 'no_v2_score' }).kind).toBe('pending');
    expect(describeV2(500, null).kind).toBe('error');
  });

  it('shows the version and a shortened hash for verification', () => {
    const v = scored(200, base());
    expect(v.version).toBe('v2.0.0');
    expect(v.hashShort).toBe('abcdef01…6789');
  });
});

describe('describeVerify', () => {
  it('states the outcome in past tense', () => {
    expect(describeVerify(200, { match: true })).toBe('Integrity check passed: the hash was recomputed from the stored inputs and matched.');
    expect(describeVerify(200, { match: false })).toBe('Integrity check failed: the recomputed hash did not match the stored one.');
    expect(describeVerify(404, null)).toBe('No measured score is stored yet, so there was nothing to verify.');
    expect(describeVerify(503, null)).toBe('The verification service was unavailable. Nothing was checked.');
  });
});

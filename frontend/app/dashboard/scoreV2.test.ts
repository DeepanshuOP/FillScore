import { describe, it, expect } from 'vitest';
import { describeV2, describeVerify, isScored, verifyBadge, V2Response } from './scoreV2';

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

// v2.3.0 (ADR-0014): three components named after the shortfall terms; timing is information, not a component.
const shortfallBody = (over: Partial<V2Response['result']> = {}): V2Response => ({
  ...base(), scoringVersion: 'v2.3.0',
  result: {
    components: {
      execution: { score: 83.68, measured: 607, unmeasured: 0, reason: null },
      fees: { score: 100, measured: 607, unmeasured: 0, reason: null },
      unfilled: { score: 96.54, measured: 245, unmeasured: 0, reason: null },
    },
    timing: { scored: false, fills: 607, fillsAboveFloor: 0, meanExcessBps: 0.003, message: 'No material difference between hours.' },
    composite: 93.41, grade: 'A', band: [92.5, 94.1], reason: null, orders: 245, fills: 607, ...over,
  },
});

describe('describeV2 under v2.3.0', () => {
  it('names the components after the shortfall terms (no "slippage" beside "execution")', () => {
    const v = scored(200, shortfallBody());
    expect(v.components.map(c => c.name)).toEqual(['Execution cost', 'Fees', 'Unfilled orders']);
    expect(v.components.map(c => c.value)).toEqual(['84', '100', '97']);
    expect(v.headline).toBe('A · 93 / 100');
  });
  it('reports timing as information only, in the audit\'s own words', () => {
    expect(scored(200, shortfallBody()).timingNote).toBe('Timing, not scored: No material difference between hours.');
  });
  it('older versions keep their four components and have no timing note', () => {
    const v = scored(200, base());
    expect(v.components.map(c => c.name)).toEqual(['Slippage', 'Fees', 'Timing', 'Spread']);
    expect(v.timingNote).toBeNull();
  });
  it('a rebuilt demo marks its fee component as not independently measured, in the new names too', () => {
    const v = scored(200, { ...shortfallBody(), computedAt: null, demo: { dataSource: 'synthetic-demo', basis: 'offline build' } });
    expect(v.components.find(c => c.key === 'fees')!.value).toBe('100 (not independently measured)');
  });
});

// M3 §2: the letter compresses near the top on liquid pairs, so the line beside it is what the market orders cost against
// what taker events of the same size cost in the same hour. Past tense, with its interval, or "insufficient data".
describe('cost vs expected beside the letter', () => {
  const cve = { insufficient: false, n: 88, level: 0.9, paidBps: 0.43, expectedBps: 0.31, excessBps: 0.12, lowBps: -0.05, highBps: 0.29,
    version: 'ec1.0.0', calibrationSha256: 'a'.repeat(64), excluded: { outsideModel: 157, noExpectedCost: 0 } };
  it('states paid, expected, the difference and its interval, in past tense', () => {
    const v = scored(200, { ...shortfallBody(), costVsExpected: cve });
    expect(v.costVsExpected).toBe('Market orders cost 0.43 bps against 0.31 bps, the modelled cost of a taker event of the same size in the hour before the order '
      + "(fitted on January 2024) (difference +0.12 bps; 90% interval -0.05 bps to +0.29 bps, a bootstrap over orders that leaves out the model's own error; 88 orders).");
  });
  it('a positive lower bound carries its plus sign too', () => {
    const v = scored(200, { ...shortfallBody(), costVsExpected: { ...cve, excessBps: 0.2, lowBps: 0.05, highBps: 0.35 } });
    expect(v.costVsExpected).toContain('90% interval +0.05 bps to +0.35 bps');
  });
  it('a negative difference carries its own sign, and there is no plus sign on it', () => {
    const v = scored(200, { ...shortfallBody(), costVsExpected: { ...cve, paidBps: 0.2, excessBps: -0.11, lowBps: -0.3, highBps: 0.07 } });
    expect(v.costVsExpected).toContain('difference -0.11 bps; 90% interval -0.30 bps to +0.07 bps');
  });
  it('says "insufficient data" with the reason when the audit could not state it', () => {
    const v = scored(200, { ...shortfallBody(), costVsExpected: { insufficient: true, n: 3, reason: 'fewer than 20 market orders have an expected cost (found 3)', excluded: {} } });
    expect(v.costVsExpected).toBe('Cost vs expected: insufficient data (fewer than 20 market orders have an expected cost (found 3)).');
  });
  it('says "insufficient data" when the response carries no such block (an account without market context)', () => {
    expect(scored(200, shortfallBody()).costVsExpected)
      .toBe('Cost vs expected: insufficient data (no market context was stored for these orders).');
  });
  it('adds no line for the older score versions, and never changes the grade', () => {
    expect(scored(200, base()).costVsExpected).toBeNull();
    expect(scored(200, { ...shortfallBody(), costVsExpected: cve }).headline).toBe('A · 93 / 100');
  });
  it('does not state the interval when the audit gave none', () => {
    const v = scored(200, { ...shortfallBody(), costVsExpected: { ...cve, lowBps: null, highBps: null } });
    expect(v.costVsExpected).toContain('(difference +0.12 bps; no interval; 88 orders).');
  });
});

// M4 §5: "Verified" is shown only after the verify route answered match: true in this session. Nothing else earns the word.
describe('verifyBadge', () => {
  it('is "Not checked" until a check ran, and for any answer that is not a match', () => {
    expect(verifyBadge(null, null, true)).toEqual({ label: 'Not checked', tone: 'neutral' });
    expect(verifyBadge(404, null, true)).toEqual({ label: 'Not checked', tone: 'neutral' });
    expect(verifyBadge(503, null, true)).toEqual({ label: 'Not checked', tone: 'neutral' });
  });
  it('is "Verified" only for a 200 with match true, and "Verification failed" for a 200 without', () => {
    expect(verifyBadge(200, { match: true }, true)).toEqual({ label: 'Verified', tone: 'good' });
    expect(verifyBadge(200, { match: false }, true)).toEqual({ label: 'Verification failed', tone: 'bad' });
    expect(verifyBadge(200, {}, true)).toEqual({ label: 'Verification failed', tone: 'bad' });
  });
  it('a demo grade has no verify route: it says where its hash comes from, never "Verified"', () => {
    expect(verifyBadge(200, { match: true }, false)).toEqual({ label: 'Offline build, hash recorded', tone: 'neutral' });
    expect(verifyBadge(null, null, false)).toEqual({ label: 'Offline build, hash recorded', tone: 'neutral' });
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

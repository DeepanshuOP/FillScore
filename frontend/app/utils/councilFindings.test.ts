import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatEffectUsd,
  formatEffectBps,
  groundingLine,
  verificationLine,
  splitFindings,
} from './councilFindings';

describe('formatEffectUsd', () => {
  it('formats with 2dp and thousands commas', () => {
    expect(formatEffectUsd(1330)).toBe('$1,330.00');
    expect(formatEffectUsd(3.1)).toBe('$3.10');
    expect(formatEffectUsd(0.571429)).toBe('$0.57');
    expect(formatEffectUsd(1234567.891)).toBe('$1,234,567.89');
    expect(formatEffectUsd(-2.95)).toBe('-$2.95');
  });
});

describe('formatEffectBps', () => {
  it('formats with 1dp', () => {
    expect(formatEffectBps(12.090909)).toBe('12.1 bps');
    expect(formatEffectBps(2.952381)).toBe('3.0 bps');
  });
});

describe('groundingLine', () => {
  const r = { agent: 'a', field: 'f', sentence_index: 0, n_tokens: 1, kinds: ['x'] };
  const base = { regenerations: 0, faithfulness_first_pass: null, faithfulness_after: null, per_agent: {} };
  it('plural, zero flagged, nothing removed', () => {
    expect(groundingLine({ ...base, numbers_checked: 3, violations_first_pass: 0, redactions: [] }))
      .toBe('3 numbers checked, 0 flagged');
  });
  it('singular with a removal', () => {
    expect(groundingLine({ ...base, numbers_checked: 1, violations_first_pass: 1, redactions: [r] }))
      .toBe('1 number checked, 1 flagged, 1 removed');
  });
  it('null/undefined give empty string', () => {
    expect(groundingLine(null)).toBe('');
    expect(groundingLine(undefined)).toBe('');
  });
});

describe('verificationLine', () => {
  const x = { action: 'a', params: {}, reason: 'r' };
  it('counts re-reasoned and dropped, excluding observations from the denominator', () => {
    // 3 proposed + 1 re-reasoned - 1 observation = 3
    expect(verificationLine({ proposed: 3, passed: 1, observations: 1, rejected: [], re_reasoned: 1, dropped: [x] }))
      .toBe('1 of 3 proposed findings verified by replaying your trades; 1 dropped');
  });
  it('omits dropped when none', () => {
    expect(verificationLine({ proposed: 3, passed: 3, observations: 0, rejected: [], re_reasoned: 0, dropped: [] }))
      .toBe('3 of 3 proposed findings verified by replaying your trades');
  });
  it('shows nothing when no replayable finding was proposed', () => {
    expect(verificationLine({ proposed: 2, passed: 0, observations: 2, rejected: [], re_reasoned: 0, dropped: [] }))
      .toBe('');
  });
  it('null gives empty string', () => {
    expect(verificationLine(undefined)).toBe('');
  });
});

describe('splitFindings', () => {
  const f = (o: object) => ({
    action_type: 'exclude_hours', params: {}, text: 't', effect_usd: 1, effect_bps: 1,
    n_trades_affected: 1, method: 'm', verified: true, ...o,
  });
  it('defaults to empty arrays', () => {
    expect(splitFindings(undefined)).toEqual({ findings: [], observations: [] });
    expect(splitFindings({})).toEqual({ findings: [], observations: [] });
  });
  it('drops unverified and non-finite findings', () => {
    const keep = f({});
    const out = splitFindings({
      findings: [keep, f({ verified: false }), f({ effect_usd: NaN }), f({ effect_usd: null })] as any,
      observations: [{ action_type: 'none', text: 'o' }],
    });
    expect(out.findings).toEqual([keep]);
    expect(out.observations).toEqual([{ action_type: 'none', text: 'o' }]);
  });
});

describe('copy', () => {
  const banned = /could save|should|route flow|consider/i;
  it('has no advice wording in councilFindings.ts or AgentCouncil.tsx', () => {
    for (const p of ['./councilFindings.ts', '../components/AgentCouncil.tsx']) {
      const src = readFileSync(join(__dirname, p), 'utf8');
      expect(src, p).not.toMatch(banned);
    }
  });
});

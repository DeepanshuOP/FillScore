import { describe, it, expect } from 'vitest';
import { NOT_COMPUTED, tradeSlippageBps, formatBpsOrNotComputed, isNotComputed } from './notComputed';

// Decision 11 (2026-11-13): a v1 value that was never computed reads "not computed for this data": never 0, never
// a blank that looks like zero. A stored 0 is a real measurement and stays 0.
// Design v5 step 6: the `formatMs` and `describeOrders` cases lived here for the removed orders panel (`ordersView.ts`). Their facts
// ("a block that was not measured says so, never zero"; "a null median shows the not-computed label") are asserted on the live code
// in `tiles.test.ts` (a missing figure reads "not computed" or "insufficient data", never a zero) and `costsView.test.ts` (`typeRows`).
describe('tradeSlippageBps', () => {
  it('prefers slippageBps, then arrival, then vwap slippage', () => {
    expect(tradeSlippageBps({ slippageBps: 1.5, arrivalSlippageBps: 2 })).toBe(1.5);
    expect(tradeSlippageBps({ arrivalSlippageBps: 2, vwapSlippageBps: 3 })).toBe(2);
    expect(tradeSlippageBps({ vwapSlippageBps: 3 })).toBe(3);
  });
  it('keeps a stored 0 (a measurement) and returns null for a missing value (not 0)', () => {
    expect(tradeSlippageBps({ slippageBps: 0 })).toBe(0);
    expect(tradeSlippageBps({ slippageBps: null, arrivalSlippageBps: undefined })).toBeNull();
    expect(tradeSlippageBps({})).toBeNull();
  });
});

describe('formatBpsOrNotComputed', () => {
  it('one decimal for a number, the not-computed label otherwise', () => {
    expect(formatBpsOrNotComputed(4.26)).toBe('4.3');
    expect(formatBpsOrNotComputed(0)).toBe('0.0');
    expect(formatBpsOrNotComputed(null)).toBe(NOT_COMPUTED);
    expect(formatBpsOrNotComputed(undefined)).toBe(NOT_COMPUTED);
    expect(formatBpsOrNotComputed(Number.NaN)).toBe(NOT_COMPUTED);
  });
  it('the label is the wording of the decision', () => {
    expect(NOT_COMPUTED).toBe('not computed for this data');
  });
});

describe('isNotComputed', () => {
  it('reads the flag the API sets', () => {
    expect(isNotComputed({ notComputed: true })).toBe(true);
    expect(isNotComputed({ reason: 'not_computed_for_this_data', available: false })).toBe(true);
    expect(isNotComputed({ trades: [] })).toBe(false);
    expect(isNotComputed(null)).toBe(false);
  });
});

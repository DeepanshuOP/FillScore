import { describe, it, expect } from 'vitest';
import { NOT_COMPUTED, tradeSlippageBps, formatBpsOrNotComputed, isNotComputed } from './notComputed';
import { describeOrders, formatMs } from '../dashboard/ordersView';

// Decision 11 (2026-11-13): a v1 value that was never computed reads "not computed for this data": never 0, never
// a blank that looks like zero. A stored 0 is a real measurement and stays 0.
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

describe('formatMs', () => {
  it('milliseconds under a second, seconds under a minute, then minutes', () => {
    expect(formatMs(575)).toBe('575 ms');
    expect(formatMs(3000)).toBe('3.0 s');
    expect(formatMs(4600)).toBe('4.6 s');
    expect(formatMs(901500)).toBe('15.0 min');
    expect(formatMs(null)).toBe('—');
  });
});

describe('describeOrders', () => {
  const body = {
    available: true,
    orders: { total: 5, filled: 3, partial: 1, unfilled: 1, open: 0 },
    restingMs: { n: 3, medianMs: 3000, p90Ms: 4600 },
    shortfall: { n: 3, unmeasured: 1, medianBps: { execution: 2, spread: 1, impactTiming: 2, opportunity: 0, total: 4.5 } },
    unfilled: { n: 1, medianOpportunityBps: 7 },
  };
  it('turns the API body into labelled rows, numbers copied as given', () => {
    const v = describeOrders(body)!;
    expect(v.outcomes).toEqual([['Orders', '5'], ['Filled', '3'], ['Partly filled', '1'], ['Unfilled', '1'], ['Still open', '0']]);
    expect(v.resting).toEqual({ median: '3.0 s', p90: '4.6 s', n: '3 limit orders with a fill' });
    expect(v.shortfall).toEqual([
      ['Execution cost', '2.0 bps'], ['Spread paid', '1.0 bps'], ['Impact and timing', '2.0 bps'],
      ['Unfilled part', '0.0 bps'], ['Total', '4.5 bps'],
    ]);
    expect(v.shortfallNote).toBe('Median of 3 measured orders; 1 order was not measured.');
    expect(v.unfilledNote).toBe('1 unfilled order; its median cost of not filling: 7.0 bps.');
  });
  it('a block that was not measured says so, never zero', () => {
    const v = describeOrders({ available: true, orders: { total: 2, filled: 2, partial: 0, unfilled: 0, open: 0 }, restingMs: null, shortfall: null, unfilled: null })!;
    expect(v.resting).toBeNull();
    expect(v.shortfall).toBeNull();
    expect(v.unfilledNote).toBeNull();
  });
  it('a median that is null shows the not-computed label', () => {
    const v = describeOrders({ ...body, shortfall: { n: 1, unmeasured: 0, medianBps: { execution: 0, spread: null, impactTiming: null, opportunity: 7, total: 7 } } })!;
    expect(v.shortfall![1]).toEqual(['Spread paid', 'not computed']);
  });
  it('an unavailable body gives no view', () => {
    expect(describeOrders({ available: false })).toBeNull();
    expect(describeOrders(null)).toBeNull();
  });
});

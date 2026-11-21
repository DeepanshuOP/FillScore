import { describe, it, expect } from 'vitest';
import { describeOrders, describeTotals, hasTypeTotals, leadBreakdown, totalsFor } from './ordersView';

// The API gives, per term, the total over all measured orders in USD and in bps of the intended notional
// (backend orderSummary.termTotals). The view copies them; it never computes a market value.
const base = {
  available: true,
  orders: { total: 12, filled: 1, partial: 0, unfilled: 11, open: 0 },
  restingMs: null,
  shortfall: {
    n: 12, unmeasured: 0,
    medianBps: { execution: -0.0004, spread: 0, impactTiming: 0, opportunity: 50, total: 10 },
    totals: {
      execution: { usd: 10, bps: 2.857, n: 12 }, spread: { usd: 3, bps: 1, n: 12 }, impactTiming: { usd: 7, bps: 2.3333, n: 12 },
      opportunity: { usd: 1234.5, bps: 5.714, n: 12 }, fees: { usd: 30, bps: 8.5714, n: 12 }, total: { usd: 0.003, bps: 0.004, n: 12 },
    },
  },
  unfilled: { n: 11, medianOpportunityBps: 50 },
};

describe('leadBreakdown (the cost lines beside the letter)', () => {
  it('lists the shortfall terms the score is built from, in the order of the shortfall, then the total', () => {
    const rows = leadBreakdown(base)!;
    expect(rows.map(r => r.label)).toEqual(['Execution cost', 'Unfilled orders', 'Fees', 'Total']);
    expect(rows.map(r => r.usd)).toEqual(['$10.00', '$1,234.50', '$30.00', '<$0.01']);
  });
  it('is null when the orders were not measured (nothing to lead with, never zeros)', () => {
    expect(leadBreakdown(null)).toBeNull();
    expect(leadBreakdown({ ...base, shortfall: { ...base.shortfall, totals: null } })).toBeNull();
  });
});

describe('orders panel: totals beside medians', () => {
  const v = describeOrders(base)!;
  it('one row per term with USD, bps of intended notional and the order count', () => {
    expect(v.totals).toEqual([
      { label: 'Execution cost', usd: '$10.00', bps: '2.9 bps', n: '12 orders' },
      { label: 'Spread paid', usd: '$3.00', bps: '1.0 bps', n: '12 orders' },
      { label: 'Impact and timing', usd: '$7.00', bps: '2.3 bps', n: '12 orders' },
      { label: 'Unfilled orders', usd: '$1,234.50', bps: '5.7 bps', n: '12 orders' },
      { label: 'Fees', usd: '$30.00', bps: '8.6 bps', n: '12 orders' },
      { label: 'Total', usd: '<$0.01', bps: '<0.01 bps', n: '12 orders' },
    ]);
  });
  it('medians use the shared formatter: no "-0.0 bps"', () => {
    // 2026-11-20: rebuilt screens print a true minus sign (U+2212), formatSignedBps; the value and the rule are unchanged.
    expect(v.shortfall![0]).toEqual(['Execution cost', '−0.00 bps']);
    expect(v.shortfallExact![0]).toBe('Exactly −0.0004000 bps');   // A3: the exact value for the title
    expect(v.shortfallExact![4]).toBeNull();                       // 10 bps is shown in full
    expect(JSON.stringify(v)).not.toMatch(/-0\.0 bps|−0\.0 bps/);
  });
  it('totals the API did not send are absent, not zero', () => {
    const w = describeOrders({ ...base, shortfall: { ...base.shortfall, totals: null } })!;
    expect(w.totals).toBeNull();
    const x = describeOrders({ ...base, shortfall: { ...base.shortfall, totals: { ...base.shortfall.totals, fees: null } } })!;
    expect(x.totals!.find(r => r.label === 'Fees')).toEqual({ label: 'Fees', usd: 'not computed', bps: 'not computed', n: '' });
  });
  it('grammar: many unfilled orders take "their", one takes "its"', () => {
    expect(v.unfilledNote).toBe('11 unfilled orders; their median cost of not filling: 50.0 bps.');
    const one = describeOrders({ ...base, unfilled: { n: 1, medianOpportunityBps: 7 } })!;
    expect(one.unfilledNote).toBe('1 unfilled order; its median cost of not filling: 7.0 bps.');
  });
});

// Design v3 fixes B2: the switch reads the server's per-type totals (byType); the browser adds nothing up.
describe('totalsFor (the overview\'s All / Market / Limit switch)', () => {
  const T = (usd: number, bps: number, n: number) => ({ usd, bps, n });
  const typed = {
    ...base,
    byType: {
      all: base.shortfall.totals,
      market: { execution: T(4, 2, 5), spread: T(1, 0.5, 5), impactTiming: T(3, 1.5, 5), opportunity: null, fees: T(10, 5, 5), total: T(14, 7, 5) },
      limit: null,
      other: null,
    },
  };
  it('All is the all-orders totals; Market is byType.market, copied', () => {
    expect(totalsFor(typed, 'all')!.total).toEqual(base.shortfall.totals.total);
    expect(totalsFor(typed, 'market')!.total).toEqual(T(14, 7, 5));
    expect(describeTotals(totalsFor(typed, 'market'))!.rows.find((r) => r.label === 'Total')).toEqual({ label: 'Total', usd: '$14.00', bps: '7.0 bps', n: '5 orders' });
    expect(describeTotals(totalsFor(typed, 'market'))!.rows.find((r) => r.label === 'Unfilled orders')).toEqual({ label: 'Unfilled orders', usd: 'not computed', bps: 'not computed', n: '' });
  });
  it('a type with nothing measured is null (the receipt says so), and a body without byType offers no switch', () => {
    expect(totalsFor(typed, 'limit')).toBeNull();
    expect(hasTypeTotals(typed)).toBe(true);
    expect(hasTypeTotals(base)).toBe(false);
    expect(totalsFor(base, 'market')).toBeNull();
  });
});

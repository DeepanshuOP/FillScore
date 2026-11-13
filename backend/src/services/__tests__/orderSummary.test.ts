import { describe, it, expect } from 'vitest';
import { summariseOrders, quantile } from '../orderSummary';

// Orders (qty ordered / executed, status, resting ms):
//   1 LIMIT  1 / 1    FILLED    1000
//   2 LIMIT  2 / 2    FILLED    3000
//   3 MARKET 1 / 1    FILLED    null (not a resting order)
//   4 LIMIT  1 / 0    CANCELED  null (never filled)
//   5 LIMIT  1 / 0.5  CANCELED  5000 (first fill 5 s after creation)
//   6 LIMIT  1 / 0    NEW       null (still open)
// Counts: total 6, filled 3 (1, 2, 3), partial 1 (5), unfilled 1 (4: final status, nothing executed), open 1 (6).
// Resting time: only orders with a first fill: [1000, 3000, 5000]. n = 3, median 3000.
//   p90 by linear interpolation: position 0.9 x (3 - 1) = 1.8 -> 3000 + 0.8 x (5000 - 3000) = 4600.
const o = (orderId: string, type: string, origQty: number, executedQty: number, status: string, restingMs: number | null) =>
    ({ orderId, type, origQty, executedQty, status, restingMs });
const ORDERS = [
    o('1', 'LIMIT', 1, 1, 'FILLED', 1000), o('2', 'LIMIT', 2, 2, 'FILLED', 3000), o('3', 'MARKET', 1, 1, 'FILLED', null),
    o('4', 'LIMIT', 1, 0, 'CANCELED', null), o('5', 'LIMIT', 1, 0.5, 'CANCELED', 5000), o('6', 'LIMIT', 1, 0, 'NEW', null),
];
// Shortfall (bps) per measured order: execution, spread, impact/timing, opportunity, total.
const m = (orderId: string, e: number | null, s: number | null, i: number | null, opp: number | null, t: number | null) =>
    ({ orderId, unmeasuredReason: null, shortfall: { executionBps: e, spreadBps: s, impactTimingBps: i, opportunityBps: opp, totalBps: t } });
const MEAS = [
    m('1', 2, 1, 1, 0, 2.5), m('2', 4, 1, 3, 0, 4.5), m('3', 6, 2, 4, 0, 6.5),
    m('4', 0, null, null, 7, 7),             // never filled: no execution cost, spread and impact not defined
    m('5', 3, 1, 2, 5, 8),
    { orderId: '6', unmeasuredReason: 'no_quote_at_arrival', shortfall: null },       // not measured: counted, never imputed
];
// Medians over the orders that have the value:
//   execution [2, 4, 6, 0, 3] -> sorted 0 2 3 4 6 -> 3
//   spread    [1, 1, 2, 1]    -> sorted 1 1 1 2   -> (1 + 1) / 2 = 1
//   impact    [1, 3, 4, 2]    -> sorted 1 2 3 4   -> (2 + 3) / 2 = 2.5
//   opportunity [0, 0, 0, 7, 5] -> sorted 0 0 0 5 7 -> 0
//   total     [2.5, 4.5, 6.5, 7, 8] -> 6.5
// Unfilled orders with a measurement: order 4 only -> n 1, opportunity median 7.

describe('summariseOrders', () => {
    const s = summariseOrders(ORDERS, MEAS);

    it('counts orders by outcome', () => {
        expect(s.orders).toEqual({ total: 6, filled: 3, partial: 1, unfilled: 1, open: 1 });
    });
    it('resting time covers only orders that had a first fill', () => {
        expect(s.restingMs).toEqual({ n: 3, medianMs: 3000, p90Ms: 4600 });
    });
    it('shortfall medians use only the orders that have each value; unmeasured orders are counted, not imputed', () => {
        expect(s.shortfall).toEqual({
            n: 5, unmeasured: 1,
            medianBps: { execution: 3, spread: 1, impactTiming: 2.5, opportunity: 0, total: 6.5 },
            totals: null,       // these fixtures state no intended notional
        });
    });
    it('unfilled orders: their opportunity cost', () => {
        expect(s.unfilled).toEqual({ n: 1, medianOpportunityBps: 7 });
    });
});

describe('summariseOrders with nothing to show', () => {
    it('no orders: zero counts, every measured block null (never zero)', () => {
        const s = summariseOrders([], []);
        expect(s.orders).toEqual({ total: 0, filled: 0, partial: 0, unfilled: 0, open: 0 });
        expect(s.restingMs).toBeNull();
        expect(s.shortfall).toBeNull();
        expect(s.unfilled).toBeNull();
    });
    it('a measured order whose spread is unknown leaves that median null', () => {
        const s = summariseOrders([o('4', 'LIMIT', 1, 0, 'CANCELED', null)], [m('4', 0, null, null, 7, 7)]);
        expect(s.shortfall!.medianBps.spread).toBeNull();
        expect(s.shortfall!.medianBps.impactTiming).toBeNull();
        expect(s.shortfall!.medianBps.opportunity).toBe(7);
    });
});

describe('order ids are matched per exchange and symbol', () => {
    it('an unfilled BTCUSDT order 123 does not take the measurement of ETHUSDT order 123', () => {
        const orders = [{ ...o('123', 'LIMIT', 1, 0, 'CANCELED', null), exchange: 'binance', symbol: 'BTCUSDT' },
                        { ...o('123', 'LIMIT', 1, 1, 'FILLED', 10), exchange: 'binance', symbol: 'ETHUSDT' }];
        const meas = [{ ...m('123', 1, 1, 0, 0, 1), exchange: 'binance', symbol: 'ETHUSDT' }];
        const s = summariseOrders(orders, meas);
        expect(s.orders).toEqual({ total: 2, filled: 1, partial: 0, unfilled: 1, open: 0 });
        expect(s.unfilled).toBeNull();                       // the only measurement belongs to the filled ETH order
        expect(s.shortfall!.n).toBe(1);
    });
});

describe('quantile', () => {
    it('linear interpolation between order statistics', () => {
        expect(quantile([1000, 3000, 5000], 0.9)).toBeCloseTo(4600, 9);
        expect(quantile([5, 1, 3], 0.5)).toBe(3);
        expect(quantile([2], 0.9)).toBe(2);
        expect(quantile([], 0.5)).toBeNull();
    });
});

// Totals per term over all orders, in USD and in bps of the intended notional (M2 live-site review, item 3).
// Order A: intended notional $10,000. execution 2 bps = $2, spread 1 = $1, impact 1 = $1, opportunity 0, fees 10 = $10, total 12 = $12
// Order B: $20,000. execution 4 bps = $8, spread 1 = $2, impact 3 = $6, opportunity 0, fees 10 = $20, total 14 = $28
// Order C (unfilled): $5,000. execution 0, spread and impact not defined, opportunity 40 bps = $20, fees 0, total 40 = $20
// Per term the USD amounts add up over the orders that have the term; bps = USD / (their intended notional) x 10,000.
//   execution   $2 + $8 + $0 = $10  over $35,000 -> 10 / 35000 x 1e4 = 2.857142857...
//   spread      $1 + $2      = $3   over $30,000 -> 1.0
//   impact      $1 + $6      = $7   over $30,000 -> 2.333333...
//   opportunity $0 + $0 + $20 = $20 over $35,000 -> 5.714285714...
//   fees        $10 + $20 + $0 = $30 over $35,000 -> 8.571428571...
//   total       $12 + $28 + $20 = $60 over $35,000 -> 17.142857142...
// Check of the identity: 10 + 20 + 30 = 60 (execution + opportunity + fees = total).
describe('summariseOrders totals', () => {
    const sm = (orderId: string, notional: number, e: number | null, s: number | null, i: number | null, opp: number | null, f: number | null, t: number | null) =>
        ({ orderId, unmeasuredReason: null, shortfall: { intendedNotional: notional, executionBps: e, spreadBps: s, impactTimingBps: i, opportunityBps: opp, feesBps: f, totalBps: t } });
    const ords = [o('A', 'MARKET', 1, 1, 'FILLED', null), o('B', 'MARKET', 1, 1, 'FILLED', null), o('C', 'LIMIT', 1, 0, 'CANCELED', null)];
    const ms = [sm('A', 10000, 2, 1, 1, 0, 10, 12), sm('B', 20000, 4, 1, 3, 0, 10, 14), sm('C', 5000, 0, null, null, 40, 0, 40)];
    const t = summariseOrders(ords, ms).shortfall!.totals!;

    it('USD per term', () => {
        expect(t.execution.usd).toBeCloseTo(10, 9);
        expect(t.spread.usd).toBeCloseTo(3, 9);
        expect(t.impactTiming.usd).toBeCloseTo(7, 9);
        expect(t.opportunity.usd).toBeCloseTo(20, 9);
        expect(t.fees.usd).toBeCloseTo(30, 9);
        expect(t.total.usd).toBeCloseTo(60, 9);
    });
    it('bps of the intended notional of the orders that have the term', () => {
        expect(t.execution.bps).toBeCloseTo(2.857142857, 6);
        expect(t.spread.bps).toBeCloseTo(1, 9);
        expect(t.impactTiming.bps).toBeCloseTo(2.333333333, 6);
        expect(t.opportunity.bps).toBeCloseTo(5.714285714, 6);
        expect(t.fees.bps).toBeCloseTo(8.571428571, 6);
        expect(t.total.bps).toBeCloseTo(17.142857142, 6);
    });
    it('order counts per term', () => {
        expect([t.execution.n, t.spread.n, t.impactTiming.n, t.opportunity.n, t.fees.n, t.total.n]).toEqual([3, 2, 2, 3, 3, 3]);
    });
    it('a measurement without intendedNotional gives no totals (never a guess)', () => {
        expect(summariseOrders(ORDERS, MEAS).shortfall!.totals).toBeNull();
    });
});

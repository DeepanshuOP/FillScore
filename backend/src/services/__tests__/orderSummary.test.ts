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

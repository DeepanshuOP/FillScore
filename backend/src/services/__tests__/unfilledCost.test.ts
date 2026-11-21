import { describe, it, expect } from 'vitest';
import { unfilledCost, summariseOrders } from '../orderSummary';

// Design v3.1 fixes A1 (2026-11-22): the overview total includes the modelled cost of orders that never filled, which
// nobody paid. The server states that share, so the screen can say "of it in orders that never filled".
// Hand fixture (intended notional; total cost in bps; dollars = bps x notional / 10,000):
//   A CANCELED, executed 0      notional 1000, total 25 bps -> 25 x 1000 / 1e4 = 2.50   unfilled
//   B EXPIRED,  executed 0      notional  500, total 40 bps -> 40 x  500 / 1e4 = 2.00   unfilled
//   C FILLED                    notional 2000, total 10 bps -> 2.00                      filled: not in the share
//   D CANCELED, executed 0.5/1  notional  800, total 30 bps -> 2.40                      partly filled: not unfilled
//   E NEW (still open), 0       notional  100, total 90 bps -> 0.90                      open: not unfilled
// unfilled share: 2.50 + 2.00 = 4.50 dollars over 2 orders; the all-orders total is 4.5 + 2 + 2.4 + 0.9 = 9.8.
const o = (orderId: string, status: string, executedQty: number, symbol = 'BTCUSDT') =>
    ({ orderId, exchange: 'binance', symbol, type: 'LIMIT', origQty: 1, executedQty, status });
const m = (orderId: string, nt: number, total: number, symbol = 'BTCUSDT') =>
    ({ orderId, exchange: 'binance', symbol, unmeasuredReason: null, shortfall: { intendedNotional: nt, totalBps: total } });
const ORDERS = [o('A', 'CANCELED', 0), o('B', 'EXPIRED', 0), o('C', 'FILLED', 1), o('D', 'CANCELED', 0.5), o('E', 'NEW', 0)];
const MEAS = [m('A', 1000, 25), m('B', 500, 40), m('C', 2000, 10), m('D', 800, 30), m('E', 100, 90)];

describe('unfilledCost', () => {
    it('sums the cost of the orders that never filled, and counts them', () => {
        const u = unfilledCost(ORDERS, MEAS)!;
        expect(u.usd).toBeCloseTo(4.5, 12);
        expect(u.count).toBe(2);
        expect(u.measured).toBe(2);
    });

    it('is a share of the same total the headline reads', () => {
        const s = summariseOrders(ORDERS, MEAS);
        expect(s.shortfall!.totals!.total!.usd).toBeCloseTo(9.8, 12);
        expect(unfilledCost(ORDERS, MEAS)!.usd).toBeLessThanOrEqual(s.shortfall!.totals!.total!.usd);
    });

    it('counts an unfilled order that was not measured, but adds no dollars for it', () => {
        // B has no measurement: the share is A alone, 2.50 dollars; the count stays 2 and `measured` is 1
        const u = unfilledCost(ORDERS, MEAS.filter(x => x.orderId !== 'B'))!;
        expect(u.usd).toBeCloseTo(2.5, 12);
        expect(u.count).toBe(2);
        expect(u.measured).toBe(1);
    });

    it('is zero dollars over zero orders when every order filled or is open', () => {
        const u = unfilledCost([ORDERS[2], ORDERS[4]], MEAS)!;
        expect(u).toEqual({ usd: 0, count: 0, measured: 0 });
    });

    it('is null dollars (not zero) when unfilled orders exist and none was measured', () => {
        const u = unfilledCost(ORDERS, [])!;
        expect(u).toEqual({ usd: null, count: 2, measured: 0 });
    });

    it('keeps order ids apart per symbol', () => {
        // two orders with id "A": BTCUSDT filled (not unfilled), ETHUSDT canceled with nothing executed, 3 bps on 1000 = 0.30
        const u = unfilledCost([o('A', 'FILLED', 1, 'BTCUSDT'), o('A', 'CANCELED', 0, 'ETHUSDT')],
            [m('A', 1000, 99, 'BTCUSDT'), m('A', 1000, 3, 'ETHUSDT')])!;
        expect(u.usd).toBeCloseTo(0.3, 12);
        expect(u.count).toBe(1);
    });
});

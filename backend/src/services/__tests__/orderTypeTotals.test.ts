import { describe, it, expect } from 'vitest';
import { totalsByType } from '../orderSummary';

// Design v3 fixes B2 (2026-11-21): the shortfall totals per order type, on the server, beside the all-orders totals.
// Hand fixture (intended notional; bps per term: execution, fees, total):
//   1 MARKET       notional 1000: execution 4,  fees 10, total 14  -> usd 0.4,  1.0, 1.4
//   2 LIMIT        notional 2000: execution -1, fees 10, total 9   -> usd -0.2, 2.0, 1.8
//   3 LIMIT_MAKER  notional 500:  execution 0,  fees 2,  total 2   -> usd 0,    0.1, 0.1   (a limit order)
//   4 STOP_LOSS    notional 100:  execution 10, fees 10, total 20  -> usd 0.1,  0.1, 0.2   (neither: "other")
//   5 MARKET       not measured (no shortfall)                       -> left out, as in the all-orders totals
// market: total usd 1.4, notional 1000 -> 14 bps, n 1
// limit:  total usd 1.8 + 0.1 = 1.9, notional 2500 -> 1.9 / 2500 x 10,000 = 7.6 bps, n 2
// other:  total usd 0.2, notional 100 -> 20 bps, n 1
// all:    total usd 1.4 + 1.9 + 0.2 = 3.5, notional 3600 -> 3.5 / 3600 x 10,000 = 9.7222 bps, n 4
const order = (orderId: string, type: string) => ({ orderId, exchange: 'binance', symbol: 'BTCUSDT', type, origQty: 1, executedQty: 1, status: 'FILLED' });
const m = (orderId: string, nt: number, e: number, f: number, t: number) =>
    ({ orderId, exchange: 'binance', symbol: 'BTCUSDT', unmeasuredReason: null, shortfall: { intendedNotional: nt, executionBps: e, feesBps: f, totalBps: t } });
const ORDERS = [order('1', 'MARKET'), order('2', 'LIMIT'), order('3', 'LIMIT_MAKER'), order('4', 'STOP_LOSS'), order('5', 'MARKET')];
const MEAS = [m('1', 1000, 4, 10, 14), m('2', 2000, -1, 10, 9), m('3', 500, 0, 2, 2), m('4', 100, 10, 10, 20),
    { orderId: '5', exchange: 'binance', symbol: 'BTCUSDT', unmeasuredReason: 'no_quote_at_arrival', shortfall: null }];

describe('totalsByType', () => {
    const t = totalsByType(ORDERS, MEAS);

    it('totals each term per type', () => {
        expect(t.market!.total).toEqual({ usd: expect.closeTo(1.4, 12), bps: expect.closeTo(14, 9), n: 1 });
        expect(t.limit!.total).toEqual({ usd: expect.closeTo(1.9, 12), bps: expect.closeTo(7.6, 9), n: 2 });
        expect(t.other!.total).toEqual({ usd: expect.closeTo(0.2, 12), bps: expect.closeTo(20, 9), n: 1 });
        expect(t.limit!.execution!.usd).toBeCloseTo(-0.2, 12);
    });

    it('the types sum to the all-orders totals, term by term (dollars and orders)', () => {
        for (const term of ['execution', 'fees', 'total'] as const) {
            const parts = [t.market, t.limit, t.other].map(x => x?.[term]).filter(Boolean) as Array<{ usd: number; n: number }>;
            expect(parts.reduce((s, p) => s + p.usd, 0)).toBeCloseTo(t.all![term]!.usd, 12);
            expect(parts.reduce((s, p) => s + p.n, 0)).toBe(t.all![term]!.n);
        }
        expect(t.all!.total!.usd).toBeCloseTo(3.5, 12);
        expect(t.all!.total!.bps).toBeCloseTo(9.7222222222, 8);
    });

    it('a type with no measured order is null, never zeros', () => {
        const only = totalsByType([order('1', 'MARKET')], [m('1', 1000, 4, 10, 14)]);
        expect(only.limit).toBeNull();
        expect(only.other).toBeNull();
    });
});

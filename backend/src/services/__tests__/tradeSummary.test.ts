import { describe, it, expect } from 'vitest';
import { summariseTrades } from '../tradeSummary';

// Current fills of an account (not the frozen v1 audit): 4 fills in 3 orders.
//   notional 100 + 250.5 + 50 + 99.5 = 500 ; makers: 2 of 4 fills -> 0.5 ; orders 3.
describe('summariseTrades', () => {
    const fills = [
        { notional: 100, isMaker: true }, { notional: 250.5, isMaker: false }, { notional: 50, isMaker: true }, { notional: 99.5, isMaker: false },
    ];
    it('counts fills and orders, sums notional, maker ratio over fills', () => {
        expect(summariseTrades(fills, 3)).toEqual({ fills: 4, orders: 3, notionalUsd: 500, makerRatio: 0.5 });
    });
    it('no fills: nothing to show, maker ratio null (never 0)', () => {
        expect(summariseTrades([], 0)).toEqual({ fills: 0, orders: 0, notionalUsd: null, makerRatio: null });
    });
});

import { describe, it, expect } from 'vitest';
import { buildOrderLedger, orderCounts } from '../orderLedger';

// Design v3 fixes A1 (2026-11-21): the orders ledger lists every stored order (filled or not), and its header counts
// come from the server. Hand-computed fixture:
//   orders (symbol, id, type, side, status, created):
//     BTC 1 LIMIT  BUY  FILLED    10:00:00   fills a (0.5 @ 100, fee 0.05, maker) and b (0.5 @ 102, fee 0.05, maker)
//     BTC 2 MARKET SELL FILLED    11:00:00   fill c (1 @ 101, fee 0.10, taker)
//     ETH 2 LIMIT  BUY  CANCELED  12:00:00   no fills (same id as BTC 2 on another symbol: order ids are per symbol)
//     BTC 3 LIMIT  BUY  EXPIRED   13:00:00   no fills
//   fill d (ETH, order 9, 2 @ 10, fee unknown) has no stored order.
//   counts: orders 4 (stored documents), withFills 2 (BTC 1, BTC 2), fills 4 (a, b, c, d), unrecorded 1 (ETH 9).
//   BTC 1: quantity 0.5 + 0.5 = 1; notional 0.5 x 100 + 0.5 x 102 = 50 + 51 = 101; fees 0.05 + 0.05 = 0.10;
//          maker share 101 / 101 = 1; first fill 10:00:01; last fill 10:00:03.
//   BTC 2: quantity 1; notional 101; fees 0.10; maker share 0; first and last fill 11:00:02.
//   ETH 2, BTC 3: 0 fills, quantity 0, notional 0, fees null, maker share null, first fill null.
//   ETH 9: status null (no stored order), 1 fill, notional 20, fees null (one fee unknown), placedAt null.
//   Order: newest placed or first fill first: BTC 3 (13:00), ETH 2 (12:00), BTC 2 (11:00), BTC 1 (10:00), then ETH 9
//   (its first fill 09:00 is the oldest).
const D = (t: string) => new Date(`2024-01-15T${t}Z`);
const order = (symbol: string, orderId: string, type: string, side: string, status: string, created: string, origQty = 1, executedQty = 0) =>
    ({ exchange: 'binance', symbol, orderId, type, side, status, origQty, executedQty, createdAt: D(created) });
const fill = (tradeId: string, symbol: string, orderId: string, quantity: number, price: number, feeUsd: number | null, isMaker: boolean | null, at: string) =>
    ({ exchange: 'binance', tradeId, symbol, orderId, quantity, executionPrice: price, notional: quantity * price, feeUsd, isMaker, executedAt: D(at) });
const ORDERS = [
    order('BTCUSDT', '1', 'LIMIT', 'BUY', 'FILLED', '10:00:00', 1, 1),
    order('BTCUSDT', '2', 'MARKET', 'SELL', 'FILLED', '11:00:00', 1, 1),
    order('ETHUSDT', '2', 'LIMIT', 'BUY', 'CANCELED', '12:00:00'),
    order('BTCUSDT', '3', 'LIMIT', 'BUY', 'EXPIRED', '13:00:00'),
];
const FILLS = [
    fill('a', 'BTCUSDT', '1', 0.5, 100, 0.05, true, '10:00:01'),
    fill('b', 'BTCUSDT', '1', 0.5, 102, 0.05, true, '10:00:03'),
    fill('c', 'BTCUSDT', '2', 1, 101, 0.10, false, '11:00:02'),
    fill('d', 'ETHUSDT', '9', 2, 10, null, false, '09:00:00'),
];

// Design v3 fixes B1: each order's total cost, from its stored measurement, by the formula the receipt uses
// (orderReplay.ts): usd = shortfall.totalBps x shortfall.intendedNotional / 10,000.
//   BTC 1: 2.5 bps of 101   -> 2.5 x 101 / 10,000 = 0.02525
//   BTC 2: -4 bps of 101    -> -4 x 101 / 10,000 = -0.0404 (price improvement: negative)
//   ETH 2: 7 bps of 50      -> 7 x 50 / 10,000 = 0.035 (unfilled: its opportunity cost)
//   BTC 3: not measured     -> null; ETH 9: no stored order, no measurement -> null
const meas = (symbol: string, orderId: string, shortfall: Record<string, number> | null, unmeasuredReason: string | null = null) =>
    ({ exchange: 'binance', symbol, orderId, shortfall, unmeasuredReason });
const MEAS = [
    meas('BTCUSDT', '1', { totalBps: 2.5, intendedNotional: 101 }),
    meas('BTCUSDT', '2', { totalBps: -4, intendedNotional: 101 }),
    meas('ETHUSDT', '2', { totalBps: 7, intendedNotional: 50 }),
    meas('BTCUSDT', '3', null, 'no_quote_at_arrival'),
];

describe('buildOrderLedger: each order\'s total cost (B1)', () => {
    const rows = buildOrderLedger(ORDERS, FILLS, MEAS).orders;
    const cost = (s: string, id: string) => rows.find(r => r.symbol === s && r.orderId === id)!.cost;
    it('usd and bps from the stored measurement, by the receipt\'s formula', () => {
        expect(cost('BTCUSDT', '1')!.bps).toBe(2.5);
        expect(cost('BTCUSDT', '1')!.usd).toBeCloseTo(0.02525, 12);
        expect(cost('BTCUSDT', '2')!.usd).toBeCloseTo(-0.0404, 12);
        expect(cost('ETHUSDT', '2')!.usd).toBeCloseTo(0.035, 12);
    });
    it('null, never zero, for an order that was not measured or has no stored order', () => {
        expect(cost('BTCUSDT', '3')).toBeNull();
        expect(cost('ETHUSDT', '9')).toBeNull();
    });
    it('without measurements every cost is null', () => {
        expect(buildOrderLedger(ORDERS, FILLS).orders.every(r => r.cost === null)).toBe(true);
    });
});

describe('orderCounts', () => {
    it('counts stored orders, orders with a fill, fills, and fill groups without a stored order', () => {
        expect(orderCounts(ORDERS, FILLS)).toEqual({ orders: 4, withFills: 2, fills: 4, unrecorded: 1 });
    });
    it('an account with no orders and no fills counts zero of each (the route answers available: false before this)', () => {
        expect(orderCounts([], [])).toEqual({ orders: 0, withFills: 0, fills: 0, unrecorded: 0 });
    });
});

describe('buildOrderLedger', () => {
    const l = buildOrderLedger(ORDERS, FILLS);

    it('lists every stored order, filled or not, then the fill groups without a stored order', () => {
        expect(l.orders.map(r => `${r.symbol}:${r.orderId}`)).toEqual(['BTCUSDT:3', 'ETHUSDT:2', 'BTCUSDT:2', 'BTCUSDT:1', 'ETHUSDT:9']);
        expect(l.counts).toEqual(orderCounts(ORDERS, FILLS));
    });

    it('sums the fills of an order on the server', () => {
        const r = l.orders.find(x => x.symbol === 'BTCUSDT' && x.orderId === '1')!;
        expect(r).toMatchObject({ side: 'BUY', type: 'LIMIT', status: 'FILLED', fills: 2, placedAt: '2024-01-15T10:00:00.000Z',
            firstFill: '2024-01-15T10:00:01.000Z', lastFill: '2024-01-15T10:00:03.000Z', makerShare: 1 });
        expect(r.quantity).toBeCloseTo(1, 12);
        expect(r.notionalUsd).toBeCloseTo(101, 12);
        expect(r.feesUsd).toBeCloseTo(0.10, 12);
    });

    it('an unfilled order keeps its status and has no fill figures (null, never zero, where a value is unknown)', () => {
        const r = l.orders.find(x => x.symbol === 'ETHUSDT' && x.orderId === '2')!;
        expect(r).toMatchObject({ status: 'CANCELED', fills: 0, quantity: 0, notionalUsd: 0, feesUsd: null, makerShare: null, firstFill: null, lastFill: null });
    });

    it('a fill group without a stored order has a null status and placed time; one unknown fee makes the fee total null', () => {
        const r = l.orders.find(x => x.orderId === '9')!;
        expect(r).toMatchObject({ status: null, type: null, placedAt: null, fills: 1, notionalUsd: 20, feesUsd: null, makerShare: 0 });
    });
});

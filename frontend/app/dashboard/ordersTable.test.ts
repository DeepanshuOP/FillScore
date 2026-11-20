import { describe, it, expect } from 'vitest';
import { groupOrders, type AuditTrade } from './ordersTable';

/*
 * Hand-computed fixture: 3 orders from 5 fills.
 *
 *  BTCUSDT:o1, BUY, MARKET, two taker fills
 *    0.5 at 100, notional 50.00, fee 0.05 (10:00:05)   |  0.25 at 102, notional 25.50, fee 0.03 (10:00:09)
 *    quantity 0.5 + 0.25 = 0.75; notional 50 + 25.5 = 75.5; fees 0.05 + 0.03 = 0.08; maker share = 0 / 75.5 = 0
 *  ETHUSDT:o2, SELL, LIMIT, one maker fill and one taker fill, one fee unknown
 *    2 at 10, notional 20, fee null, maker (11:00:00)  |  1 at 11, notional 11, fee 0.01, taker (11:00:02)
 *    quantity 2 + 1 = 3; notional 20 + 11 = 31; fees null (one fill has none, never counted as 0); maker share = 20 / 31
 *  t9, a trade without an order id, SELL, type not recorded, isMaker unknown
 *    1 at 50, notional 50, fee 0.02 (09:00:00); fills 1; maker share null (unknown, never 0)
 *  Newest first by first fill: o2 (11:00:00), o1 (10:00:05), t9 (09:00:00).
 */
const trades: AuditTrade[] = [
  { tradeId: 'a1', orderId: 'o1', symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET', isMaker: false, executedAt: '2026-11-01T10:00:05.000Z', executionPrice: 100, quantity: 0.5, notionalValue: 50, feePaid: 0.05 },
  { tradeId: 'a2', orderId: 'o1', symbol: 'BTCUSDT', side: 'BUY', orderType: 'MARKET', isMaker: false, executedAt: '2026-11-01T10:00:09.000Z', executionPrice: 102, quantity: 0.25, notionalValue: 25.5, feePaid: 0.03 },
  { tradeId: 'b1', orderId: 'o2', symbol: 'ETHUSDT', side: 'SELL', orderType: 'LIMIT', isMaker: true, executedAt: '2026-11-01T11:00:00.000Z', executionPrice: 10, quantity: 2, notionalValue: 20, feePaid: null },
  { tradeId: 'b2', orderId: 'o2', symbol: 'ETHUSDT', side: 'SELL', orderType: 'LIMIT', isMaker: false, executedAt: '2026-11-01T11:00:02.000Z', executionPrice: 11, quantity: 1, notionalValue: 11, feePaid: 0.01 },
  { tradeId: 't9', symbol: 'BTCUSDT', side: 'SELL', isMaker: null, executedAt: '2026-11-01T09:00:00.000Z', executionPrice: 50, quantity: 1, notionalValue: 50, feePaid: 0.02 },
];

describe('groupOrders', () => {
  const rows = groupOrders(trades);

  it('groups 5 fills into 3 orders, newest first', () => {
    expect(rows.map((r) => r.key)).toEqual(['ETHUSDT:o2', 'BTCUSDT:o1', 't9']);
  });
  it('sums a market order', () => {
    const r = rows[1];
    expect(r).toMatchObject({ orderId: 'o1', symbol: 'BTCUSDT', side: 'BUY', type: 'Market', firstFill: '2026-11-01T10:00:05.000Z', fills: 2 });
    expect(r.quantity).toBeCloseTo(0.75, 10);
    expect(r.notionalUsd).toBeCloseTo(75.5, 10);
    expect(r.feesUsd).toBeCloseTo(0.08, 10);
    expect(r.makerShare).toBe(0);
  });
  it('keeps a missing fee as null and the maker share by notional', () => {
    const r = rows[0];
    expect(r).toMatchObject({ type: 'Limit', side: 'SELL', fills: 2, quantity: 3, notionalUsd: 31, feesUsd: null });
    expect(r.makerShare).toBeCloseTo(20 / 31, 10);
  });
  it('gives a trade without an order id its own row', () => {
    expect(rows[2]).toMatchObject({ orderId: '', type: 'Not recorded', fills: 1, quantity: 1, notionalUsd: 50, feesUsd: 0.02, makerShare: null });
  });
  it('does not merge the same order id on two symbols', () => {
    const two = groupOrders([
      { ...trades[0], symbol: 'AAA', orderId: 'x' }, { ...trades[1], symbol: 'BBB', orderId: 'x' },
    ]);
    expect(two).toHaveLength(2);
  });
  it('returns no rows for no trades', () => {
    expect(groupOrders([])).toEqual([]);
  });
});

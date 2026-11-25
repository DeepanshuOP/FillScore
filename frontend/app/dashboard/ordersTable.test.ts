import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ledgerRows, orderCountsOf, countsLine, fillsLine, statusLabel, isUnfilled, circledLabel } from './ordersTable';

/*
 * Design v3 fixes A1 (2026-11-21): the orders ledger copies the server's rows (GET /api/audit/orders-ledger); the sums
 * of the fills of an order are computed on the server (backend/src/services/orderLedger.ts, tested there with hand
 * values). This file only maps the fields; nothing is added up in the browser.
 */
const body = {
  available: true,
  counts: { orders: 2, withFills: 1, fills: 2, unrecorded: 1 },
  orders: [
    { key: 'binance|BTCUSDT|1', orderId: '1', symbol: 'BTCUSDT', side: 'BUY', type: 'LIMIT', status: 'FILLED', placedAt: '2024-01-15T10:00:00.000Z',
      firstFill: '2024-01-15T10:00:01.000Z', lastFill: '2024-01-15T10:00:03.000Z', fills: 1, quantity: 1, notionalUsd: 101, feesUsd: 0.1, makerShare: 1,
      cost: { usd: 0.02525, bps: 2.5 } },
    { key: 'binance|ETHUSDT|2', orderId: '2', symbol: 'ETHUSDT', side: 'SELL', type: 'MARKET', status: 'CANCELED', placedAt: '2024-01-15T12:00:00.000Z',
      firstFill: null, lastFill: null, fills: 0, quantity: 0, notionalUsd: 0, feesUsd: 0, makerShare: null },   // the server sends $0 for an order that ended unfilled (2026-11-22)
    { key: 'binance|ETHUSDT|9', orderId: '9', symbol: 'ETHUSDT', side: 'BUY', type: null, status: null, placedAt: null,
      firstFill: '2024-01-15T09:00:00.000Z', lastFill: '2024-01-15T09:00:00.000Z', fills: 1, quantity: 2, notionalUsd: 20, feesUsd: null, makerShare: 0 },
  ],
};

import { FEE_PENDING, feesCell, feesTitle, notionalCell } from './ordersTable';
describe('the Notional and Fees cells of a cancelled order with no fills (orders of 2026-11-22)', () => {
  const rows = ledgerRows(body)!;
  it('fees read $0.00 with the reason, not "not computed"; notional says it is the executed amount', () => {
    expect(feesCell(rows[1])).toBe('$0.00');
    expect(feesTitle(rows[1])).toBe('No fill, no fee');
    expect(notionalCell(rows[1])).toBe('$0.00 executed');
  });
  it('a filled order prints its served figures plainly, with no note', () => {
    expect(feesCell(rows[0])).toBe('$0.10');
    expect(feesTitle(rows[0])).toBeUndefined();
    expect(notionalCell(rows[0])).toBe('$101.00');
  });
  it('an unknown fee is null, and the cell says "pending" with the reason: never a zero (design v5, PROPOSAL §4 row 8)', () => {
    expect(FEE_PENDING.text).toBe('pending');
    expect(FEE_PENDING.title).toBe('Fee pending: the price lookup is retried at the next sync');
    expect(FEE_PENDING.text).not.toMatch(/\$?0/);
  });
  it('an unknown fee stays null: a fill group without a stored order', () => {
    expect(feesCell(rows[2])).toBeNull();
    expect(feesTitle(rows[2])).toBeUndefined();
    expect(notionalCell(rows[2])).toBe('$20.00');
  });
  it('an order still open with no fill is not labelled "executed" and its fee is not forced to zero', () => {
    const open = { status: 'NEW', fills: 0, notionalUsd: 0, feesUsd: null };
    expect(notionalCell(open)).toBe('$0.00');
    expect(feesCell(open)).toBeNull();
  });
  it('a cancelled order whose fees the server sent as unknown is not labelled "executed" either', () => {
    // the exchange says it was partly filled but no fill is stored: fees null, so no "executed" and no "No fill, no fee"
    const lagged = { status: 'CANCELED', fills: 0, notionalUsd: 0, feesUsd: null };
    expect(notionalCell(lagged)).toBe('$0.00');
    expect(feesCell(lagged)).toBeNull();
    expect(feesTitle(lagged)).toBeUndefined();
  });
});

describe('ledgerRows', () => {
  const rows = ledgerRows(body)!;
  it('keeps every server row, in the server order, with the type in words', () => {
    expect(rows.map((r) => r.key)).toEqual(['binance|BTCUSDT|1', 'binance|ETHUSDT|2', 'binance|ETHUSDT|9']);
    expect(rows.map((r) => r.type)).toEqual(['Limit', 'Market', 'Not recorded']);
  });
  it('copies the server figures unchanged (no arithmetic in the browser)', () => {
    expect(rows[0]).toMatchObject({ fills: 1, quantity: 1, notionalUsd: 101, feesUsd: 0.1, makerShare: 1, status: 'FILLED', when: '2024-01-15T10:00:00.000Z',
      cost: { usd: 0.02525, bps: 2.5 } });
    expect(rows[1].cost).toBeNull();   // B1: no cost sent, null (never 0)
  });
  it('an unfilled order keeps its status and nulls; a fill group without a stored order is dated by its first fill', () => {
    expect(rows[1]).toMatchObject({ status: 'CANCELED', fills: 0, feesUsd: 0, makerShare: null, firstFill: null });
    expect(rows[2]).toMatchObject({ status: null, when: '2024-01-15T09:00:00.000Z' });
  });
  it('a LIMIT_MAKER order is a limit order, as the per-type totals count it', () => {
    expect(ledgerRows({ available: true, orders: [{ ...body.orders[0], type: 'LIMIT_MAKER' }] })![0].type).toBe('Limit');
  });
  it('is null for a body that is not available', () => {
    expect(ledgerRows({ available: false })).toBeNull();
    expect(ledgerRows(null)).toBeNull();
  });
});

describe('countsLine (the ledger header, from the server counts)', () => {
  it('orders, orders with fills and fills, with separators and number agreement', () => {
    expect(countsLine({ orders: 245, withFills: 234, fills: 607, unrecorded: 0 })).toBe('245 orders, 234 with fills, 607 fills.');
    expect(countsLine({ orders: 1, withFills: 1, fills: 1, unrecorded: 0 })).toBe('1 order, 1 with fills, 1 fill.');
    expect(countsLine({ orders: 12000, withFills: 11000, fills: 30500, unrecorded: 0 })).toBe('12,000 orders, 11,000 with fills, 30,500 fills.');
  });
  it('names the fill groups without a stored order', () => {
    expect(countsLine({ orders: 2, withFills: 1, fills: 2, unrecorded: 1 })).toBe('2 orders, 1 with fills, 2 fills; 1 group of fills has no stored order.');
    expect(countsLine({ orders: 2, withFills: 1, fills: 5, unrecorded: 3 })).toBe('2 orders, 1 with fills, 5 fills; 3 groups of fills have no stored order.');
  });
});

describe('fillsLine (under the overview\'s order count, which already says the orders)', () => {
  it('orders with fills and fills, from the same counts', () => {
    expect(fillsLine({ orders: 245, withFills: 234, fills: 607, unrecorded: 0 })).toBe('234 with fills, 607 fills.');
    expect(fillsLine({ orders: 1, withFills: 1, fills: 1, unrecorded: 0 })).toBe('1 with fills, 1 fill.');
    expect(fillsLine({ orders: 2, withFills: 1, fills: 5, unrecorded: 3 })).toBe('1 with fills, 5 fills; 3 groups of fills have no stored order.');
  });
});

describe('statusLabel', () => {
  it('prints the stored status in words; a missing order says so', () => {
    expect(['FILLED', 'PARTIALLY_FILLED', 'CANCELED', 'EXPIRED', 'EXPIRED_IN_MATCH', 'REJECTED', 'NEW', null].map(statusLabel))
      .toEqual(['Filled', 'Partly filled', 'Cancelled', 'Expired', 'Expired', 'Rejected', 'Open', 'No stored order']);
  });
});

// A2 (2026-11-22): the tape's pen circle names an unfilled order. The outcome is read from the ledger row's stored status
// and its fill count (the server's), the same rule as the server's order counts: a final status other than FILLED and no fill.
describe('unfilled outcome of a ledger row', () => {
  const row = (status: string | null, fills: number) => ({ status, fills }) as Parameters<typeof isUnfilled>[0];
  it('is unfilled when the order ended without a fill', () => {
    expect(['CANCELED', 'CANCELLED', 'EXPIRED', 'EXPIRED_IN_MATCH', 'REJECTED'].map((s) => isUnfilled(row(s, 0)))).toEqual([true, true, true, true, true]);
  });
  it('is not unfilled when it filled, filled in part, is still open, or has no stored order', () => {
    expect([row('FILLED', 2), row('CANCELED', 1), row('PARTIALLY_FILLED', 1), row('NEW', 0), row(null, 0)].map(isUnfilled))
      .toEqual([false, false, false, false, false]);
  });
  it('labels the circled amount', () => {
    expect(circledLabel('$3.31', row('CANCELED', 0))).toBe('$3.31, unfilled: market moved away');
    expect(circledLabel('$3.31', row('FILLED', 1))).toBe('$3.31');
  });
});

describe('the overview and the ledger take their counts from one server source', () => {
  // The fixtures are cut from the offline demo build by the production functions (e2e-shots/cut-fixtures.ts):
  // GET /audit/orders-summary (the overview) and GET /audit/orders-ledger (the Orders page) both carry `counts`
  // from backend orderCounts(). demo-moderate: 245 stored orders, 234 of them with fills, 607 fills.
  const fx = JSON.parse(readFileSync(resolve(__dirname, '../../e2e-shots/fixtures/demo-moderate.json'), 'utf8'));
  it('both bodies carry the same counts, and the ledger lists every order', () => {
    expect(orderCountsOf(fx.ordersBody)).toEqual({ orders: 245, withFills: 234, fills: 607, unrecorded: 0 });
    expect(orderCountsOf(fx.ledger)).toEqual(orderCountsOf(fx.ordersBody));
    expect(ledgerRows(fx.ledger)!.filter((r) => r.status !== null)).toHaveLength(245);
    expect(countsLine(orderCountsOf(fx.ledger)!)).toBe('245 orders, 234 with fills, 607 fills.');
  });
});

/**
 * View model of the orders ledger (design v3 fixes A1, 2026-11-21). Pure. Every row and count comes from GET
 * /api/audit/orders-ledger, which lists every stored order (filled or not) and sums the fills on the server
 * (backend/src/services/orderLedger.ts). This file maps fields to words; it adds nothing up. A value the server sent as
 * null (an unknown fee, an unknown maker flag, an order with no fills) stays null, never zero.
 */
import { formatUsd } from '../ui/format';

export type OrderType = 'Market' | 'Limit' | 'Not recorded';

export interface OrderCounts { orders: number; withFills: number; fills: number; unrecorded: number }

export interface OrderRow {
  key: string;
  /** Empty for a fill without an order id: it has no replay. */
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: OrderType;
  /** The stored order status; null for fills whose order is not stored. */
  status: string | null;
  placedAt: string | null;
  firstFill: string | null;
  /** The time the ledger sorts and the tape places the row by: placed, else the first fill. */
  when: string;
  fills: number;
  quantity: number;
  notionalUsd: number;
  feesUsd: number | null;
  makerShare: number | null;
  /** Design v3 fixes B1: the order's total cost from the server (negative = price improvement); null if not measured. */
  cost: { usd: number; bps: number } | null;
}

interface ServerRow {
  key: string; orderId: string; symbol: string; side: string; type: string | null; status: string | null; placedAt: string | null;
  firstFill: string | null; fills: number; quantity: number; notionalUsd: number; feesUsd: number | null; makerShare: number | null;
  cost?: { usd: number; bps: number } | null;
}

const typeOf = (raw: string | null | undefined): OrderType => {
  const t = (raw ?? '').toUpperCase();
  // LIMIT_MAKER (post-only) is a limit order, as the server's per-type totals count it (orderSummary.typeFamily)
  return t === 'MARKET' ? 'Market' : t === 'LIMIT' || t === 'LIMIT_MAKER' ? 'Limit' : 'Not recorded';
};

export function ledgerRows(body: unknown): OrderRow[] | null {
  const b = body as { available?: boolean; orders?: ServerRow[] } | null;
  if (!b || b.available !== true || !Array.isArray(b.orders)) return null;
  return b.orders.map((r) => ({
    key: r.key, orderId: r.orderId ?? '', symbol: r.symbol, side: r.side === 'SELL' ? 'SELL' : 'BUY', type: typeOf(r.type),
    status: r.status ?? null, placedAt: r.placedAt ?? null, firstFill: r.firstFill ?? null, when: r.placedAt ?? r.firstFill ?? '',
    fills: r.fills, quantity: r.quantity, notionalUsd: r.notionalUsd, feesUsd: r.feesUsd ?? null, makerShare: r.makerShare ?? null,
    cost: r.cost && Number.isFinite(r.cost.usd) && Number.isFinite(r.cost.bps) ? { usd: r.cost.usd, bps: r.cost.bps } : null,
  }));
}

/** The order counts the server sent beside the summary or the ledger (backend orderCounts), or null. */
export function orderCountsOf(body: unknown): OrderCounts | null {
  const c = (body as { available?: boolean; counts?: OrderCounts } | null)?.counts;
  return c && typeof c.orders === 'number' ? c : null;
}

const int = new Intl.NumberFormat('en-US');
const n = (v: number, one: string, many: string) => `${int.format(v)} ${v === 1 ? one : many}`;

const tail = (head: string, c: OrderCounts) =>
  c.unrecorded > 0 ? `${head}; ${c.unrecorded === 1 ? '1 group of fills has' : `${int.format(c.unrecorded)} groups of fills have`} no stored order.` : `${head}.`;

/** "245 orders, 234 with fills, 607 fills." from the server counts. */
export function countsLine(c: OrderCounts): string {
  return tail(`${n(c.orders, 'order', 'orders')}, ${int.format(c.withFills)} with fills, ${n(c.fills, 'fill', 'fills')}`, c);
}

/** "234 with fills, 607 fills." from the same counts, under a figure that already gives the orders. */
export function fillsLine(c: OrderCounts): string {
  return tail(`${int.format(c.withFills)} with fills, ${n(c.fills, 'fill', 'fills')}`, c);
}

const STATUS: Record<string, string> = {
  FILLED: 'Filled', PARTIALLY_FILLED: 'Partly filled', CANCELED: 'Cancelled', CANCELLED: 'Cancelled', EXPIRED: 'Expired',
  EXPIRED_IN_MATCH: 'Expired', REJECTED: 'Rejected', NEW: 'Open', PENDING_CANCEL: 'Open',
};
export function statusLabel(s: string | null): string {
  if (s === null) return 'No stored order';
  return STATUS[s.toUpperCase()] ?? s;
}

const ENDED_UNFILLED = new Set(['CANCELED', 'CANCELLED', 'EXPIRED', 'EXPIRED_IN_MATCH', 'REJECTED']);
/** An order that ended with nothing filled: a final status other than FILLED and no fill (the server's rule in orderSummary). */
export function isUnfilled(r: Pick<OrderRow, 'status' | 'fills'>): boolean {
  return r.status !== null && ENDED_UNFILLED.has(r.status.toUpperCase()) && r.fills === 0;
}
/**
 * The Notional cell. For an order that ended with nothing filled the served notional is what was executed, $0.00: the cell
 * says so ("$0.00 executed") instead of a bare zero that reads like a missing value. Other rows print the served figure.
 */
export function notionalCell(r: Pick<OrderRow, 'status' | 'fills' | 'notionalUsd' | 'feesUsd'>): string {
  // The server sends fees of exactly 0 only when the exchange's own count says nothing was executed (orderLedger.ts); a
  // cancelled order with unknown fees may have been partly filled, so it is not labelled "executed".
  return isUnfilled(r) && r.feesUsd === 0 ? `${formatUsd(r.notionalUsd)} executed` : formatUsd(r.notionalUsd);
}

/** The Fees cell's text: the served fee, or null when the server sent none (the page then says "not computed"). */
export function feesCell(r: Pick<OrderRow, 'feesUsd'>): string | null {
  return r.feesUsd === null ? null : formatUsd(r.feesUsd);
}

/** Why an unfilled order's fee reads $0.00: it had no fill, so it paid no fee. Undefined for every other row. */
export function feesTitle(r: Pick<OrderRow, 'status' | 'fills' | 'feesUsd'>): string | undefined {
  return isUnfilled(r) && r.feesUsd === 0 ? 'No fill, no fee' : undefined;
}

/**
 * The amount the tape's pen circles. For an order that never filled the amount is the modelled cost of the missed fill,
 * not money that left the account (F2), so it says the market moved away.
 */
export function circledLabel(amount: string, r: Pick<OrderRow, 'status' | 'fills'>): string {
  return isUnfilled(r) ? `${amount}, unfilled: market moved away` : amount;
}

/** `YYYY-MM-DD HH:MM:SS` in UTC; "not recorded" for a value that is not a date. */
export function formatUtc(iso: string | null | undefined): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 19).replace('T', ' ') : 'not recorded';
}

/** `path` with the account query (`?userId=demo-x` or '') and extra parameters. */
export function withParams(path: string, query: string, extra: Record<string, string> = {}): string {
  const u = new URLSearchParams(query.replace(/^\?/, ''));
  for (const [k, v] of Object.entries(extra)) u.set(k, v);
  const s = u.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * The ledger's columns shown by default at a screen width (IA v4 step 7). Returns the TanStack visibility state: a column set to false
 * is hidden, an absent one shows. A desktop keeps the columns a reader scans (the cost, the order id, fills, quantity and maker share
 * are one menu away); a phone shows time, symbol, side and cost; up to 360 px only time and cost, and the symbol is printed under
 * the time (OrdersView).
 */
export function defaultOrderColumns(width: number): Record<string, boolean> {
  const base = { orderId: false, fills: false, quantity: false, makerShare: false };
  if (width >= 640) return { ...base, cost: false };
  const phone = { ...base, type: false, status: false, notionalUsd: false, feesUsd: false };
  return width <= 360 ? { ...phone, symbol: false, side: false } : phone;
}

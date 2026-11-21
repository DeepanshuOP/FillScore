/**
 * View model of the orders ledger (design v3 fixes A1, 2026-11-21). Pure. Every row and count comes from GET
 * /api/audit/orders-ledger, which lists every stored order (filled or not) and sums the fills on the server
 * (backend/src/services/orderLedger.ts). This file maps fields to words; it adds nothing up. A value the server sent as
 * null (an unknown fee, an unknown maker flag, an order with no fills) stays null, never zero.
 */
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
}

interface ServerRow {
  key: string; orderId: string; symbol: string; side: string; type: string | null; status: string | null; placedAt: string | null;
  firstFill: string | null; fills: number; quantity: number; notionalUsd: number; feesUsd: number | null; makerShare: number | null;
}

const typeOf = (raw: string | null | undefined): OrderType => {
  const t = (raw ?? '').toUpperCase();
  return t === 'MARKET' ? 'Market' : t === 'LIMIT' ? 'Limit' : 'Not recorded';
};

export function ledgerRows(body: unknown): OrderRow[] | null {
  const b = body as { available?: boolean; orders?: ServerRow[] } | null;
  if (!b || b.available !== true || !Array.isArray(b.orders)) return null;
  return b.orders.map((r) => ({
    key: r.key, orderId: r.orderId ?? '', symbol: r.symbol, side: r.side === 'SELL' ? 'SELL' : 'BUY', type: typeOf(r.type),
    status: r.status ?? null, placedAt: r.placedAt ?? null, firstFill: r.firstFill ?? null, when: r.placedAt ?? r.firstFill ?? '',
    fills: r.fills, quantity: r.quantity, notionalUsd: r.notionalUsd, feesUsd: r.feesUsd ?? null, makerShare: r.makerShare ?? null,
  }));
}

/** The order counts the server sent beside the summary or the ledger (backend orderCounts), or null. */
export function orderCountsOf(body: unknown): OrderCounts | null {
  const c = (body as { available?: boolean; counts?: OrderCounts } | null)?.counts;
  return c && typeof c.orders === 'number' ? c : null;
}

const int = new Intl.NumberFormat('en-US');
const n = (v: number, one: string, many: string) => `${int.format(v)} ${v === 1 ? one : many}`;

/** "245 orders, 234 with fills, 607 fills." from the server counts. */
export function countsLine(c: OrderCounts): string {
  const head = `${n(c.orders, 'order', 'orders')}, ${int.format(c.withFills)} with fills, ${n(c.fills, 'fill', 'fills')}`;
  if (c.unrecorded > 0) return `${head}; ${c.unrecorded === 1 ? '1 group of fills has' : `${int.format(c.unrecorded)} groups of fills have`} no stored order.`;
  return `${head}.`;
}

const STATUS: Record<string, string> = {
  FILLED: 'Filled', PARTIALLY_FILLED: 'Partly filled', CANCELED: 'Cancelled', CANCELLED: 'Cancelled', EXPIRED: 'Expired',
  EXPIRED_IN_MATCH: 'Expired', REJECTED: 'Rejected', NEW: 'Open', PENDING_CANCEL: 'Open',
};
export function statusLabel(s: string | null): string {
  if (s === null) return 'No stored order';
  return STATUS[s.toUpperCase()] ?? s;
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

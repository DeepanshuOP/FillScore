/**
 * View model of the orders table: fills grouped into orders. Pure. Sums come from the stored fills; a fee that one fill
 * does not have makes the order's fee total null (never zero), and an unknown maker flag makes the maker share null.
 */
export interface AuditTrade {
  tradeId?: string;
  orderId?: string | null;
  symbol: string;
  side: 'BUY' | 'SELL' | string;
  orderType?: string | null;
  isMaker?: boolean | null;
  executedAt: string;
  executionPrice?: number;
  quantity: number;
  notionalValue?: number | null;
  notional?: number | null;
  feePaid?: number | null;
}

export type OrderType = 'Market' | 'Limit' | 'Not recorded';

export interface OrderRow {
  key: string;
  /** Empty for a trade without an order id: it has no replay. */
  orderId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: OrderType;
  firstFill: string;
  fills: number;
  quantity: number;
  notionalUsd: number;
  feesUsd: number | null;
  makerShare: number | null;
}

const typeOf = (raw: string | null | undefined): OrderType => {
  const t = (raw ?? '').toUpperCase();
  return t === 'MARKET' ? 'Market' : t === 'LIMIT' ? 'Limit' : 'Not recorded';
};

const notionalOf = (t: AuditTrade): number => t.notionalValue ?? t.notional ?? (t.executionPrice ?? 0) * t.quantity;

export function groupOrders(trades: AuditTrade[]): OrderRow[] {
  const groups = new Map<string, { orderId: string; fills: AuditTrade[] }>();
  for (const t of trades) {
    const orderId = t.orderId ? String(t.orderId) : '';
    const key = orderId ? `${t.symbol}:${orderId}` : String(t.tradeId ?? `${t.symbol}:${t.executedAt}`);
    const g = groups.get(key);
    if (g) g.fills.push(t); else groups.set(key, { orderId, fills: [t] });
  }
  const rows: OrderRow[] = [];
  for (const [key, { orderId, fills }] of groups) {
    const first = fills.reduce((a, b) => (Date.parse(b.executedAt) < Date.parse(a.executedAt) ? b : a));
    const notionalUsd = fills.reduce((s, f) => s + notionalOf(f), 0);
    const makerKnown = fills.every((f) => typeof f.isMaker === 'boolean');
    const makerNotional = fills.reduce((s, f) => s + (f.isMaker === true ? notionalOf(f) : 0), 0);
    const typed = fills.find((f) => typeOf(f.orderType) !== 'Not recorded');
    rows.push({
      key, orderId, symbol: first.symbol, side: first.side === 'SELL' ? 'SELL' : 'BUY',
      type: typed ? typeOf(typed.orderType) : 'Not recorded',
      firstFill: first.executedAt, fills: fills.length,
      quantity: fills.reduce((s, f) => s + f.quantity, 0), notionalUsd,
      feesUsd: fills.every((f) => typeof f.feePaid === 'number') ? fills.reduce((s, f) => s + (f.feePaid as number), 0) : null,
      makerShare: makerKnown && notionalUsd > 0 ? makerNotional / notionalUsd : null,
    });
  }
  return rows.sort((a, b) => Date.parse(b.firstFill) - Date.parse(a.firstFill));
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

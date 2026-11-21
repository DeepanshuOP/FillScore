/**
 * The orders ledger (design v3 fixes A1, 2026-11-21): every stored order, filled or not, with its fills summed on the
 * server, and the counts the dashboard prints. Pure over stored documents (`orders`, `trades`); nothing is estimated.
 * A value that is not known is null, never zero. `orderCounts` is the one source of the order counts: GET
 * /audit/orders-summary (the overview) and GET /audit/orders-ledger (the Orders page) both return it.
 */
export interface LedgerOrderIn { exchange?: string; symbol: string; orderId: string; type?: string | null; side: string; status: string; createdAt: Date | string }
export interface LedgerFillIn {
    exchange?: string; tradeId?: string; symbol: string; orderId?: string | null; side?: string; orderType?: string | null;
    quantity: number; executionPrice?: number; notional?: number | null; feeUsd?: number | null; isMaker?: boolean | null; executedAt: Date | string;
}
export interface OrderCounts { orders: number; withFills: number; fills: number; unrecorded: number }
export interface LedgerRow {
    key: string; orderId: string; symbol: string; side: 'BUY' | 'SELL'; type: string | null; status: string | null;
    placedAt: string | null; firstFill: string | null; lastFill: string | null;
    fills: number; quantity: number; notionalUsd: number; feesUsd: number | null; makerShare: number | null;
}

const keyOf = (x: { exchange?: string; symbol: string; orderId?: string | null }) => `${x.exchange ?? ''}|${x.symbol}|${x.orderId ?? ''}`;
const iso = (d: Date | string) => new Date(d).toISOString();
const notionalOf = (f: LedgerFillIn) => (typeof f.notional === 'number' && Number.isFinite(f.notional) ? f.notional : (f.executionPrice ?? 0) * f.quantity);

/** Fills grouped by order key; a fill without an order id is its own group (keyed by trade id). */
function groupFills(fills: LedgerFillIn[]): Map<string, LedgerFillIn[]> {
    const g = new Map<string, LedgerFillIn[]>();
    for (const f of fills) {
        const k = f.orderId ? keyOf(f) : `trade|${f.symbol}|${f.tradeId ?? iso(f.executedAt)}`;
        const list = g.get(k);
        if (list) list.push(f); else g.set(k, [f]);
    }
    return g;
}

export function orderCounts(orders: LedgerOrderIn[], fills: LedgerFillIn[]): OrderCounts {
    const groups = groupFills(fills);
    const stored = new Set(orders.map(keyOf));
    let withFills = 0;
    for (const k of stored) if (groups.has(k)) withFills++;
    let unrecorded = 0;
    for (const k of groups.keys()) if (!stored.has(k)) unrecorded++;
    return { orders: orders.length, withFills, fills: fills.length, unrecorded };
}

function sums(fs: LedgerFillIn[]) {
    if (fs.length === 0) return { fills: 0, quantity: 0, notionalUsd: 0, feesUsd: null, makerShare: null, firstFill: null, lastFill: null };
    const times = fs.map(f => new Date(f.executedAt).getTime()).sort((a, b) => a - b);
    const notionalUsd = fs.reduce((s, f) => s + notionalOf(f), 0);
    const makerKnown = fs.every(f => typeof f.isMaker === 'boolean');
    const maker = fs.reduce((s, f) => s + (f.isMaker === true ? notionalOf(f) : 0), 0);
    return {
        fills: fs.length,
        quantity: fs.reduce((s, f) => s + f.quantity, 0),
        notionalUsd,
        feesUsd: fs.every(f => typeof f.feeUsd === 'number' && Number.isFinite(f.feeUsd)) ? fs.reduce((s, f) => s + (f.feeUsd as number), 0) : null,
        makerShare: makerKnown && notionalUsd > 0 ? maker / notionalUsd : null,
        firstFill: new Date(times[0]).toISOString(),
        lastFill: new Date(times[times.length - 1]).toISOString(),
    };
}

export function buildOrderLedger(orders: LedgerOrderIn[], fills: LedgerFillIn[]): { counts: OrderCounts; orders: LedgerRow[] } {
    const groups = groupFills(fills);
    const rows: LedgerRow[] = [];
    const stored = new Set<string>();
    for (const o of orders) {
        const k = keyOf(o);
        stored.add(k);
        rows.push({ key: k, orderId: o.orderId, symbol: o.symbol, side: o.side === 'SELL' ? 'SELL' : 'BUY', type: o.type ?? null,
            status: o.status, placedAt: iso(o.createdAt), ...sums(groups.get(k) ?? []) });
    }
    for (const [k, fs] of groups) {
        if (stored.has(k)) continue;
        const f = fs[0];
        rows.push({ key: k, orderId: f.orderId ? String(f.orderId) : '', symbol: f.symbol, side: f.side === 'SELL' ? 'SELL' : 'BUY',
            type: f.orderType ?? null, status: null, placedAt: null, ...sums(fs) });
    }
    const when = (r: LedgerRow) => Date.parse(r.placedAt ?? r.firstFill ?? '') || 0;
    rows.sort((a, b) => when(b) - when(a) || (a.key < b.key ? -1 : 1));
    return { counts: orderCounts(orders, fills), orders: rows };
}

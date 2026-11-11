import { Order, OrderDocument, FINAL_STATUSES } from '../../models/Order';
import { FeeSnapshot, FeeSnapshotDocument, CommissionParts } from '../../models/FeeSnapshot';
import { Trade } from '../../models/Trade';

/**
 * Binance spot orders and commission snapshots (M1 Part B, Tasks 7 and 8). Docs read 2026-11-11:
 *  - GET /api/v3/allOrders: weight 20, signed, symbol required, limit max 1000, `orderId` returns orders with
 *    id >= orderId; startTime/endTime span <= 24 h (not used here). Times in ms.
 *    https://developers.binance.com/docs/binance-spot-api-docs/rest-api/account-endpoints ("All orders")
 *  - GET /api/v3/account/commission: weight 20, symbol required; standardCommission / taxCommission /
 *    specialCommission {maker, taker, buyer, seller}, discount {enabledForAccount, enabledForSymbol,
 *    discountAsset, discount}. Same page, "Query Commission Rates".
 *  - Order status enum: https://developers.binance.com/docs/binance-spot-api-docs/enums
 */
export const ALL_ORDERS_LIMIT = 1000;
export const ALL_ORDERS_WEIGHT = 20;
export const COMMISSION_WEIGHT = 20;
export const SNAPSHOT_TTL_MS = 24 * 3600_000;
export const LIMIT_TYPES = new Set(['LIMIT', 'LIMIT_MAKER', 'STOP_LOSS_LIMIT', 'TAKE_PROFIT_LIMIT']);

export type SignedCall = <T>(path: string, params: Record<string, string | number>, weight: number) => Promise<T>;

export interface BinanceRawOrder {
    symbol: string; orderId: number; clientOrderId?: string; price: string; origQty: string; executedQty: string;
    cummulativeQuoteQty?: string; status: string; timeInForce?: string; type: string; side: 'BUY' | 'SELL';
    time: number; updateTime: number;
}

export interface BinanceRawCommission {
    symbol: string;
    standardCommission: Record<keyof CommissionParts, string>;
    taxCommission: Record<keyof CommissionParts, string>;
    specialCommission?: Record<keyof CommissionParts, string>;
    discount?: { enabledForAccount: boolean; enabledForSymbol: boolean; discountAsset: string; discount: string };
}

const num = (s: string | undefined): number | undefined => {
    if (s === undefined) return undefined;
    const v = Number(s);
    return Number.isFinite(v) ? v : undefined;
};

/** Pure: resting time = first fill - creation (ms) for limit-type orders that filled; null otherwise. */
export function restingMs(type: string, createdAt: number, firstFillAt: number | null): number | null {
    if (!LIMIT_TYPES.has(type) || firstFillAt === null) return null;
    const d = firstFillAt - createdAt;
    return d >= 0 ? d : null;   // a fill before creation is a data error, not a resting time
}

/** Pure: Binance order -> stored fields (restingMs added by the caller). */
export function mapBinanceOrder(raw: BinanceRawOrder, accountId: string): Omit<OrderDocument, 'restingMs'> {
    const price = num(raw.price);
    const cq = num(raw.cummulativeQuoteQty);
    return {
        accountId, exchange: 'binance', symbol: raw.symbol, orderId: String(raw.orderId),
        ...(raw.clientOrderId ? { clientOrderId: raw.clientOrderId } : {}),
        side: raw.side, type: raw.type, ...(raw.timeInForce ? { timeInForce: raw.timeInForce } : {}),
        // A MARKET order reports price "0.00000000": no limit price, so it is left out.
        ...(price && price > 0 ? { price } : {}),
        origQty: num(raw.origQty) ?? 0, executedQty: num(raw.executedQty) ?? 0,
        // The docs say some historical orders report a negative cummulativeQuoteQty: data unavailable.
        ...(cq !== undefined && cq >= 0 ? { cummulativeQuoteQty: cq } : {}),
        status: raw.status, createdAt: new Date(raw.time), updatedAt: new Date(raw.updateTime), dataSource: 'real-user',
    };
}

const parts = (p: Record<string, string> | undefined): CommissionParts => ({
    maker: num(p?.maker) ?? 0, taker: num(p?.taker) ?? 0, buyer: num(p?.buyer) ?? 0, seller: num(p?.seller) ?? 0,
});

/** Pure: Binance commission response -> snapshot. A missing specialCommission block is all zeros. */
export function mapBinanceCommission(raw: BinanceRawCommission, accountId: string, now: number): FeeSnapshotDocument {
    if (!raw?.standardCommission || !raw?.taxCommission) throw new Error('commission_response_shape');
    return {
        accountId, exchange: 'binance', symbol: raw.symbol,
        standard: parts(raw.standardCommission), tax: parts(raw.taxCommission), special: parts(raw.specialCommission),
        ...(raw.discount ? { discount: {
            enabledForAccount: !!raw.discount.enabledForAccount, enabledForSymbol: !!raw.discount.enabledForSymbol,
            asset: raw.discount.discountAsset, rate: num(raw.discount.discount) ?? 1,
        } } : {}),
        source: 'account', fetchedAt: new Date(now),
    };
}

/** First orderId to request: the oldest order a stored trade points at that is not stored yet, or the oldest
 *  stored order that can still change, or the next id after the newest stored order. Null: nothing to fetch. */
async function startOrderId(accountId: string, symbol: string): Promise<number | null> {
    const tradeIds = (await Trade.distinct('orderId', { accountId, exchange: 'binance', symbol })).map(Number).filter(Number.isFinite);
    if (tradeIds.length === 0) return null;
    const stored = await Order.find({ accountId, exchange: 'binance', symbol }, { orderId: 1, status: 1 }).lean();
    if (stored.length === 0) return Math.min(...tradeIds);
    const have = new Set(stored.map(o => Number(o.orderId)));
    const candidates = [Math.max(...have) + 1];
    for (const id of tradeIds) if (!have.has(id)) candidates.push(id);
    for (const o of stored) if (!FINAL_STATUSES.has(o.status)) candidates.push(Number(o.orderId));
    return Math.min(...candidates);
}

/** Fetch and upsert every order from the start id on. Account-scoped writes only. */
export async function syncBinanceOrders(call: SignedCall, accountId: string, symbol: string): Promise<{ upserted: number; requests: number }> {
    let from = await startOrderId(accountId, symbol);
    let upserted = 0, requests = 0;
    while (from !== null) {
        const page = await call<BinanceRawOrder[]>('/api/v3/allOrders', { symbol, orderId: from, limit: ALL_ORDERS_LIMIT }, ALL_ORDERS_WEIGHT);
        requests++;
        for (const raw of page) {
            const o = mapBinanceOrder(raw, accountId);
            const first = await Trade.findOne({ accountId, exchange: 'binance', symbol, orderId: o.orderId }, { executedAt: 1 }, { sort: { executedAt: 1 } }).lean();
            const doc = { ...o, restingMs: restingMs(o.type, raw.time, first ? new Date(first.executedAt).getTime() : null) };
            const { accountId: _a, exchange: _e, symbol: _s, orderId: _o, dataSource, ...mutable } = doc;
            await Order.updateOne(
                { accountId, exchange: 'binance', symbol, orderId: o.orderId },
                { $set: mutable, $setOnInsert: { accountId, exchange: 'binance', symbol, orderId: o.orderId, dataSource } },
                { upsert: true },
            );
            upserted++;
        }
        from = page.length < ALL_ORDERS_LIMIT ? null : Math.max(...page.map(p => p.orderId)) + 1;
    }
    return { upserted, requests };
}

/** At most one commission fetch per (account, symbol) per 24 h. Returns true when a snapshot was fetched. */
export async function syncBinanceCommission(call: SignedCall, accountId: string, symbol: string, now: number): Promise<boolean> {
    const recent = await FeeSnapshot.findOne({ accountId, exchange: 'binance', symbol, fetchedAt: { $gt: new Date(now - SNAPSHOT_TTL_MS) } }).lean();
    if (recent) return false;
    const raw = await call<BinanceRawCommission>('/api/v3/account/commission', { symbol }, COMMISSION_WEIGHT);
    await FeeSnapshot.create(mapBinanceCommission(raw, accountId, now));
    return true;
}

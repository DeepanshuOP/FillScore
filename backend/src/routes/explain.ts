/**
 * Explain and act (M4): the exception queue with review states, the replay of one order, noise-aware rankings and the
 * matched venue comparison. Everything is read from stored order measurements, orders and fills; the only thing written is
 * the review state of an order, per account (demo accounts are read-only: resolveAccount refuses any change on one).
 * Past tense, no advice, no cause: the findings are fixed templates (services/exceptionQueue.ts).
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { resolveAccount } from '../middleware/resolveAccount';
import { parseOrReject } from '../validation/schemas';
import { Order } from '../models/Order';
import { OrderMeasurement } from '../models/OrderMeasurement';
import { Trade } from '../models/Trade';
import { demoPrintsFor } from '../services/demoPrints';
import { ExceptionReview, REVIEW_STATES } from '../models/ExceptionReview';
import { buildExceptionQueue, ExceptionOrder } from '../services/exceptionQueue';
import { buildOrderReplay } from '../services/orderReplay';
import { rankWithNoise } from '../services/rankWithNoise';
import { matchedVenueComparison } from '../services/venueComparison';

export const explainRouter = Router();

const symbolSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/);
const reviewBodySchema = z.object({ state: z.enum(REVIEW_STATES), symbol: symbolSchema.optional() });
const symbolQuerySchema = z.object({ symbol: symbolSchema.optional() });
const queueQuerySchema = z.object({ includeDismissed: z.enum(['0', '1']).optional() });
const rankQuerySchema = z.object({ by: z.enum(['symbol', 'hour']) });

const keyOf = (symbol: string, orderId: string) => `${symbol}\u0000${orderId}`;
const fail = (res: Response, err: unknown, what: string) => {
    console.error(`${what} error:`, (err as Error)?.name);
    return res.status(500).json({ error: 'Internal Server Error' });
};

explainRouter.get('/exceptions', resolveAccount, async (req: Request, res: Response) => {
    try {
        const q = parseOrReject(queueQuerySchema, req.query, res);
        if (!q) return;
        const accountId = req.accountId!;
        const [ms, orders, reviews] = await Promise.all([
            OrderMeasurement.find({ accountId }, { symbol: 1, orderId: 1, shortfall: 1, expectedCost: 1 }).lean(),   // no marketDataRefs: they are large
            Order.find({ accountId }, { symbol: 1, orderId: 1, type: 1, status: 1 }).lean(),
            ExceptionReview.find({ accountId }).lean(),
        ]);
        const byOrder = new Map(orders.map(o => [keyOf(o.symbol, o.orderId), o]));
        const rows: ExceptionOrder[] = ms.map(m => {
            const o = byOrder.get(keyOf(m.symbol, m.orderId));
            return { orderId: m.orderId, symbol: m.symbol, type: o?.type ?? null, status: o?.status ?? null,
                shortfall: (m.shortfall as any) ?? null, expectedCost: (m.expectedCost as any) ?? null };
        });
        const queue = buildExceptionQueue(rows);
        const state = new Map(reviews.map(r => [keyOf(r.symbol, r.orderId), r.state]));
        const withState = queue.items.map(i => ({ ...i, state: state.get(keyOf(i.symbol, i.orderId)) ?? 'open' }));
        const counts = { open: 0, reviewed: 0, dismissed: 0 };
        for (const i of withState) counts[i.state as keyof typeof counts]++;
        const items = q.includeDismissed === '1' ? withState : withState.filter(i => i.state !== 'dismissed');
        return res.status(200).json({ ...queue, items, reviewCounts: counts });
    } catch (err) {
        return fail(res, err, 'GET /exceptions');
    }
});

explainRouter.patch('/exceptions/:orderId', resolveAccount, async (req: Request, res: Response) => {
    try {
        const body = parseOrReject(reviewBodySchema, req.body, res);
        if (!body) return;
        const query = parseOrReject(symbolQuerySchema, req.query, res);
        if (!query) return;
        const accountId = req.accountId!;
        const orderId = String(req.params.orderId);
        const symbol = body.symbol ?? query.symbol;
        const found = await OrderMeasurement.find({ accountId, orderId, ...(symbol ? { symbol } : {}) }, { symbol: 1, exchange: 1 }).lean();
        if (found.length === 0) return res.status(404).json({ error: 'order_not_found' });
        if (found.length > 1) return res.status(409).json({ error: 'ambiguous_order', message: 'This order id exists on more than one symbol; send the symbol.' });
        const { symbol: sym, exchange } = found[0];
        const updatedAt = new Date();
        await ExceptionReview.updateOne({ accountId, exchange, symbol: sym, orderId }, { $set: { state: body.state, updatedAt } }, { upsert: true });
        return res.status(200).json({ orderId, symbol: sym, state: body.state, updatedAt: updatedAt.toISOString() });
    } catch (err) {
        return fail(res, err, 'PATCH /exceptions');
    }
});

explainRouter.get('/orders/:orderId/replay', resolveAccount, async (req: Request, res: Response) => {
    try {
        const query = parseOrReject(symbolQuerySchema, req.query, res);
        if (!query) return;
        const accountId = req.accountId!;
        const orderId = String(req.params.orderId);
        const filter = { accountId, orderId, ...(query.symbol ? { symbol: query.symbol } : {}) };
        const orders = await Order.find(filter).lean();
        if (orders.length === 0) return res.status(404).json({ error: 'order_not_found' });
        if (orders.length > 1) return res.status(409).json({ error: 'ambiguous_order', message: 'This order id exists on more than one symbol; send the symbol.' });
        const o = orders[0];
        const [fills, m] = await Promise.all([
            Trade.find({ accountId, orderId, symbol: o.symbol }).lean(),
            OrderMeasurement.findOne({ accountId, orderId, symbol: o.symbol }).lean(),
        ]);
        const replay = buildOrderReplay({
            order: { orderId: o.orderId, symbol: o.symbol, exchange: o.exchange, type: o.type ?? null, side: o.side, origQty: o.origQty, executedQty: o.executedQty,
                status: o.status, restingMs: o.restingMs ?? null, createdAt: new Date(o.createdAt), updatedAt: new Date(o.updatedAt) },
            fills: fills.map(f => ({ tradeId: f.tradeId, executionPrice: f.executionPrice, quantity: f.quantity, executedAt: new Date(f.executedAt),
                feeUsd: (f as any).feeUsd ?? null, isMaker: (f as any).isMaker ?? null })),
            measurement: m ? { version: m.version, arrivalMid: m.arrivalMid, endMid: m.endMid, endBasis: m.endBasis, unmeasuredReason: m.unmeasuredReason,
                shortfall: (m.shortfall as any) ?? null, expectedCost: (m.expectedCost as any) ?? null, marketDataRefs: (m.marketDataRefs as any[]) ?? [] } : null,
        });
        // Demo orders only: the capped window of public prints cut offline from the checksummed daily files. A real account's
        // payload is unchanged (no `prints` key): no print of a real account is stored where the server can read it.
        const prints = demoPrintsFor(accountId, orderId, o.symbol);
        return res.status(200).json(prints ? { ...replay, prints } : replay);
    } catch (err) {
        return fail(res, err, 'GET /orders/:orderId/replay');
    }
});

explainRouter.get('/rankings', resolveAccount, async (req: Request, res: Response) => {
    try {
        const q = parseOrReject(rankQuerySchema, req.query, res);
        if (!q) return;
        const ms = await OrderMeasurement.find({ accountId: req.accountId! }, { symbol: 1, arrivalMs: 1, shortfall: 1 }).lean();
        const groups = new Map<string, number[]>();
        for (const m of ms) {
            const c = (m.shortfall as any)?.executionBps;
            if (typeof c !== 'number' || !Number.isFinite(c)) continue;
            const key = q.by === 'symbol' ? m.symbol : `${String(new Date(m.arrivalMs).getUTCHours()).padStart(2, '0')}:00 UTC`;
            const arr = groups.get(key) ?? [];
            arr.push(c);
            groups.set(key, arr);
        }
        const ranked = rankWithNoise([...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, values]) => ({ key, values })));
        return res.status(200).json({ by: q.by, metric: 'execution cost, bps of intended notional, over measured orders', level: 0.9, minOrders: 20, groups: ranked });
    } catch (err) {
        return fail(res, err, 'GET /rankings');
    }
});

explainRouter.get('/venue-comparison', resolveAccount, async (req: Request, res: Response) => {
    try {
        const trades = await Trade.find({ accountId: req.accountId! }, { exchange: 1, symbol: 1, notional: 1, 'measurement.effHalfBps': 1 }).lean();
        const fills = trades.map(t => ({ exchange: t.exchange, symbol: t.symbol, notional: (t as any).notional ?? 0,
            costBps: typeof (t as any).measurement?.effHalfBps === 'number' ? (t as any).measurement.effHalfBps : null }));
        return res.status(200).json({
            metric: 'effective half-spread of each fill against the mid before it, bps; the account\'s own past fills, matched by symbol and size bucket; maker and taker fills are pooled',
            ...matchedVenueComparison(fills),
        });
    } catch (err) {
        return fail(res, err, 'GET /venue-comparison');
    }
});

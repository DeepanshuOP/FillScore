import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { loadEnv } from '../../config/env';
import { Order } from '../../models/Order';
import { FeeSnapshot } from '../../models/FeeSnapshot';
import { Trade } from '../../models/Trade';
import {
    mapBinanceOrder, mapBinanceCommission, restingMs, syncBinanceOrders, syncBinanceCommission,
    BinanceRawOrder, SignedCall, ALL_ORDERS_LIMIT,
} from '../orders/binanceOrders';

loadEnv();

const A = 'orders-acct-a';
const B = 'orders-acct-b';
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

// Shape from the "All orders" response example, Binance spot docs (account-endpoints), read 2026-11-11.
const rawOrder = (orderId: number, o: Partial<BinanceRawOrder> = {}): BinanceRawOrder => ({
    symbol: 'BTCUSDT', orderId, clientOrderId: `c${orderId}`, price: '50000.00000000', origQty: '2.00000000',
    executedQty: '1.50000000', cummulativeQuoteQty: '75000.00000000', status: 'CANCELED', timeInForce: 'GTC',
    type: 'LIMIT', side: 'BUY', time: T0 + orderId * 1000, updateTime: T0 + orderId * 1000 + 60_000, ...o,
});

const trade = (accountId: string, tradeId: number, orderId: number, executedAt: number) => ({
    userId: accountId, accountId, dataSource: 'real-user', exchange: 'binance', symbol: 'BTCUSDT',
    tradeId: String(tradeId), orderId: String(orderId), side: 'BUY', orderType: 'LIMIT', isMaker: true,
    executionPrice: 50000, quantity: 1, notional: 50000, fee: 0, feeAsset: 'USDT', executedAt: new Date(executedAt),
});

/** A fake signed call that serves allOrders from a list (orderId >= from, ascending, limit) and logs requests. */
function fakeCall(orders: BinanceRawOrder[], log: Array<{ path: string; params: Record<string, string | number> }>, commission?: unknown): SignedCall {
    return (async (path: string, params: Record<string, string | number>) => {
        log.push({ path, params });
        if (path === '/api/v3/allOrders') {
            return orders.filter(o => o.orderId >= Number(params.orderId)).sort((x, y) => x.orderId - y.orderId).slice(0, Number(params.limit));
        }
        if (path === '/api/v3/account/commission') {
            if (commission instanceof Error) throw commission;
            return commission;
        }
        throw new Error('unexpected ' + path);
    }) as SignedCall;
}

describe('binance orders: pure mapping', () => {
    it('drops the zero price of a market order and a negative cummulativeQuoteQty', () => {
        const o = mapBinanceOrder(rawOrder(1, { type: 'MARKET', price: '0.00000000', cummulativeQuoteQty: '-1.00000000' }), A);
        expect(o.price).toBeUndefined();
        expect(o.cummulativeQuoteQty).toBeUndefined();
        expect(o.orderId).toBe('1');
        expect(o.origQty).toBe(2);
        expect(o.executedQty).toBe(1.5);
        expect(o.createdAt.getTime()).toBe(T0 + 1000);
        expect(o.dataSource).toBe('real-user');
    });

    it('resting time is first fill minus creation, for limit-type orders that filled only', () => {
        // created 1000, first fill 4000 -> 3000 ms
        expect(restingMs('LIMIT', 1000, 4000)).toBe(3000);
        expect(restingMs('LIMIT_MAKER', 1000, 1000)).toBe(0);
        expect(restingMs('MARKET', 1000, 4000)).toBeNull();
        expect(restingMs('LIMIT', 1000, null)).toBeNull();
        expect(restingMs('LIMIT', 5000, 4000)).toBeNull();      // fill before creation: data error
    });

    it('maps the commission response; special defaults to zero; a bad shape throws', () => {
        const s = mapBinanceCommission({
            symbol: 'BTCUSDT',
            standardCommission: { maker: '0.00000010', taker: '0.00000020', buyer: '0.00000030', seller: '0.00000040' },
            taxCommission: { maker: '0.00000112', taker: '0.00000114', buyer: '0.00000118', seller: '0.00000116' },
            discount: { enabledForAccount: true, enabledForSymbol: true, discountAsset: 'BNB', discount: '0.75000000' },
        }, A, T0);
        expect(s.standard).toEqual({ maker: 1e-7, taker: 2e-7, buyer: 3e-7, seller: 4e-7 });
        expect(s.special).toEqual({ maker: 0, taker: 0, buyer: 0, seller: 0 });
        expect(s.discount).toEqual({ enabledForAccount: true, enabledForSymbol: true, asset: 'BNB', rate: 0.75 });
        expect(() => mapBinanceCommission({ symbol: 'X' } as any, A, T0)).toThrow('commission_response_shape');
    });
});

describe('binance orders: sync', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    afterEach(async () => {
        await Promise.all([Order.deleteMany({ accountId: { $in: [A, B] } }), Trade.deleteMany({ accountId: { $in: [A, B] } }), FeeSnapshot.deleteMany({ accountId: { $in: [A, B] } })]);
    });

    it('starts at the oldest order a stored trade points at, keeps unfilled orders after it, and sets restingMs', async () => {
        // trades point at orders 5 and 7; order 6 never filled. Order 5 created T0+5000, first fill T0+9000.
        await Trade.create([trade(A, 1, 5, T0 + 9000), trade(A, 2, 7, T0 + 7000 + 500)]);
        const log: any[] = [];
        const orders = [rawOrder(4), rawOrder(5), rawOrder(6, { executedQty: '0.00000000' }), rawOrder(7, { type: 'MARKET', price: '0' })];
        const r = await syncBinanceOrders(fakeCall(orders, log), A, 'BTCUSDT');
        expect(log).toHaveLength(1);
        expect(log[0].params.orderId).toBe(5);
        expect(r.upserted).toBe(3);
        const stored = await Order.find({ accountId: A }).sort({ orderId: 1 }).lean();
        expect(stored.map(o => o.orderId)).toEqual(['5', '6', '7']);
        expect(stored[0].restingMs).toBe(4000);        // 9000 - 5000
        expect(stored[1].restingMs).toBeNull();        // unfilled
        expect(stored[2].restingMs).toBeNull();        // market
    });

    it('is idempotent and refreshes an order that was still open', async () => {
        await Trade.create([trade(A, 1, 5, T0 + 9000)]);
        await syncBinanceOrders(fakeCall([rawOrder(5, { status: 'PARTIALLY_FILLED' })], []), A, 'BTCUSDT');
        const log: any[] = [];
        await syncBinanceOrders(fakeCall([rawOrder(5, { status: 'CANCELED' })], log), A, 'BTCUSDT');
        expect(log[0].params.orderId).toBe(5);          // the open order is fetched again
        const all = await Order.find({ accountId: A }).lean();
        expect(all).toHaveLength(1);
        expect(all[0].status).toBe('CANCELED');
        const log2: any[] = [];
        await syncBinanceOrders(fakeCall([rawOrder(5, { status: 'CANCELED' })], log2), A, 'BTCUSDT');
        expect(log2[0].params.orderId).toBe(6);         // everything final: resume after the newest stored order
    });

    it(`pages past ${ALL_ORDERS_LIMIT} orders by orderId without gaps`, async () => {
        await Trade.create([trade(A, 1, 1, T0 + 1500)]);
        const orders = Array.from({ length: ALL_ORDERS_LIMIT + 1 }, (_, i) => rawOrder(i + 1));
        const log: any[] = [];
        const r = await syncBinanceOrders(fakeCall(orders, log), A, 'BTCUSDT');
        expect(log.map(l => l.params.orderId)).toEqual([1, ALL_ORDERS_LIMIT + 1]);
        expect(r.upserted).toBe(ALL_ORDERS_LIMIT + 1);
        expect(await Order.countDocuments({ accountId: A })).toBe(ALL_ORDERS_LIMIT + 1);
    });

    it('fetches nothing for a symbol with no stored trades, and never writes another account', async () => {
        await Trade.create([trade(B, 1, 5, T0 + 9000)]);
        const log: any[] = [];
        expect((await syncBinanceOrders(fakeCall([rawOrder(5)], log), A, 'BTCUSDT')).upserted).toBe(0);
        expect(log).toHaveLength(0);
        await syncBinanceOrders(fakeCall([rawOrder(5)], []), B, 'BTCUSDT');
        expect(await Order.countDocuments({ accountId: A })).toBe(0);
        expect(await Order.countDocuments({ accountId: B })).toBe(1);
    });

    it('fetches commission at most once per 24 h per symbol', async () => {
        const body = {
            symbol: 'BTCUSDT',
            standardCommission: { maker: '0.001', taker: '0.001', buyer: '0', seller: '0' },
            taxCommission: { maker: '0', taker: '0', buyer: '0', seller: '0' },
        };
        const log: any[] = [];
        expect(await syncBinanceCommission(fakeCall([], log, body), A, 'BTCUSDT', T0)).toBe(true);
        expect(await syncBinanceCommission(fakeCall([], log, body), A, 'BTCUSDT', T0 + 23 * 3600_000)).toBe(false);
        expect(await syncBinanceCommission(fakeCall([], log, body), A, 'BTCUSDT', T0 + 25 * 3600_000)).toBe(true);
        expect(log).toHaveLength(2);
        expect(await FeeSnapshot.countDocuments({ accountId: A })).toBe(2);
    });

    it('history sync stores orders; a failing commission endpoint is reported and the trades are kept', async () => {
        const { BinanceHistorySync } = await import('../BinanceHistorySync');
        const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
        const NOW = T0 + 86_400_000;
        const myTrade = { symbol: 'BTCUSDT', id: 11, orderId: 5, price: '50000', qty: '1', quoteQty: '50000', commission: '0.1', commissionAsset: 'USDT', time: T0 + 9000, isBuyer: true, isMaker: true, isBestMatch: true };
        const old = global.fetch;
        global.fetch = (async (url: string) => {
            const u = new URL(url);
            if (u.pathname === '/api/v3/exchangeInfo') return json({ symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true }] });
            if (u.pathname === '/api/v3/account') return json({ balances: [] });
            if (u.pathname === '/api/v3/myTrades') return json(u.searchParams.get('fromId') ? [] : [myTrade]);
            if (u.pathname === '/api/v3/allOrders') return json([rawOrder(5)]);
            if (u.pathname === '/api/v3/account/commission') return json({ msg: 'bad' }, 400);
            throw new Error('unexpected ' + u.pathname);
        }) as any;
        try {
            const r = await new BinanceHistorySync('k', 's', A, { lookbackDays: 30, extraSymbols: ['BTCUSDT'], sleep: async () => {}, now: () => NOW }).run();
            expect(r.inserted).toBe(1);
            expect(r.partial).toBe(false);
            expect(r.ordersUpserted).toBe(1);
            expect(r.feeSnapshots).toBe(0);
            expect(r.auxFailures).toEqual([{ symbol: 'BTCUSDT', what: 'commission', reason: 'binance_http_400' }]);
            expect(await Trade.countDocuments({ accountId: A })).toBe(1);
            expect((await Order.findOne({ accountId: A }).lean())!.restingMs).toBe(4000);   // 9000 - 5000
        } finally {
            global.fetch = old;
        }
    });

    it('a failed commission fetch stores nothing (no assumed rate)', async () => {
        await expect(syncBinanceCommission(fakeCall([], [], new Error('binance_http_400')), A, 'BTCUSDT', T0)).rejects.toThrow('binance_http_400');
        expect(await FeeSnapshot.countDocuments({ accountId: A })).toBe(0);
    });
});

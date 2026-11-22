import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { createApp } from '../../app';
import { Trade } from '../../models/Trade';
import { Order } from '../../models/Order';
import { OrderMeasurement } from '../../models/OrderMeasurement';
import { User } from '../../models/User';
import { issueTokenPair } from '../../services/authService';
import { loadEnv } from '../../config/env';

// Step 5: the replay payload carries the public prints for a DEMO order only. A real account that happens to hold an
// order with the same id gets the payload it always got (no `prints` key at all).
loadEnv();
const app = createApp();

const ORDER = 'ord-moderate-BNBUSDT-115583';     // window and rows: services/__tests__/demoPrints.test.ts
const SYMBOL = 'BNBUSDT';
const SHA = '7648fc3ad6ab6a7beb016adffd1afe89ee5579ecce3c8aec7d05fe10e3b58f4c';

const seed = (accountId: string, dataSource: string) => ({
    order: { accountId, exchange: 'binance', symbol: SYMBOL, orderId: ORDER, side: 'BUY', type: 'MARKET', origQty: 0.15, executedQty: 0.15, status: 'FILLED',
        restingMs: 0, createdAt: new Date(1704308512910), updatedAt: new Date(1704308513833), dataSource },
    trade: { accountId, userId: accountId, dataSource, exchange: 'binance', symbol: SYMBOL, tradeId: `t-${accountId}`, orderId: ORDER, side: 'BUY', orderType: 'MARKET',
        isMaker: false, quantity: 0.15, executionPrice: 313.4, notional: 47, fee: 0.04, feeUsd: 0.04, feeAsset: 'USDT', executedAt: new Date(1704308513833) },
    meas: { accountId, exchange: 'binance', symbol: SYMBOL, orderId: ORDER, version: '1.0.0', side: 1, tradeIds: [`t-${accountId}`], arrivalMs: 1704308512910, endMs: null,
        endBasis: 'filled', arrivalMid: 313.25, endMid: null, unmeasuredReason: null, measuredAt: new Date('2024-03-01'),
        shortfall: { executionBps: 4, spreadBps: 2, impactTimingBps: 2, opportunityBps: 0, feesBps: 10, totalBps: 14, intendedNotional: 47, fillRatio: 1 },
        marketDataRefs: [{ source: 'data.binance.vision', dataset: 'spot/daily/aggTrades', symbol: SYMBOL, date: '2024-01-03', window: null, sha256: SHA }] },
});

describe('replay of an order: prints for demo accounts only', () => {
    let token = '';
    let realId = '';
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        const u = await User.create({ email: 'replay-prints@example.com', emailVerified: true });
        realId = u._id.toString();
        token = (await issueTokenPair(realId)).accessToken;
        for (const [id, src] of [['demo-moderate', 'synthetic-demo'], [realId, 'real-user']] as const) {
            const s = seed(id, src);
            await Order.collection.insertOne(s.order as any);
            await Trade.collection.insertOne(s.trade as any);
            await OrderMeasurement.collection.insertOne(s.meas as any);
        }
    });
    afterAll(async () => {
        for (const id of ['demo-moderate', realId]) {
            await Order.collection.deleteMany({ accountId: id, orderId: ORDER });
            await Trade.collection.deleteMany({ accountId: id, orderId: ORDER });
            await OrderMeasurement.collection.deleteMany({ accountId: id, orderId: ORDER });
        }
        await User.deleteOne({ _id: realId });
        await mongoose.disconnect();
    });

    it('a demo order carries its window: 37 prints, the arrival and the daily file it came from', async () => {
        const res = await request(app).get(`/api/audit/orders/${ORDER}/replay?symbol=${SYMBOL}&userId=demo-moderate`);
        expect(res.status).toBe(200);
        expect(res.body.prints.total).toBe(37);
        expect(res.body.prints.prints).toHaveLength(37);
        expect(res.body.prints.arrivalMs).toBe(1704308512910);
        expect(res.body.prints.files[0]).toEqual({ symbol: SYMBOL, date: '2024-01-03', sha256: SHA });
        expect(res.body.prints.prints[0]).toEqual([516017107, 1704308507949, 313.3, 0.031, 0]);
        expect(res.body.fills).toHaveLength(1);                         // the rest of the payload is as before
        expect(res.body.sources[0].sha256).toBe(SHA);
    });

    it('a real account holding an order with the same id gets no `prints` key', async () => {
        const res = await request(app).get(`/api/audit/orders/${ORDER}/replay?symbol=${SYMBOL}`).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect('prints' in res.body).toBe(false);
        expect(res.body.fills).toHaveLength(1);
    });

    it('a demo order that has no window (not in the cut) has no `prints` key either', async () => {
        await Order.collection.insertOne({ ...seed('demo-moderate', 'synthetic-demo').order, orderId: 'ord-demo-no-window' } as any);
        try {
            const res = await request(app).get(`/api/audit/orders/ord-demo-no-window/replay?symbol=${SYMBOL}&userId=demo-moderate`);
            expect(res.status).toBe(200);
            expect('prints' in res.body).toBe(false);
        } finally {
            await Order.collection.deleteMany({ accountId: 'demo-moderate', orderId: 'ord-demo-no-window' });
        }
    });
});

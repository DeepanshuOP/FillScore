import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mongoose from 'mongoose';
import axios from 'axios';
import { loadEnv } from '../config/env';
import { Trade } from '../models/Trade';
import { MarketCache } from '../models/MarketCache';
import { MarketDataService } from './MarketDataService';

loadEnv();

// Binance klines are the external boundary. One kline: high 101, low 99.
// mid = (101 + 99) / 2 = 100; spread = (101 - 99) / 100 * 10000 * 0.15 = 200 * 0.15 = 30 bps.
const KLINE = [0, '100', '101', '99', '100', '10', 0, '0', 0, '0', '0', '0'];

const base = (over: Record<string, unknown>) => ({
    exchange: 'binance', symbol: 'BTCUSDT', orderId: 'o', side: 'BUY', orderType: 'MARKET', isMaker: false,
    executionPrice: 100, quantity: 1, notional: 100, fee: 0.1, feeAsset: 'USDT',
    executedAt: new Date('2026-01-05T09:00:00Z'), ...over,
});

describe('MarketDataService repair path: spreadBps null/non-number (4R-0c B2)', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        vi.spyOn(axios, 'get').mockResolvedValue({ data: [KLINE] } as any);
    });
    afterAll(async () => {
        await Trade.deleteMany({ userId: { $in: ['reenrich-real', 'demo-reenrich-frozen'] } });
        await MarketCache.deleteMany({ key: /^BTCUSDT_/ });
        vi.restoreAllMocks();
    });

    it('real-user trade with spreadBps null and arrivalPriceProxy present is re-enriched to a number', async () => {
        const t = await Trade.create(base({ userId: 'reenrich-real', accountId: 'reenrich-real', dataSource: 'real-user', tradeId: 'r1', arrivalPriceProxy: 123, spreadBps: null }));
        const out = await new MarketDataService().enrichAllPendingTrades('reenrich-real');
        expect(out.enriched).toBe(1);
        const after: any = await Trade.findById(t._id).lean();
        expect(after.spreadBps).toBeCloseTo(30, 9);
        expect(after.arrivalPriceProxy).toBe(123); // repair recomputes spread only
    });

    it('demo account trade with null spreadBps is NOT re-enriched (frozen v1)', async () => {
        const t = await Trade.create(base({ userId: 'demo-reenrich-frozen', accountId: 'demo-reenrich-frozen', dataSource: 'synthetic-demo', tradeId: 'd1', arrivalPriceProxy: 123, spreadBps: null }));
        const out = await new MarketDataService().enrichAllPendingTrades('demo-reenrich-frozen');
        expect(out.enriched).toBe(0);
        const after: any = await Trade.findById(t._id).lean();
        expect(after.spreadBps).toBeNull();
    });
});

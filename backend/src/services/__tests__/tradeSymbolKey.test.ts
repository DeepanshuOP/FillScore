import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { BinanceHistorySync } from '../BinanceHistorySync';
import { Trade } from '../../models/Trade';
import { loadEnv } from '../../config/env';

loadEnv();

// Binance spot trade ids are per symbol: id 7 on BTCUSDT and id 7 on ETHUSDT are different trades.
const UID = 'real-symkey-1';
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const DAY = 86_400_000;
const INFO = {
    rateLimits: [{ rateLimitType: 'REQUEST_WEIGHT', interval: 'MINUTE', intervalNum: 1, limit: 6000 }],
    symbols: ['BTCUSDT', 'ETHUSDT'].map(s => ({ symbol: s, baseAsset: s.slice(0, -4), quoteAsset: 'USDT', status: 'TRADING', isSpotTradingAllowed: true })),
};
const rawFor = (symbol: string, id: number, time: number) => ({
    symbol, id, orderId: id, price: '100', qty: '1', quoteQty: '100', commission: '0.1',
    commissionAsset: 'USDT', time, isBuyer: true, isMaker: false, isBestMatch: true,
});
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });

describe('Trade key includes the symbol', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await Trade.syncIndexes(); });
    beforeEach(() => {
        global.fetch = vi.fn(async (url: string) => {
            const u = new URL(url);
            if (u.pathname === '/api/v3/exchangeInfo') return json(INFO);
            if (u.pathname === '/api/v3/account') return json({ balances: [] });
            const sym = u.searchParams.get('symbol')!;
            return json([rawFor(sym, 7, NOW - DAY)]); // same id 7 on both symbols
        }) as any;
    });
    afterEach(async () => { await Trade.deleteMany({ userId: UID }); });

    const run = () => new BinanceHistorySync('k', 's', UID, { lookbackDays: 30, extraSymbols: ['BTCUSDT', 'ETHUSDT'], sleep: async () => {}, now: () => NOW }).run();

    it('stores the same tradeId on BTCUSDT and ETHUSDT as two trades, and a re-sync adds none', async () => {
        const r1 = await run();
        expect(r1.inserted).toBe(2); // 1 trade per symbol
        expect(await Trade.countDocuments({ userId: UID })).toBe(2);
        const r2 = await run();
        expect(r2.inserted).toBe(0);
        expect(await Trade.countDocuments({ userId: UID })).toBe(2);
    });

    it('unique index is {userId, exchange, symbol, tradeId}', async () => {
        const idx = await Trade.collection.indexes();
        const keys = idx.filter(i => i.unique).map(i => Object.keys(i.key as object).join(','));
        expect(keys).toContain('userId,exchange,symbol,tradeId');
        expect(keys).not.toContain('userId,exchange,tradeId');
    });
});

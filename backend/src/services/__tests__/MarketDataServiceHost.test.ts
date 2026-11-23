import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Design v5 step 0 (2026-11-23): public 1-minute klines come from data-api.binance.vision, not api.binance.com.
 * Binance lists GET /api/v3/klines among the endpoints served there
 * (https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md, read 2026-11-23).
 * They go through the market-data governor, so a ban of api.binance.com (signed account calls) does not stop them.
 */
const get = vi.fn();
vi.mock('axios', () => ({ default: { get: (...a: unknown[]) => get(...a) }, get: (...a: unknown[]) => get(...a) }));
vi.mock('../../models/MarketCache', () => ({
    MarketCache: { findOne: () => ({ lean: async () => null }), updateOne: async () => ({}) },
}));

import { MarketDataService } from '../MarketDataService';
import { binanceGovernor, binanceDataGovernor } from '../binanceGovernor';

// One 1m kline: [openTime, open, high, low, close, ...]; open 42000.5 is the arrival price.
const KLINE = [[1705320000000, '42000.5', '42010', '41990', '42005', '1', 1705320059999, '1', 1, '1', '1', '0']];

describe('MarketDataService klines host', () => {
    beforeEach(() => { get.mockReset(); get.mockResolvedValue({ status: 200, headers: {}, data: KLINE }); });

    it('fetches klines from data-api.binance.vision', async () => {
        const p = await new MarketDataService().fetchArrivalPrice('BTCUSDT', 1705320060000);
        expect(p).toBe(42000.5);
        expect(get).toHaveBeenCalledTimes(1);
        const url = new URL(get.mock.calls[0][0] as string);
        expect(url.host).toBe('data-api.binance.vision');
        expect(url.pathname).toBe('/api/v3/klines');
    });

    it('a ban on api.binance.com does not stop klines; the weight goes to the market-data governor (2), not the account one', async () => {
        const before = { acct: binanceGovernor.snapshot().used, data: binanceDataGovernor.snapshot().used };
        binanceGovernor.observe(0, { status: 418, headers: { 'retry-after': '418' } });
        const p = await new MarketDataService().fetchArrivalPrice('ETHUSDT', 1705320060000);
        expect(p).toBe(42000.5);
        expect(binanceDataGovernor.snapshot().used - before.data).toBe(2);   // GET /api/v3/klines is IP weight 2
        expect(binanceGovernor.snapshot().used - before.acct).toBe(0);
    });
});

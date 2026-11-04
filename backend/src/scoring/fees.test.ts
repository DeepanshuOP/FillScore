import { describe, it, expect, vi } from 'vitest';
import { computeFeeUsd, tradeFeeUsd } from './fees';

// F-10: fees arrive in whatever asset the exchange charged. Hand-computed USD values:
//   quote-asset fee  5.001 USDT on BTCUSDT                 → 5.001 × 1        = 5.001
//   base-asset fee   0.00002 BTC on BTCUSDT filled @ 49995 → 0.00002 × 49995  = 0.9999
//   third-asset fee  0.004 BNB on BTCUSDT, BNBUSDT 1m close at execution = 600
//                                                          → 0.004 × 600      = 2.4
const executedAt = new Date('2026-10-30T10:00:30Z');
const trade = (fee: number, feeAsset: string) => ({ symbol: 'BTCUSDT', fee, feeAsset, executionPrice: 49995, executedAt });

describe('computeFeeUsd', () => {
    it('quote-asset fee is taken as-is', async () => {
        const priceAt = vi.fn();
        expect(await computeFeeUsd(trade(5.001, 'USDT'), priceAt)).toBeCloseTo(5.001, 12);
        expect(priceAt).not.toHaveBeenCalled();
    });

    it('base-asset fee is multiplied by the fill price', async () => {
        const priceAt = vi.fn();
        expect(await computeFeeUsd(trade(0.00002, 'BTC'), priceAt)).toBeCloseTo(0.9999, 12);
        expect(priceAt).not.toHaveBeenCalled();
    });

    it('third-asset fee is multiplied by that asset\'s 1m kline close against the quote at execution time', async () => {
        const priceAt = vi.fn().mockResolvedValue(600);
        expect(await computeFeeUsd(trade(0.004, 'BNB'), priceAt)).toBeCloseTo(2.4, 12);
        expect(priceAt).toHaveBeenCalledWith('BNBUSDT', executedAt.getTime());
    });

    it('a zero fee needs no price lookup', async () => {
        const priceAt = vi.fn();
        expect(await computeFeeUsd(trade(0, 'BNB'), priceAt)).toBe(0);
        expect(priceAt).not.toHaveBeenCalled();
    });

    it('works for other USD-stable quotes (ETHUSDC, base fee 0.001 ETH @ 3000 → 3)', async () => {
        const priceAt = vi.fn();
        const t = { symbol: 'ETHUSDC', fee: 0.001, feeAsset: 'ETH', executionPrice: 3000, executedAt };
        expect(await computeFeeUsd(t, priceAt)).toBeCloseTo(3, 12);
    });
});

describe('tradeFeeUsd', () => {
    it('prefers the stored feeUsd', () => {
        expect(tradeFeeUsd({ fee: 0.004, feeUsd: 2.4 })).toBe(2.4);
    });
    it('falls back to the native fee for legacy docs without feeUsd (seeded demo trades pay fees in USDT)', () => {
        expect(tradeFeeUsd({ fee: 5.001 })).toBe(5.001);
        expect(tradeFeeUsd({ fee: 5.001, feeUsd: null })).toBe(5.001);
        expect(tradeFeeUsd({ fee: 5.001, feeAsset: 'USDT' })).toBe(5.001);
    });
    it('never reads a non-USD native fee as dollars when feeUsd is missing (0.0004 BNB is not $0.0004)', () => {
        // review follow-up: an unconvertible fee counts as 0 (unpriced) rather than a wrong dollar amount
        expect(tradeFeeUsd({ fee: 0.0004, feeAsset: 'BNB' })).toBe(0);
        expect(tradeFeeUsd({ fee: 0.0004, feeAsset: 'OKB', feeUsd: null })).toBe(0);
    });
});

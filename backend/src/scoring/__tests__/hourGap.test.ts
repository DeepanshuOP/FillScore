import { describe, it, expect } from 'vitest';
import { hourGapPhrase } from '../audit';
import { isStaleRecommendations } from '../../services/auditText';

// Hand-computed: best-hour avg 92.4 - worst-window avg 41.1 = 51.3 (measured, above the old cap of 30).
describe('hourGapPhrase', () => {
    it('states the measured gap exactly, even above 30', () => {
        expect(hourGapPhrase({ measured: 92.4 - 41.1 })).toBe('averaged 51.3 points higher');
    });
    it('model value at the cap is a floor', () => {
        expect(hourGapPhrase({ modelValue: 30 })).toBe('averaged at least 30.0 points higher');
    });
    it('model value below the cap is exact', () => {
        expect(hourGapPhrase({ modelValue: 12.34 })).toBe('averaged 12.3 points higher');
    });
});

describe('stored "(capped at 30)" wording', () => {
    it('is treated as stale so it is regenerated at read time', () => {
        expect(isStaleRecommendations(['Your best hour averaged 30.0 points higher (capped at 30).'])).toBe(true);
        expect(isStaleRecommendations(['Your best hour averaged 51.3 points higher.'])).toBe(false);
    });
});

import { computeAuditSummary } from '../audit';
import { EnrichedTrade } from '../../types';

describe('audit sort is deterministic when tradeIds repeat across symbols', () => {
    const mk = (symbol: string, i: number) => ({
        userId: 'u', exchange: 'binance', symbol, tradeId: '1', orderId: `o${symbol}`, side: 'BUY', orderType: 'LIMIT', isMaker: true,
        executionPrice: 100 + i, quantity: 1, notional: 100 + i, fee: 0.01, feeUsd: 0.01, feeAsset: 'USDT',
        executedAt: new Date(Date.UTC(2024, 0, 1, 10)), arrivalPriceProxy: 100, spreadBps: 2, vwap5min: 100,
    } as EnrichedTrade);
    it('same summary whichever order the input arrives in', async () => {
        const a = [mk('BTCUSDT', 0), mk('ETHUSDT', 3), mk('SOLUSDT', 7)];
        const s1 = await computeAuditSummary('u', [...a]);
        const s2 = await computeAuditSummary('u', [...a].reverse());
        expect(s2.avgFillScore).toBe(s1.avgFillScore);
        expect(s2.breakdown).toEqual(s1.breakdown);
    });
});

import { describe, it, expect } from 'vitest';
import { computeAuditSummary, skipReason } from '../audit';
import { EnrichedTrade } from '../../types';

function mk(i: number, overrides: Partial<EnrichedTrade> = {}): EnrichedTrade {
    return {
        userId: 'u', exchange: 'binance', symbol: 'BTCUSDT', tradeId: `t${i}`, orderId: `o${i}`, side: 'BUY', orderType: 'MARKET',
        isMaker: false, executionPrice: 40000, quantity: 0.1, notional: 4000, fee: 4, feeUsd: 4, feeAsset: 'USDT',
        executedAt: new Date(`2024-01-1${i}T10:00:00Z`), arrivalPriceProxy: 40000, spreadBps: 1.0, ...overrides,
    } as EnrichedTrade;
}

describe('skipped trades are disclosed, scoring unchanged (4R-0b D)', () => {
    it('3 valid + 1 with spreadBps null -> count 1, invalid_spreadBps, composite identical to the 3-trade audit', async () => {
        const three = await computeAuditSummary('u', [mk(1), mk(2), mk(3)]);
        const four = await computeAuditSummary('u', [mk(1), mk(2), mk(3), mk(4, { spreadBps: null as any })]);
        expect(four.skippedTrades).toEqual({ count: 1, reasons: { invalid_spreadBps: 1 } });
        expect(three.skippedTrades).toEqual({ count: 0, reasons: {} });
        expect(four.avgFillScore).toBe(three.avgFillScore);
        expect(four.fillGrade).toBe(three.fillGrade);
    });

    it('pipeline-level skips passed in are merged with the summary\'s own', async () => {
        const s = await computeAuditSummary('u', [mk(1), mk(2, { arrivalPriceProxy: undefined as any })], { count: 2, reasons: { invalid_spreadBps: 2 } });
        expect(s.skippedTrades).toEqual({ count: 3, reasons: { invalid_spreadBps: 2, missing_market_data: 1 } });
    });

    it('maps the engine errors to stable reason keys', () => {
        expect(skipReason(new Error('Cannot score trade: missing spreadBps enrichment'))).toBe('invalid_spreadBps');
        expect(skipReason(new Error('Invalid input for spreadBps: must be a finite number.'))).toBe('invalid_spreadBps');
        expect(skipReason(new Error('Cannot score trade: missing arrivalPriceProxy enrichment'))).toBe('missing_market_data');
        expect(skipReason(new Error('Division by zero: notional cannot be 0'))).toBe('invalid_input');
    });
});

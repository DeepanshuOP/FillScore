import { describe, it, expect } from 'vitest';
import { computeAuditSummary, generateRecommendations } from './audit';
import { EnrichedTrade } from '../types';

function makeTrade(overrides: Partial<EnrichedTrade> = {}): EnrichedTrade {
    return {
        userId: 'test-user',
        exchange: 'binance',
        symbol: 'BTCUSDT',
        tradeId: '123',
        orderId: '456',
        side: 'BUY',
        orderType: 'MARKET',
        isMaker: false,
        executionPrice: 40000,
        quantity: 0.1,
        notional: 4000,
        fee: 4, // 10 bps fee drag
        feeAsset: 'USDT',
        executedAt: new Date('2024-01-15T10:00:00Z'),
        arrivalPriceProxy: 40000,
        spreadBps: 1.0,
        ...overrides,
    };
}

describe('computeAuditSummary', () => {
    it('computes notional-weighted avgFillScore correctly', async () => {
        const trade1 = makeTrade({
            notional: 10000,
            executionPrice: 40000,
            arrivalPriceProxy: 40000,
            isMaker: true,
            executedAt: new Date('2024-01-15T10:00:00Z'),
            spreadBps: 1.0,
        });

        const trade2 = makeTrade({
            notional: 100,
            executionPrice: 40200,
            arrivalPriceProxy: 40000,
            isMaker: false,
            executedAt: new Date('2024-01-15T03:00:00Z'),
            spreadBps: 5.0,
        });

        const summary = await computeAuditSummary('u1', [trade1, trade2]);
        expect(summary.avgFillScore).toBeCloseTo(97.881, 2);
    });

    it('calculates makerRatio correctly (3 maker out of 5)', async () => {
        const trades = [
            makeTrade({ isMaker: true }),
            makeTrade({ isMaker: false }),
            makeTrade({ isMaker: true }),
            makeTrade({ isMaker: false }),
            makeTrade({ isMaker: true }),
        ];
        const summary = await computeAuditSummary('u1', trades);
        expect(summary.breakdown.makerRatio).toBe(0.6);
    });

    it('groups bestHour and worstHour correctly', async () => {
        const trade1 = makeTrade({ executedAt: new Date('2024-01-15T10:00:00Z'), isMaker: true, spreadBps: 1.0 }); 
        const trade2 = makeTrade({ executedAt: new Date('2024-01-15T03:00:00Z'), isMaker: false, executionPrice: 40200, spreadBps: 5.0 }); 

        const summary = await computeAuditSummary('u1', [trade1, trade2]);
        expect(summary.breakdown.bestHour).toBe(10);
        expect(summary.breakdown.worstHour).toBe(3);
    });

    it('accumulates estimatedLossUSD only for trades with feeDragBps > 2', async () => {
        const trade1 = makeTrade({ notional: 1000, fee: 5.0 }); // 50 bps -> loss = 4.8
        const trade2 = makeTrade({ notional: 1000, fee: 1.0 }); // 10 bps -> loss = 0.8
        const trade3 = makeTrade({ notional: 1000, fee: 0.1 }); // 1 bps -> negative, ignored

        const summary = await computeAuditSummary('u1', [trade1, trade2, trade3]);
        expect(summary.estimatedLossUSD).toBeCloseTo(5.6, 2);
    });

    it('returns a safe zero-value summary for an empty trades array (should not throw)', async () => {
        const summary = await computeAuditSummary('u1', []);
        expect(summary.totalTrades).toBe(0);
        expect(summary.totalNotional).toBe(0);
    });

    it('is strictly deterministic regardless of input order', async () => {
        // Create 100 trades with vastly varying magnitudes to exaggerate floating point non-associativity if order changes
        const extremeTrades = [];
        for (let i = 0; i < 50; i++) {
            extremeTrades.push(makeTrade({ tradeId: `T${i}`, notional: Math.random() * 1e10, fee: Math.random() * 10, isMaker: i % 2 === 0, executionPrice: 40000 + Math.random() * 100, arrivalPriceProxy: 40000, executedAt: new Date(`2024-01-15T01:${i}:00Z`) }));
        }
        for (let i = 50; i < 100; i++) {
            extremeTrades.push(makeTrade({ tradeId: `T${i}`, notional: Math.random() * 1e-5, fee: Math.random() * 1e-6, isMaker: i % 2 === 0, executionPrice: 40000 + Math.random() * 100, arrivalPriceProxy: 40000, executedAt: new Date(`2024-01-15T01:${i - 50}:00Z`) }));
        }

        const summary1 = await computeAuditSummary('u1', extremeTrades);
        
        // Randomly shuffle
        const shuffled = [...extremeTrades].sort(() => Math.random() - 0.5);
        
        const summary2 = await computeAuditSummary('u1', shuffled);

        // Assert strictly byte-identical (toBe, not toBeCloseTo)
        // Note: Without stable sort, this CAN fail for floats due to non-associativity.
        expect(summary1.avgFillScore).toBe(summary2.avgFillScore);
        expect(summary1.totalNotional).toBe(summary2.totalNotional);
        expect(summary1.breakdown.avgSlippageBps).toBe(summary2.breakdown.avgSlippageBps);
        expect(summary1.breakdown.avgFeeDragBps).toBe(summary2.breakdown.avgFeeDragBps);
        expect(summary1.estimatedLossUSD).toBe(summary2.estimatedLossUSD);
    });
});

describe('generateRecommendations', () => {
    it('includes limit-order recommendation if makerRatio < 0.3', async () => {
        const trades = [
            makeTrade({ isMaker: false }),
            makeTrade({ isMaker: false }),
            makeTrade({ isMaker: false }),
            makeTrade({ isMaker: false }),
            makeTrade({ isMaker: true }),
        ];
        const summary = await computeAuditSummary('u1', trades);
        const limitRec = summary.recommendations.find(r => r.includes('market orders') && r.includes('limit orders'));
        expect(limitRec).toBeDefined();
    });
});

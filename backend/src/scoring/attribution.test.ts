import { describe, it, expect } from 'vitest';
import { computeTradeCost, aggregateCostAttribution } from './attribution';
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
        fee: 4,
        feeAsset: 'USDT',
        executedAt: new Date('2024-01-15T10:00:00Z'),
        arrivalPriceProxy: 40000,
        spreadBps: 1.0,
        ...overrides,
    };
}

describe('computeTradeCost', () => {
    it('shows positive feeCost for a taker trade with fee', () => {
        const trade = makeTrade({ isMaker: false, fee: 5 });
        const cost = computeTradeCost(trade);
        expect(cost.feeCost).toBe(5);
    });

    it('shows zero feeCost for a maker trade', () => {
        const trade = makeTrade({ isMaker: true, fee: 0 });
        const cost = computeTradeCost(trade);
        expect(cost.feeCost).toBe(0);
    });

    it('shows positive timingCost for a trade at 2AM UTC (LOW window)', () => {
        const trade = makeTrade({ executedAt: new Date('2024-01-15T02:00:00Z'), notional: 1000 });
        const cost = computeTradeCost(trade);
        expect(cost.timingCost).toBe(0.5);
    });

    it('shows zero or minimal timingCost for a trade at 10AM UTC (HIGH window)', () => {
        const trade = makeTrade({ executedAt: new Date('2024-01-15T10:00:00Z'), notional: 1000 });
        const cost = computeTradeCost(trade);
        expect(cost.timingCost).toBe(0);
    });

    it('ensures total attribution cost equals the sum of its components', () => {
        const trade = makeTrade({ 
            executionPrice: 40100,
            arrivalPriceProxy: 40000,
            fee: 5,
            executedAt: new Date('2024-01-15T02:00:00Z'),
            spreadBps: 2.0
        });
        const cost = computeTradeCost(trade);
        
        expect(cost.slippageCost).toBe(10);
        expect(cost.feeCost).toBe(5);
        expect(cost.timingCost).toBe(2);
        expect(cost.spreadCost).toBe(0.8);
        
        const sum = cost.slippageCost + cost.feeCost + cost.timingCost + cost.spreadCost;
        expect(cost.totalCost).toBe(sum);
    });
});

describe('aggregateCostAttribution', () => {
    it('aggregates multiple trades correctly', () => {
        const trade1 = makeTrade({ fee: 5, notional: 1000, executedAt: new Date('2024-01-15T10:00:00Z') });
        const trade2 = makeTrade({ fee: 2, notional: 1000, executedAt: new Date('2024-01-15T02:00:00Z') }); 
        
        const agg = aggregateCostAttribution([trade1, trade2]);
        expect(agg.feeCost).toBe(7);
        expect(agg.timingCost).toBe(0.5);
        expect(agg.totalNotional).toBe(2000);
        expect(agg.tradeCount).toBe(2);
    });
});

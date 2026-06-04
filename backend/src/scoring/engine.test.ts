import { describe, it, expect } from 'vitest';
import {
    computeArrivalSlippageBps,
    computeVwapSlippageBps,
    computeSpreadCostUSD,
    computeFeeDragBps,
    scoreArrivalSlippage,
    scoreFeeEfficiency,
    scoreTiming,
    scoreExchange,
    computeFillScore,
    gradeFromScore,
    scoreTrade,
} from './engine';
import { EnrichedTrade } from '../types';

// ─────────────────────────────────────────────
// HELPER: Build a minimal enriched trade for scoreTrade tests.
// Only the fields that scoreTrade actually reads are required.
// ─────────────────────────────────────────────
function makeTrade(overrides: Partial<EnrichedTrade> = {}): EnrichedTrade {
    return {
        userId: 'test-user',
        exchange: 'binance',
        symbol: 'BTCUSDT',
        tradeId: '123',
        orderId: '456',
        side: 'BUY',
        orderType: 'LIMIT',
        isMaker: true,
        executionPrice: 40000,
        quantity: 0.1,
        notional: 4000,
        fee: 0.4,
        feeAsset: 'USDT',
        executedAt: new Date('2024-01-15T10:00:00Z'), // hour 10 → HIGH window
        arrivalPriceProxy: 40000,
        spreadBps: 1.0,
        ...overrides,
    };
}

// ═══════════════════════════════════════════════
// 1. computeArrivalSlippageBps
// ═══════════════════════════════════════════════
describe('computeArrivalSlippageBps', () => {
    it('returns 0 bps when exec price equals arrival price (BUY)', () => {
        expect(computeArrivalSlippageBps(100, 100, 'BUY')).toBe(0);
    });

    it('returns 0 bps when exec price equals arrival price (SELL)', () => {
        expect(computeArrivalSlippageBps(100, 100, 'SELL')).toBe(0);
    });

    it('returns positive bps for BUY overpay (exec > arrival)', () => {
        // (101 - 100) / 100 * 10000 = 100 bps
        expect(computeArrivalSlippageBps(101, 100, 'BUY')).toBe(100);
    });

    it('returns positive bps for SELL underpay (arrival > exec)', () => {
        // (100 - 99) / 100 * 10000 = 100 bps
        expect(computeArrivalSlippageBps(99, 100, 'SELL')).toBe(100);
    });

    it('returns negative bps for BUY price improvement (exec < arrival)', () => {
        // (99 - 100) / 100 * 10000 = -100 bps
        expect(computeArrivalSlippageBps(99, 100, 'BUY')).toBe(-100);
    });

    it('returns negative bps for SELL price improvement (exec > arrival)', () => {
        // (100 - 101) / 100 * 10000 = -100 bps
        expect(computeArrivalSlippageBps(101, 100, 'SELL')).toBe(-100);
    });

    it('throws on arrivalPrice = 0 (division by zero)', () => {
        expect(() => computeArrivalSlippageBps(100, 0, 'BUY')).toThrow('Division by zero');
    });

    it('throws on NaN execPrice', () => {
        expect(() => computeArrivalSlippageBps(NaN, 100, 'BUY')).toThrow('Invalid input');
    });

    it('throws on Infinity arrivalPrice', () => {
        expect(() => computeArrivalSlippageBps(100, Infinity, 'BUY')).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 2. computeVwapSlippageBps
// ═══════════════════════════════════════════════
describe('computeVwapSlippageBps', () => {
    it('returns 0 when exec equals vwap', () => {
        expect(computeVwapSlippageBps(100, 100, 'BUY')).toBe(0);
    });

    it('returns positive bps for BUY overpay', () => {
        expect(computeVwapSlippageBps(101, 100, 'BUY')).toBe(100);
    });

    it('returns positive bps for SELL underpay', () => {
        expect(computeVwapSlippageBps(99, 100, 'SELL')).toBe(100);
    });

    it('throws on vwap = 0 (division by zero)', () => {
        expect(() => computeVwapSlippageBps(100, 0, 'BUY')).toThrow('Division by zero');
    });

    it('throws on NaN vwap', () => {
        expect(() => computeVwapSlippageBps(100, NaN, 'BUY')).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 3. computeSpreadCostUSD
// ═══════════════════════════════════════════════
describe('computeSpreadCostUSD', () => {
    it('returns 0 when execPrice equals midPrice', () => {
        // mid = (99 + 101) / 2 = 100, exec = 100
        expect(computeSpreadCostUSD(100, 99, 101, 1)).toBe(0);
    });

    it('computes spread cost correctly for normal case', () => {
        // mid = (100 + 102) / 2 = 101, |exec - mid| = |100 - 101| = 1, qty = 0.5
        expect(computeSpreadCostUSD(100, 100, 102, 0.5)).toBe(0.5);
    });

    it('returns 0 when bid=0 and ask=0 (midPrice=0 guard)', () => {
        expect(computeSpreadCostUSD(100, 0, 0, 1)).toBe(0);
    });

    it('throws on NaN quantity', () => {
        expect(() => computeSpreadCostUSD(100, 99, 101, NaN)).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 4. computeFeeDragBps
// ═══════════════════════════════════════════════
describe('computeFeeDragBps', () => {
    it('computes fee drag correctly', () => {
        // (1 / 1000) * 10000 = 10 bps
        expect(computeFeeDragBps(1, 1000)).toBe(10);
    });

    it('returns 0 bps when fee is 0', () => {
        expect(computeFeeDragBps(0, 1000)).toBe(0);
    });

    it('throws on notional = 0 (division by zero)', () => {
        expect(() => computeFeeDragBps(1, 0)).toThrow('Division by zero');
    });

    it('throws on NaN fee', () => {
        expect(() => computeFeeDragBps(NaN, 1000)).toThrow('Invalid input');
    });

    it('throws on NaN notional', () => {
        expect(() => computeFeeDragBps(1, NaN)).toThrow('Invalid input');
    });

    it('handles very small notional values without error', () => {
        const result = computeFeeDragBps(0.001, 0.01);
        expect(result).toBe(1000); // (0.001 / 0.01) * 10000
    });
});

// ═══════════════════════════════════════════════
// 5. scoreArrivalSlippage — boundary cases
// ═══════════════════════════════════════════════
describe('scoreArrivalSlippage', () => {
    it('returns 100 for 0 bps slippage', () => {
        expect(scoreArrivalSlippage(0)).toBe(100);
    });

    it('returns 100 for negative slippage (price improvement)', () => {
        expect(scoreArrivalSlippage(-5)).toBe(100);
    });

    it('returns 100 for slippage just under 5 bps (e.g., 4.99)', () => {
        expect(scoreArrivalSlippage(4.99)).toBe(100);
    });

    it('returns 100 for exactly 5 bps (boundary: s < 5 fails, s <= 0 fails, hits s <= 15 → 100 - 0 = 100)', () => {
        // At s = 5: falls into the s <= 15 branch → 100 - ((5 - 5) * 6) = 100
        expect(scoreArrivalSlippage(5)).toBe(100);
    });

    it('returns 40 for exactly 15 bps (boundary: 100 - (10 * 6) = 40)', () => {
        expect(scoreArrivalSlippage(15)).toBe(40);
    });

    it('returns 30 for 20 bps (heavy decay: 40 - (5 * 2) = 30)', () => {
        expect(scoreArrivalSlippage(20)).toBe(30);
    });

    it('returns 0 for 50 bps (heavy decay: 40 - (35 * 2) = -30, clamped to 0)', () => {
        expect(scoreArrivalSlippage(50)).toBe(0);
    });

    it('returns score in mid-tier for 10 bps (100 - (5 * 6) = 70)', () => {
        expect(scoreArrivalSlippage(10)).toBe(70);
    });

    it('throws on NaN input', () => {
        expect(() => scoreArrivalSlippage(NaN)).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 6. scoreFeeEfficiency
// ═══════════════════════════════════════════════
describe('scoreFeeEfficiency', () => {
    it('returns 100 for maker', () => {
        expect(scoreFeeEfficiency(true)).toBe(100);
    });

    it('returns 0 for taker', () => {
        expect(scoreFeeEfficiency(false)).toBe(0);
    });

    it('throws on non-boolean input', () => {
        // @ts-expect-error: intentionally passing wrong type for runtime guard test
        expect(() => scoreFeeEfficiency('yes')).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 7. scoreTiming — UTC hour boundary cases
// ═══════════════════════════════════════════════
describe('scoreTiming', () => {
    // Helper: create a Date at a specific UTC hour
    const dateAtHour = (hour: number) => new Date(`2024-01-15T${String(hour).padStart(2, '0')}:30:00Z`);

    it('hour 7 → HIGH window, score 95 (start of high-liquidity)', () => {
        const result = scoreTiming(dateAtHour(7));
        expect(result).toEqual({ score: 95, window: 'HIGH' });
    });

    it('hour 15 → HIGH window, score 95 (last hour in high-liquidity)', () => {
        const result = scoreTiming(dateAtHour(15));
        expect(result).toEqual({ score: 95, window: 'HIGH' });
    });

    it('hour 16 → MEDIUM window, score 70 (start of medium-liquidity)', () => {
        const result = scoreTiming(dateAtHour(16));
        expect(result).toEqual({ score: 70, window: 'MEDIUM' });
    });

    it('hour 21 → MEDIUM window, score 70 (last hour in medium-liquidity)', () => {
        const result = scoreTiming(dateAtHour(21));
        expect(result).toEqual({ score: 70, window: 'MEDIUM' });
    });

    it('hour 22 → LOW window, score 20 (start of low-liquidity)', () => {
        const result = scoreTiming(dateAtHour(22));
        expect(result).toEqual({ score: 20, window: 'LOW' });
    });

    it('hour 6 → LOW window, score 20 (end of low-liquidity)', () => {
        const result = scoreTiming(dateAtHour(6));
        expect(result).toEqual({ score: 20, window: 'LOW' });
    });

    it('hour 0 → LOW window, score 20 (midnight)', () => {
        const result = scoreTiming(dateAtHour(0));
        expect(result).toEqual({ score: 20, window: 'LOW' });
    });

    it('hour 12 → HIGH window, score 95 (midday)', () => {
        const result = scoreTiming(dateAtHour(12));
        expect(result).toEqual({ score: 95, window: 'HIGH' });
    });

    it('throws on invalid Date', () => {
        expect(() => scoreTiming(new Date('invalid'))).toThrow('Invalid input');
    });

    it('throws on non-Date input', () => {
        // @ts-expect-error: intentionally passing wrong type for runtime guard test
        expect(() => scoreTiming('2024-01-15T10:00:00Z')).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 8. scoreExchange — spread boundary cases
// ═══════════════════════════════════════════════
describe('scoreExchange', () => {
    it('returns 100 for spread exactly 1.5 bps (tight spread boundary)', () => {
        expect(scoreExchange(1.5)).toBe(100);
    });

    it('returns 100 for spread below 1.5 bps', () => {
        expect(scoreExchange(0.5)).toBe(100);
    });

    it('returns 75 for spread just above 1.5 bps (e.g., 1.51)', () => {
        expect(scoreExchange(1.51)).toBe(75);
    });

    it('returns 75 for spread exactly 3.0 bps', () => {
        expect(scoreExchange(3.0)).toBe(75);
    });

    it('returns 40 for spread just above 3.0 bps (e.g., 3.01)', () => {
        expect(scoreExchange(3.01)).toBe(40);
    });

    it('returns 40 for spread 10 bps (wide spread)', () => {
        expect(scoreExchange(10)).toBe(40);
    });

    it('returns 100 for spread 0 bps', () => {
        expect(scoreExchange(0)).toBe(100);
    });

    it('throws on NaN spread', () => {
        expect(() => scoreExchange(NaN)).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 9. computeFillScore — weighted sum verification
// ═══════════════════════════════════════════════
describe('computeFillScore', () => {
    it('returns correct weighted sum for known inputs', () => {
        // slippage=80 * 0.35 = 28
        // fee=100 * 0.25 = 25
        // timing=60 * 0.25 = 15
        // exchange=50 * 0.15 = 7.5
        // total = 75.5
        expect(computeFillScore(80, 100, 60, 50)).toBe(75.5);
    });

    it('returns 100 for all perfect scores', () => {
        // 100*0.35 + 100*0.25 + 100*0.25 + 100*0.15 = 100
        expect(computeFillScore(100, 100, 100, 100)).toBe(100);
    });

    it('returns 0 for all zero scores', () => {
        expect(computeFillScore(0, 0, 0, 0)).toBe(0);
    });

    it('clamps to 100 if inputs exceed 100', () => {
        // 200*0.35 + 200*0.25 + 200*0.25 + 200*0.15 = 200, clamped to 100
        expect(computeFillScore(200, 200, 200, 200)).toBe(100);
    });

    it('clamps to 0 if result would be negative', () => {
        // Negative inputs: -100*0.35 + -100*0.25 + -100*0.25 + -100*0.15 = -100, clamped to 0
        expect(computeFillScore(-100, -100, -100, -100)).toBe(0);
    });

    it('handles asymmetric scores correctly', () => {
        // slippage=100, fee=0, timing=0, exchange=0
        // 100*0.35 + 0 + 0 + 0 = 35
        expect(computeFillScore(100, 0, 0, 0)).toBe(35);
    });

    it('verifies weight independence: only fee score at 100', () => {
        // 0 + 100*0.25 + 0 + 0 = 25
        expect(computeFillScore(0, 100, 0, 0)).toBe(25);
    });

    it('verifies weight independence: only timing score at 100', () => {
        // 0 + 0 + 100*0.25 + 0 = 25
        expect(computeFillScore(0, 0, 100, 0)).toBe(25);
    });

    it('verifies weight independence: only exchange score at 100', () => {
        // 0 + 0 + 0 + 100*0.15 = 15
        expect(computeFillScore(0, 0, 0, 100)).toBe(15);
    });

    it('throws on NaN input', () => {
        expect(() => computeFillScore(NaN, 100, 100, 100)).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 10. gradeFromScore — boundary cases
// ═══════════════════════════════════════════════
describe('gradeFromScore', () => {
    it('returns A for score 90 (boundary)', () => {
        expect(gradeFromScore(90)).toBe('A');
    });

    it('returns B for score 89 (just below A)', () => {
        expect(gradeFromScore(89)).toBe('B');
    });

    it('returns B for score 75 (boundary)', () => {
        expect(gradeFromScore(75)).toBe('B');
    });

    it('returns C for score 74 (just below B)', () => {
        expect(gradeFromScore(74)).toBe('C');
    });

    it('returns C for score 60 (boundary)', () => {
        expect(gradeFromScore(60)).toBe('C');
    });

    it('returns D for score 59 (just below C)', () => {
        expect(gradeFromScore(59)).toBe('D');
    });

    it('returns D for score 40 (boundary)', () => {
        expect(gradeFromScore(40)).toBe('D');
    });

    it('returns F for score 39 (just below D)', () => {
        expect(gradeFromScore(39)).toBe('F');
    });

    it('returns A for score 100', () => {
        expect(gradeFromScore(100)).toBe('A');
    });

    it('returns F for score 0', () => {
        expect(gradeFromScore(0)).toBe('F');
    });

    it('throws on NaN', () => {
        expect(() => gradeFromScore(NaN)).toThrow('Invalid input');
    });
});

// ═══════════════════════════════════════════════
// 11. scoreTrade — integration of pure functions
// ═══════════════════════════════════════════════
describe('scoreTrade', () => {
    it('scores a perfect maker trade in HIGH window with zero slippage', () => {
        const trade = makeTrade({
            executionPrice: 40000,
            arrivalPriceProxy: 40000,
            isMaker: true,
            executedAt: new Date('2024-01-15T10:00:00Z'), // hour 10 → HIGH
            spreadBps: 1.0,
        });

        const result = scoreTrade(trade);

        // slippage: 0 bps → 100
        expect(result.slippageScore).toBe(100);
        // fee: maker → 100
        expect(result.feeScore).toBe(100);
        // timing: hour 10 → 95
        expect(result.timingScore).toBe(95);
        // exchange: 1.0 bps → 100
        expect(result.exchangeScore).toBe(100);
        // composite: 100*0.35 + 100*0.25 + 95*0.25 + 100*0.15 = 35 + 25 + 23.75 + 15 = 98.75
        expect(result.fillScore).toBe(98.75);
        expect(result.fillGrade).toBe('A');
    });

    it('scores a poor taker trade in LOW window with high slippage', () => {
        const trade = makeTrade({
            executionPrice: 40200,    // 200 over arrival → (200/40000)*10000 = 50 bps
            arrivalPriceProxy: 40000,
            side: 'BUY',
            isMaker: false,
            executedAt: new Date('2024-01-15T03:00:00Z'), // hour 3 → LOW
            spreadBps: 5.0,           // > 3.0 → 40
        });

        const result = scoreTrade(trade);

        // slippage: 50 bps → max(0, 40 - 35*2) = max(0, -30) = 0
        expect(result.slippageScore).toBe(0);
        // fee: taker → 0
        expect(result.feeScore).toBe(0);
        // timing: hour 3 → 20
        expect(result.timingScore).toBe(20);
        // exchange: 5.0 bps → 40
        expect(result.exchangeScore).toBe(40);
        // composite: 0*0.35 + 0*0.25 + 20*0.25 + 40*0.15 = 0 + 0 + 5 + 6 = 11
        expect(result.fillScore).toBe(11);
        expect(result.fillGrade).toBe('F');
    });

    it('throws when arrivalPriceProxy is missing', () => {
        const trade = makeTrade({ arrivalPriceProxy: undefined });
        expect(() => scoreTrade(trade)).toThrow('missing arrivalPriceProxy');
    });

    it('throws when spreadBps is missing', () => {
        const trade = makeTrade({ spreadBps: undefined });
        expect(() => scoreTrade(trade)).toThrow('missing spreadBps');
    });

    it('handles SELL side correctly', () => {
        const trade = makeTrade({
            side: 'SELL',
            executionPrice: 39900,     // (40000 - 39900)/40000 * 10000 = 25 bps
            arrivalPriceProxy: 40000,
            isMaker: false,
            executedAt: new Date('2024-01-15T18:00:00Z'), // hour 18 → MEDIUM
            spreadBps: 2.0,            // → 75
        });

        const result = scoreTrade(trade);

        // slippage: 25 bps → max(0, 40 - (25-15)*2) = max(0, 40 - 20) = 20
        expect(result.slippageScore).toBe(20);
        // fee: taker → 0
        expect(result.feeScore).toBe(0);
        // timing: hour 18 → 70
        expect(result.timingScore).toBe(70);
        // exchange: 2.0 bps → 75
        expect(result.exchangeScore).toBe(75);
        // composite: 20*0.35 + 0*0.25 + 70*0.25 + 75*0.15 = 7 + 0 + 17.5 + 11.25 = 35.75
        expect(result.fillScore).toBe(35.75);
        expect(result.fillGrade).toBe('F');
    });
});

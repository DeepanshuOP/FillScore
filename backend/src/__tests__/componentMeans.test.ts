import { describe, it, expect } from 'vitest';
import { computeComponentMeans } from '../scoring/audit';
import { componentMeansFromStored, componentMeansForPeriod } from '../services/auditText';

describe('computeComponentMeans (notional-weighted means of the engine\'s per-trade component scores)', () => {
    it('notional 100 & 300, slippage scores 80 & 40 -> 50', () => {
        // (80*100 + 40*300) / (100+300) = (8000 + 12000) / 400 = 50
        const m = computeComponentMeans([
            { notional: 100, slippageScore: 80, feeScore: 100, timingScore: 70, exchangeScore: 100 },
            { notional: 300, slippageScore: 40, feeScore: 100, timingScore: 70, exchangeScore: 75 },
        ]);
        expect(m.slippage).toBe(50);
        expect(m.fees).toBe(100);
        expect(m.timing).toBe(70);
        // (100*100 + 75*300) / 400 = (10000 + 22500) / 400 = 81.25
        expect(m.spread).toBe(81.25);
    });

    it('all spread missing -> spread null', () => {
        const m = computeComponentMeans([
            { notional: 100, slippageScore: 80, feeScore: 0, timingScore: 70 },
            { notional: 100, slippageScore: 60, feeScore: 100, timingScore: 90 },
        ]);
        expect(m.spread).toBeNull();
        expect(m.slippage).toBe(70);
        expect(m.fees).toBe(50);
    });

    it('a component averages only over trades that have it', () => {
        // spread only on the 300-notional trade -> 40, not diluted by the 100-notional trade without it
        const m = computeComponentMeans([
            { notional: 100, slippageScore: 10 },
            { notional: 300, slippageScore: 10, exchangeScore: 40 },
        ]);
        expect(m.spread).toBe(40);
    });

    it('empty -> all null', () => {
        expect(computeComponentMeans([])).toEqual({ slippage: null, fees: null, timing: null, spread: null });
    });
});

describe('componentMeansForPeriod (same window the audit used)', () => {
    const period = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-31T23:59:59Z') };
    const t = (d: string, notional: number, slippageScore: number) => ({ executedAt: new Date(d), notional, slippageScore });
    it('averages only trades inside the period (bounds inclusive)', () => {
        const docs = [
            t('2026-01-05T00:00:00Z', 100, 80),
            t('2026-01-31T23:59:59Z', 300, 40),   // exactly period.end: inside
            t('2026-02-02T00:00:00Z', 1000, 0),   // outside
            t('2025-12-31T00:00:00Z', 1000, 0),   // outside
        ];
        // inside: (100*80 + 300*40) / (100+300) = 20000/400 = 50 (with the outside trades it would be 20000/2400 = 8.33)
        expect(componentMeansForPeriod(docs, period)!.slippage).toBe(50);
    });
    it('null when nothing in the period carries scores', () => {
        expect(componentMeansForPeriod([t('2026-03-01T00:00:00Z', 100, 80)], period)).toBeNull();
    });
});

describe('componentMeansFromStored (read path; never rewrites the audit)', () => {
    it('null when per-trade scores are not stored', () => {
        expect(componentMeansFromStored([{ notional: 100 }])).toBeNull();
        expect(componentMeansFromStored([])).toBeNull();
    });
    it('computes from stored per-trade scores', () => {
        expect(componentMeansFromStored([{ notional: 100, slippageScore: 90, feeScore: 100, timingScore: 50, exchangeScore: 100 }]))
            .toEqual({ slippage: 90, fees: 100, timing: 50, spread: 100 });
    });
});

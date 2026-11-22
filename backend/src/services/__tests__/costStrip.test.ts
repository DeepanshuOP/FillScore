import { describe, it, expect } from 'vitest';
import { costStrip } from '../orderSummary';

// Design v3.1 (2026-11-21, second) and fixes F1 (2026-11-22, second order): the overview's "where the money went" strip.
// The browser draws one segment per positive cost part with the width the server gives; it computes no share itself.
// Three parts that add up to the total: filled-order execution (total - fees - missed), missed fills (the modelled cost
// of orders that never filled, `unfilledCost.usd`) and fees.
const T = (total: number, fees: number | null) => ({ total: { usd: total, bps: 0, n: 3 }, fees: fees === null ? null : { usd: fees, bps: 0, n: 3 } });

describe('costStrip', () => {
    it('splits the total into filled-order execution, missed fills and fees, shares of the positive parts', () => {
        // total 12, fees 9, missed (unfilled orders) 1 -> execution 12 - 9 - 1 = 2; positive sum 2 + 1 + 9 = 12
        // shares 2/12, 1/12, 9/12; the three dollar parts add up to the total: 2 + 1 + 9 = 12
        const s = costStrip(T(12, 9), 1)!;
        expect(s.segments.map(x => [x.key, x.usd])).toEqual([['execution', 2], ['missed', 1], ['fees', 9]]);
        expect(s.segments[0].share).toBeCloseTo(2 / 12, 15);
        expect(s.segments[1].share).toBeCloseTo(1 / 12, 15);
        expect(s.segments[2].share).toBeCloseTo(0.75, 15);
        expect(s.segments.reduce((a, x) => a + x.usd, 0)).toBeCloseTo(s.totalUsd, 12);
        expect(s.totalUsd).toBe(12);
    });

    it('with no missed fills the earlier two parts remain: execution 12 - 9 = 3, shares 0.25 and 0.75', () => {
        const s = costStrip(T(12, 9), 0)!;
        expect(s.segments).toEqual([
            { key: 'execution', usd: 3, share: 0.25, below: 0 },
            { key: 'missed', usd: 0, share: 0, below: 0 },
            { key: 'fees', usd: 9, share: 0.75, below: 0 },
        ]);
    });

    it('gives a negative part no width and names it apart (a price improvement)', () => {
        // total 5, fees 8, missed 2 -> execution 5 - 8 - 2 = -5 (an improvement); positive sum 2 + 8 = 10
        // -> shares 0, 0.2, 0.8; the improvement is drawn below the line at 5 / 10 = 0.5 of the scale
        const s = costStrip(T(5, 8), 2)!;
        expect(s.segments).toEqual([
            { key: 'execution', usd: -5, share: 0, below: 0.5 },
            { key: 'missed', usd: 2, share: 0.2, below: 0 },
            { key: 'fees', usd: 8, share: 0.8, below: 0 },
        ]);
        expect(s.segments.reduce((a, x) => a + x.usd, 0)).toBe(5);
    });

    it('matches the demo-moderate totals: fees 41.98 + missed fills 10.63 + filled-order execution -0.53 = 52.08', () => {
        // total 52.0785604695634, fees 41.97630206664916, missed 10.631536 (served unfilledCost.usd)
        // execution = 52.0785604695634 - 41.97630206664916 - 10.631536 = -0.5292775970857
        // positive sum 41.97630206664916 + 10.631536 = 52.60783806664916
        // missed share 10.631536 / 52.60783806664916, fees share 41.97630206664916 / 52.60783806664916
        const s = costStrip(T(52.0785604695634, 41.97630206664916), 10.631536)!;
        expect(s.segments[0].usd).toBeCloseTo(-0.5292775970857, 10);
        expect(s.segments[0].share).toBe(0);
        expect(s.segments[0].below).toBeCloseTo(0.5292775970857 / 52.60783806664916, 10); // 0.010060...
        expect(s.segments[1].share).toBeCloseTo(10.631536 / 52.60783806664916, 12);
        expect(s.segments[2].share).toBeCloseTo(41.97630206664916 / 52.60783806664916, 12);
        expect(s.segments.reduce((a, x) => a + x.usd, 0)).toBeCloseTo(52.0785604695634, 12);
    });

    it('treats unmeasured unfilled orders (null dollars) as no missed part: they are not in the total either', () => {
        // missed null -> 0: execution 12 - 9 = 3
        expect(costStrip(T(12, 9), null)!.segments.map(x => x.usd)).toEqual([3, 0, 9]);
    });

    it('is null without a total or without fees, and has no widths when nothing is positive', () => {
        expect(costStrip(null, 0)).toBeNull();
        expect(costStrip({ total: null, fees: { usd: 1, bps: 0, n: 1 } }, 0)).toBeNull();
        expect(costStrip(T(4, null), 0)).toBeNull();
        // total 0, fees 0, missed 0 -> every part 0; positive sum 0 -> all shares 0 (the screen prints the sentence only)
        expect(costStrip(T(0, 0), 0)!.segments.map(x => x.share)).toEqual([0, 0, 0]);
    });
});

import { describe, it, expect } from 'vitest';
import { costStrip } from '../orderSummary';

// Design v3.1 (2026-11-21, second): the overview's "where the money went" strip. The browser draws one segment per
// positive cost part with the width the server gives; it computes no share itself.
// Parts: market = total - fees (what was measured against market prices: execution + unfilled orders), fees.
const T = (total: number, fees: number | null) => ({ total: { usd: total, bps: 0, n: 3 }, fees: fees === null ? null : { usd: fees, bps: 0, n: 3 } });

describe('costStrip', () => {
    it('splits the total into market and fees, shares of the positive parts', () => {
        // total 12, fees 9 -> market 12 - 9 = 3; positive sum 3 + 9 = 12; shares 3/12 = 0.25 and 9/12 = 0.75
        const s = costStrip(T(12, 9))!;
        expect(s.segments).toEqual([
            { key: 'market', usd: 3, share: 0.25 },
            { key: 'fees', usd: 9, share: 0.75 },
        ]);
        expect(s.totalUsd).toBe(12);
    });

    it('gives a negative part no width and names it apart', () => {
        // total 5, fees 8 -> market 5 - 8 = -3 (a price improvement larger than the other costs);
        // positive sum 8 -> market share 0, fees 8/8 = 1
        const s = costStrip(T(5, 8))!;
        expect(s.segments).toEqual([
            { key: 'market', usd: -3, share: 0 },
            { key: 'fees', usd: 8, share: 1 },
        ]);
    });

    it('matches the demo-moderate totals', () => {
        // total 52.0785604695634, fees 41.97630206664916 -> market 10.102258402914238;
        // shares 10.102258402914238 / 52.0785604695634 = 0.19398113757038973 and 0.8060188624296103
        const s = costStrip(T(52.0785604695634, 41.97630206664916))!;
        expect(s.segments[0].usd).toBeCloseTo(10.102258402914238, 12);
        expect(s.segments[0].share).toBeCloseTo(0.19398113757038973, 12);
        expect(s.segments[1].share).toBeCloseTo(0.8060188624296103, 12);
        expect(s.segments[0].share + s.segments[1].share).toBeCloseTo(1, 12);
    });

    it('is null without a total or without fees, and has no widths when nothing is positive', () => {
        expect(costStrip(null)).toBeNull();
        expect(costStrip({ total: null, fees: { usd: 1, bps: 0, n: 1 } })).toBeNull();
        expect(costStrip(T(4, null))).toBeNull();
        // total 0, fees 0 -> market 0; positive sum 0 -> both shares 0 (the screen prints the sentence only)
        expect(costStrip(T(0, 0))!.segments.map(x => x.share)).toEqual([0, 0]);
    });
});

import { describe, it, expect } from 'vitest';
import { hourSummary, describePeriod, describeWindow, buildCoach } from '../coach';

const at = (hourUtc: number, fillScore: number | null) => ({
    executedAt: new Date(Date.UTC(2026, 8, 10, hourUtc, 30)),
    fillScore,
});

describe('hourSummary', () => {
    it('averages the fill score of the trades executed in that UTC hour', () => {
        const trades = [at(9, 90), at(9, 80), at(9, 70), at(14, 50)];
        expect(hourSummary(trades, 9)).toEqual({ avgScore: 80, count: 3 });
        expect(hourSummary(trades, 14)).toEqual({ avgScore: 50, count: 1 });
    });

    it('ignores trades with no score', () => {
        expect(hourSummary([at(9, 90), at(9, null)], 9)).toEqual({ avgScore: 90, count: 1 });
    });

    it('returns null for an hour with no scored trades', () => {
        expect(hourSummary([at(9, 90)], 3)).toBeNull();
        expect(hourSummary([], 9)).toBeNull();
    });

    it('rounds the average to a whole number', () => {
        expect(hourSummary([at(5, 80), at(5, 81)], 5)).toEqual({ avgScore: 81, count: 2 });
    });

    it('accepts ISO strings as stored in lean documents', () => {
        const trades = [{ executedAt: '2026-09-10T09:15:00.000Z' as unknown as Date, fillScore: 60 }];
        expect(hourSummary(trades, 9)).toEqual({ avgScore: 60, count: 1 });
    });
});

describe('describePeriod', () => {
    const day = 24 * 60 * 60 * 1000;
    const start = new Date('2026-09-01T00:00:00Z');

    it('states the audited span in whole days', () => {
        expect(describePeriod({ start, end: new Date(start.getTime() + 29 * day) })).toBe('29 days');
    });

    it('uses the singular for one day and never says zero days', () => {
        expect(describePeriod({ start, end: new Date(start.getTime() + day) })).toBe('1 day');
        expect(describePeriod({ start, end: start })).toBe('1 day');
    });

    it('rounds partial days to the nearest day', () => {
        expect(describePeriod({ start, end: new Date(start.getTime() + 29.4 * day) })).toBe('29 days');
        expect(describePeriod({ start, end: new Date(start.getTime() + 29.6 * day) })).toBe('30 days');
    });
});

describe('describeWindow', () => {
    it('quotes the measured average and trade count', () => {
        expect(describeWindow({ avgScore: 88, count: 12 })).toBe('avg score 88 across 12 trades');
    });

    it('uses the singular for one trade', () => {
        expect(describeWindow({ avgScore: 70, count: 1 })).toBe('avg score 70 across 1 trade');
    });

    it('returns null when there is nothing to quote', () => {
        expect(describeWindow(null)).toBeNull();
    });
});

describe('buildCoach ORDER_TYPE (4R-0b: fees actually paid on taker fills)', () => {
    const f = (isMaker: boolean, feeUsd: number) => ({ executedAt: new Date('2026-01-05T09:00:00Z'), fillScore: 70, isMaker, feeUsd });
    it('ranks and words the action by taker fees paid, not a hypothetical', () => {
        // taker fees: 3 + 5 = 8 (the maker fill's 1 is excluded); total feeCost 9 would give the old
        // hypothetical 9 * (0.7 - 0.4) = 2.7, which must no longer be used.
        const out = buildCoach({
            breakdown: { bestHour: null, worstHour: null, makerRatio: 0.4 },
            periodText: '31 days',
            trades: [f(false, 3), f(false, 5), f(true, 1)] as any,
            attribution: { timingCost: 0, feeCost: 9, totalNotional: 3000 },
            venue: null,
        });
        const a = out.actions.find(x => x.category === 'ORDER_TYPE')!;
        expect(a.impactValue).toBe(8);
        expect(a.estimatedImpact).toBe('$8.00 fees paid on taker fills over 31 days');
        expect(out.headline).toBe('Taker fills paid $8.00 in fees over 31 days');
    });
});

describe('buildCoach headline (2c.2 C3)', () => {
    it('reads "driver, ~$N over period" with no nested parentheses; the badge keeps (modelled)', () => {
        // timingCost 1.4 -> Math.round = 1 -> "~$1"; periodText "31 days" -> " over 31 days"
        const out = buildCoach({
            breakdown: { bestHour: 9, worstHour: 14, makerRatio: null },
            periodText: '31 days',
            trades: [at(9, 90), at(14, 50)],
            attribution: { timingCost: 1.4, feeCost: 0, totalNotional: 1000 },
            venue: null,
        });
        // 4R-0 (audit §2.10): the flat timing $ figure is removed, so timing is never the headline driver
        expect(out.headline).toBe('No modelled cost driver stood out in this period.');
        expect(out.actions[0].estimatedImpact).toBe('Impact not measured');
    });
});

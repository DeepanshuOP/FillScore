import { describe, it, expect } from 'vitest';
import { buildExceptionQueue, ExceptionOrder } from '../exceptionQueue';
import { findAdviceTerms, findConnectiveTerms } from '../../constants/adviceTerms';

// M4 §2 (E1, C3): which stored orders are worth a second look, each with a one-line finding built from the stored numbers.
//
// Base fixture: 20 measured orders with total cost 1..20 bps, each of intended notional 10,000 USD.
//   median = (10 + 11) / 2 = 10.5
//   90th percentile (linear, position 0.9 * 19 = 17.1 between the 18th and 19th value): 18 + 0.1 * (19 - 18) = 18.1
//   orders above 18.1: the 19 and the 20 bps orders. USD = bps x 10,000 / 10,000: $19.00 and $20.00.
const sf = (total: number, over: Record<string, number | null> = {}) => ({
    executionBps: total, spreadBps: total / 2, impactTimingBps: total / 2, opportunityBps: 0, feesBps: 0, totalBps: total, intendedNotional: 10000, fillRatio: 1, ...over,
});
const order = (id: string, total: number, extra: Partial<ExceptionOrder> = {}): ExceptionOrder => ({
    orderId: id, symbol: 'BTCUSDT', type: 'LIMIT', status: 'FILLED', shortfall: sf(total), expectedCost: null, ...extra,
});
const base = () => Array.from({ length: 20 }, (_, i) => order(`o${i + 1}`, i + 1));

describe('high total cost (the account\'s own 90th percentile, minimum 20 orders)', () => {
    it('lists the two orders above 18.1 bps, dearest in USD first, with a finding that places the stored numbers', () => {
        const q = buildExceptionQueue(base());
        expect(q.items.map(i => [i.orderId, i.usd])).toEqual([['o20', 20], ['o19', 19]]);
        expect(q.items[0].rules).toEqual(['high-total-cost']);
        expect(q.items[0].finding).toBe("This order's total cost was 20.0 bps against a median of 10.5 bps for the account's 20 measured orders (its 90th percentile was 18.1 bps).");
        expect(q.thresholds!.minOrders).toBe(20);
        expect(q.thresholds!.p90TotalBps).toBeCloseTo(18.1, 9);
        expect(q.checked).toBe(20);
    });
    it('an order equal to the 90th percentile is not an exception (the comparison is strict)', () => {
        const same = Array.from({ length: 20 }, (_, i) => order(`s${i}`, 5));                          // all equal: p90 = 5, none above it
        expect(buildExceptionQueue(same).items).toEqual([]);
    });
    it('the percentile is interpolated linearly', () => {
        // totals 1..18, 18.1, 20 -> position 17.1 lies between the 18th value (18) and the 19th (18.1): 18 + 0.1 x 0.1 = 18.01
        const q = buildExceptionQueue(base().map(o => o.orderId === 'o19' ? { ...o, shortfall: sf(18.1) } : o));
        expect(q.thresholds!.p90TotalBps).toBeCloseTo(18.01, 9);
        expect(q.items.map(i => i.orderId)).toEqual(['o20', 'o19']);                                    // 18.1 is above 18.01
    });
    it('with fewer than 20 measured orders there is no percentile rule: "insufficient data", not a guess', () => {
        const q = buildExceptionQueue(base().slice(0, 19));
        expect(q.items).toEqual([]);
        expect(q.thresholds).toBeNull();
        expect(q.note).toBe('Insufficient data: fewer than 20 measured orders, so no order is compared with the account\'s own distribution.');
    });
    it('orders without a measurement are counted as skipped, never scored as zero', () => {
        const q = buildExceptionQueue([...base(), order('u1', 0, { shortfall: null }), order('u2', 0, { shortfall: null })]);
        expect(q.checked).toBe(20);
        expect(q.skipped).toBe(2);
    });
});

describe('above the expected interval (market orders)', () => {
    const ec = { applies: true, expectedBps: 4.1, lowBps: 2.0, highBps: 6.2, level: 0.9, bucket: 'lt1k' };
    it('lists a market order whose execution cost is above the interval, with the interval in the finding', () => {
        const q = buildExceptionQueue([order('m1', 12.3, { type: 'MARKET', expectedCost: ec, shortfall: sf(12.3, { executionBps: 12.3 }) })]);
        expect(q.items).toHaveLength(1);
        expect(q.items[0].rules).toEqual(['above-expected-interval']);
        expect(q.items[0].finding).toBe('This market order cost 12.3 bps in execution; the modelled cost of a taker event of the same size in the hour before the order was 4.1 bps (90% interval 2.0 bps to 6.2 bps for one event).');
    });
    it('exactly at the upper end is not an exception; below it is not either; no interval means no rule', () => {
        const at = order('m2', 6.2, { type: 'MARKET', expectedCost: ec, shortfall: sf(6.2, { executionBps: 6.2 }) });
        expect(buildExceptionQueue([at]).items).toEqual([]);
        const noInterval = order('m3', 12.3, { type: 'MARKET', expectedCost: { ...ec, lowBps: null, highBps: null }, shortfall: sf(12.3) });
        expect(buildExceptionQueue([noInterval]).items).toEqual([]);
        expect(buildExceptionQueue([order('m4', 12.3, { type: 'MARKET', expectedCost: { applies: false, expectedBps: null, lowBps: null, highBps: null, level: 0.9, bucket: null } })]).items).toEqual([]);
    });
});

describe('unfilled orders with a cost', () => {
    it('lists an unfilled order above the 90th percentile, with its status and USD cost', () => {
        // totals 1..19 and one unfilled order at 50 bps of 2,000 USD: p90 = 18.1; 50 x 2,000 / 10,000 = $10.00
        const unfilled = order('u', 50, { status: 'CANCELED', shortfall: sf(50, { executionBps: 0, opportunityBps: 50, fillRatio: 0, intendedNotional: 2000 }) });
        const q = buildExceptionQueue([...base().slice(0, 19), unfilled]);
        const item = q.items.find(i => i.orderId === 'u')!;
        expect(item.rules).toEqual(['unfilled-cost']);
        expect(item.usd).toBeCloseTo(10, 9);
        expect(item.finding).toBe('This order never filled and ended CANCELED; its unfilled part cost 50.0 bps (about $10.00).');   // "opportunity" is a counterfactual word: not used in copy
    });
});

describe('an order that meets two rules (review finding 9)', () => {
    it('lists both rules and both sentences', () => {
        const ec = { applies: true, expectedBps: 4.1, lowBps: 2.0, highBps: 6.2, level: 0.9, bucket: 'lt1k' };
        const q = buildExceptionQueue([...base().slice(0, 19), order('m1', 30, { type: 'MARKET', expectedCost: ec, shortfall: sf(30, { executionBps: 30 }) })]);
        const m1 = q.items.find(i => i.orderId === 'm1')!;
        expect(m1.rules).toEqual(['above-expected-interval', 'high-total-cost']);
        expect(m1.finding).toContain('This market order cost 30.0 bps in execution');
        expect(m1.finding).toContain("This order's total cost was 30.0 bps");
    });
});

describe('every finding is past tense, with no advice and no cause', () => {
    it('passes the advice and connective detectors', () => {
        const ec = { applies: true, expectedBps: 4.1, lowBps: 2.0, highBps: 6.2, level: 0.9, bucket: 'lt1k' };
        const unfilled = order('u', 50, { status: 'EXPIRED', shortfall: sf(50, { opportunityBps: 50, fillRatio: 0 }) });
        const q = buildExceptionQueue([...base(), unfilled, order('m1', 12.3, { type: 'MARKET', expectedCost: ec, shortfall: sf(12.3) })]);
        expect(q.items.length).toBeGreaterThan(2);
        for (const i of q.items) {
            expect(findAdviceTerms(i.finding)).toEqual([]);
            expect(findConnectiveTerms(i.finding)).toEqual([]);
        }
    });
});

describe('the queue is capped and says what it covered', () => {
    it('lists at most 20 items and says how many met a rule', () => {
        // totals 1..210: p90 at position 0.9 x 209 = 188.1 -> 189 + 0.1 x (190 - 189) = 189.1; above it: 190..210 = 21 orders
        const q = buildExceptionQueue(Array.from({ length: 210 }, (_, i) => order(`c${i + 1}`, i + 1)));
        expect(q.items).toHaveLength(20);
        expect(q.total).toBe(21);
        expect(q.items[0].orderId).toBe('c210');
        expect(q.items[19].orderId).toBe('c191');                                  // the 21st (c190, the cheapest of them) is cut
    });
});

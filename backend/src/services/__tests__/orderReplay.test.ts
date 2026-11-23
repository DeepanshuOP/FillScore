import { describe, it, expect } from 'vitest';
import { buildOrderReplay } from '../orderReplay';
import { findAdviceTerms, findConnectiveTerms } from '../../constants/adviceTerms';

// M4 §1 (A6, E2): the replay of one order. Every figure is a stored value; each carries the field it came from, and the market
// data behind it carries its public file and SHA-256. USD = bps x intended notional / 10,000.
// Fixture: intended notional 20,000 USD.
//   execution 3.0 bps  = 3.0 x 20000 / 10000 = $6.00   (spread 1.0 -> $2.00, impact and timing 2.0 -> $4.00)
//   unfilled  0.5 bps  = $1.00
//   fees      7.5 bps  = $15.00
//   total    11.0 bps  = $22.00   (execution + unfilled + fees = 3.0 + 0.5 + 7.5 = 11.0 bps)
const order = { orderId: 'o1', symbol: 'BTCUSDT', exchange: 'binance', type: 'MARKET', side: 'BUY', origQty: 0.5, executedQty: 0.5, status: 'FILLED',
    restingMs: null, createdAt: new Date('2024-01-15T14:00:00.000Z'), updatedAt: new Date('2024-01-15T14:00:02.000Z') };
const fills = [
    { tradeId: 't1', executionPrice: 40000, quantity: 0.3, executedAt: new Date('2024-01-15T14:00:01.100Z'), feeUsd: 9, isMaker: false },
    { tradeId: 't2', executionPrice: 40010, quantity: 0.2, executedAt: new Date('2024-01-15T14:00:01.900Z'), feeUsd: 6, isMaker: false },
];
const m = {
    version: '1.0.0', arrivalMid: 39995, endMid: null, endBasis: 'filled', unmeasuredReason: null,
    shortfall: { executionBps: 3.0, spreadBps: 1.0, impactTimingBps: 2.0, opportunityBps: 0.5, feesBps: 7.5, totalBps: 11.0, intendedNotional: 20000, fillRatio: 1, delayBps: null, delayReason: 'no decision timestamp' },
    expectedCost: { version: 'ec1.0.0', calibrationSha256: 'c'.repeat(64), applies: true, expectedBps: 2.5, lowBps: 1.0, highBps: 4.0, level: 0.9, bucket: '10k-100k', reason: null },
    marketDataRefs: [
        { source: 'data.binance.vision', dataset: 'spot/daily/aggTrades', symbol: 'BTCUSDT', date: '2024-01-15', window: null, sha256: 'a'.repeat(64) },
        { source: 'api.binance.com', dataset: 'api/v3/aggTrades', symbol: 'BTCUSDT', date: null, window: [1705327200000, 1705327230000], sha256: 'b'.repeat(64) },
    ],
};

describe('buildOrderReplay', () => {
    const r = buildOrderReplay({ order, fills, measurement: m });
    it('states each term of the shortfall in bps and USD, summing to the total', () => {
        const by = Object.fromEntries(r.decomposition.map(x => [x.key, x]));
        expect(by.execution.usd).toBeCloseTo(6, 9);
        expect(by.spread.usd).toBeCloseTo(2, 9);
        expect(by.impactTiming.usd).toBeCloseTo(4, 9);
        expect(by.unfilled.usd).toBeCloseTo(1, 9);
        expect(by.fees.usd).toBeCloseTo(15, 9);
        expect(by.total.usd).toBeCloseTo(22, 9);
        expect(by.execution.bps + by.unfilled.bps + by.fees.bps).toBeCloseTo(by.total.bps, 9);
    });
    it('every figure names the stored field it came from', () => {
        const by = Object.fromEntries(r.decomposition.map(x => [x.key, x]));
        expect(by.execution.source).toEqual({ kind: 'order-measurement', field: 'shortfall.executionBps' });
        expect(by.fees.source).toEqual({ kind: 'order-measurement', field: 'shortfall.feesBps' });
        expect(r.expectedCost!.source).toEqual({ kind: 'order-measurement', field: 'expectedCost', version: 'ec1.0.0', calibrationSha256: 'c'.repeat(64) });
    });
    it('the market data behind the figures opens its public source with its SHA-256', () => {
        expect(r.sources[0]).toEqual({ kind: 'public-market-data', label: 'Binance daily trades file, BTCUSDT, 2024-01-15', sha256: 'a'.repeat(64),
            url: 'https://data.binance.vision/data/spot/daily/aggTrades/BTCUSDT/BTCUSDT-aggTrades-2024-01-15.zip' });
        // design v5 step 0: the public link opens the same endpoint on data-api.binance.vision (listed there by Binance,
        // faqs/market_data_only.md, read 2026-11-23), for windows stored before the move (source api.binance.com) and after it
        expect(r.sources[1].url).toBe('https://data-api.binance.vision/api/v3/aggTrades?symbol=BTCUSDT&startTime=1705327200000&endTime=1705327230000');
        expect(r.sources[1].sha256).toBe('b'.repeat(64));
    });
    it('a window stored with source data-api.binance.vision opens the same link and label', () => {
        const ref = { source: 'data-api.binance.vision', dataset: 'api/v3/aggTrades', symbol: 'BTCUSDT', date: null, window: [1705327200000, 1705327230000], sha256: 'd'.repeat(64) };
        const r2 = buildOrderReplay({ order, fills, measurement: { ...m, marketDataRefs: [ref] } });
        expect(r2.sources[0]).toEqual({ kind: 'public-market-data', sha256: 'd'.repeat(64),
            label: 'Binance public trades window, BTCUSDT, 2024-01-15T14:00:00.000Z to 2024-01-15T14:00:30.000Z',
            url: 'https://data-api.binance.vision/api/v3/aggTrades?symbol=BTCUSDT&startTime=1705327200000&endTime=1705327230000' });
    });
    it('lists the fills with price, size, notional, time and fee, in time order', () => {
        expect(r.fills.map(f => [f.tradeId, f.notional, f.feeUsd])).toEqual([['t1', 12000, 9], ['t2', 8002, 6]]);
        expect(r.fills[0].time).toBe('2024-01-15T14:00:01.100Z');
    });
    it('says the delay is not measurable, in the audit\'s own words', () => {
        expect(r.notes).toContain('Delay cost: not measured (no decision timestamp).');
    });
    it('has no advice and no causal wording anywhere in its text', () => {
        const text = JSON.stringify(r.notes) + JSON.stringify(r.decomposition.map(x => x.label)) + JSON.stringify(r.sources.map(s => s.label));
        expect(findAdviceTerms(text)).toEqual([]);
        expect(findConnectiveTerms(text)).toEqual([]);
    });
});

describe('buildOrderReplay without a measurement', () => {
    it('says so: no figure is invented', () => {
        const r = buildOrderReplay({ order, fills, measurement: null });
        expect(r.decomposition).toEqual([]);
        expect(r.expectedCost).toBeNull();
        expect(r.sources).toEqual([]);
        expect(r.notes).toContain('Insufficient data: this order has no stored measurement.');
        expect(r.fills).toHaveLength(2);
    });
    it('an unmeasured order carries the stored reason', () => {
        const r = buildOrderReplay({ order, fills, measurement: { ...m, shortfall: null, unmeasuredReason: 'no fresh print before the order\'s arrival time' } });
        expect(r.decomposition).toEqual([]);
        expect(r.notes).toContain('Not measured: no fresh print before the order\'s arrival time.');
        expect(r.sources).toHaveLength(2);                                   // the data that was looked at is still linked
    });
    it('a stored market-data window with a bad time does not break the replay (review finding 8)', () => {
        const refs = [{ source: 'api.binance.com', dataset: 'api/v3/aggTrades', symbol: 'BTCUSDT', date: null, window: ['x', null], sha256: 'b'.repeat(64) }];
        const r = buildOrderReplay({ order, fills, measurement: { ...m, marketDataRefs: refs as any } });
        expect(r.sources).toHaveLength(1);
        expect(r.sources[0].url).toBeNull();
        expect(r.sources[0].sha256).toBe('b'.repeat(64));
        expect(r.decomposition.length).toBeGreaterThan(0);
    });
    it('a term that was not computed is "not computed", never zero', () => {
        const r = buildOrderReplay({ order, fills, measurement: { ...m, shortfall: { ...m.shortfall, spreadBps: null, impactTimingBps: null } } });
        const spread = r.decomposition.find(x => x.key === 'spread')!;
        expect(spread.bps).toBeNull();
        expect(spread.usd).toBeNull();
    });
    it('an expected cost that does not apply says why and shows no number', () => {
        const r = buildOrderReplay({ order, fills, measurement: { ...m, expectedCost: { ...m.expectedCost, applies: false, expectedBps: null, lowBps: null, highBps: null, reason: 'not a market order: the model is calibrated on taker events, so resting orders are outside it' } } });
        expect(r.expectedCost).toMatchObject({ applies: false, expectedBps: null, reason: expect.stringContaining('resting orders are outside it') });
    });
});

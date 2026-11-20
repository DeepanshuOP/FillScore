import { describe, it, expect } from 'vitest';
import { describeQueue, describeRankings, describeReplay, nextStates, PANEL_COPY } from './explainView';

// M4: the exception queue, the rankings and the order replay as text. Every number comes from the API; the sentences only
// arrange them, in past tense, and a value that was not computed reads "not computed" or "insufficient data".
const item = (over = {}) => ({ orderId: 'o22', symbol: 'BTCUSDT', rules: ['high-total-cost'], finding: "This order's total cost was 22.0 bps.", usd: 22, totalBps: 22, state: 'open', ...over });
const queue = (over = {}) => ({ items: [item()], total: 3, checked: 27, skipped: 2, thresholds: { minOrders: 20, p90TotalBps: 19.4 }, note: null,
    reviewCounts: { open: 3, reviewed: 0, dismissed: 0 }, ...over });

// Review finding 3: panel headings are copy too. The terms are those of ml-service/agents/claims.py (advice and counterfactual).
describe('the static copy of the panel', () => {
  const ADVICE = /\b(should|recommend\w*|consider|better to|ought|must|needs? to|switch to|worth|opportunit\w*|could (have|save)|would (have|save)|saved|savings?|because|due to|caused by)\b/i;
  it('has no advice, call to action or causal word', () => {
    for (const s of Object.values(PANEL_COPY)) expect(s, s).not.toMatch(ADVICE);
  });
  it('names the queue by what it holds', () => {
    expect(PANEL_COPY.queueTitle).toBe('Orders that met a rule');
  });
});

describe('describeQueue', () => {
    it('states what was checked and the threshold it used', () => {
        const v = describeQueue(200, queue());
        expect(v.kind).toBe('items');
        expect(v.summary).toBe('3 of 27 measured orders met a rule (2 orders without a measurement were not checked).');
        expect(v.threshold).toBe("The 90th percentile of the account's own total cost was 19.4 bps; rules that use it need 20 measured orders.");
        expect(v.items[0]).toMatchObject({ orderId: 'o22', usd: '$22.00', ruleLabels: ['High total cost'], stateLabel: 'Open' });
    });
    it('"insufficient data" when the audit gave a note, with no list', () => {
        const v = describeQueue(200, queue({ items: [], thresholds: null, note: 'Insufficient data: fewer than 20 measured orders, so no order is compared with the account\'s own distribution.', checked: 4, total: 0 }));
        expect(v.kind).toBe('insufficient');
        expect(v.note).toMatch(/^Insufficient data/);
        expect(v.items).toEqual([]);
    });
    it('an empty queue over enough orders says nothing met a rule', () => {
        const v = describeQueue(200, queue({ items: [], total: 0 }));
        expect(v.kind).toBe('empty');
        expect(v.summary).toBe('0 of 27 measured orders met a rule (2 orders without a measurement were not checked).');
    });
    it('a failed request is "could not be loaded", not an empty queue', () => {
        expect(describeQueue(500, null).kind).toBe('error');
        expect(describeQueue(401, null).kind).toBe('error');
    });
    it('a demo account sees the same queue and no controls', () => {
        expect(nextStates('open', true)).toEqual([]);
        expect(nextStates('open', false)).toEqual([['reviewed', 'Mark reviewed'], ['dismissed', 'Dismiss']]);
        expect(nextStates('reviewed', false)).toEqual([['open', 'Reopen'], ['dismissed', 'Dismiss']]);
        expect(nextStates('dismissed', false)).toEqual([['open', 'Reopen']]);
    });
});

describe('describeRankings', () => {
    const g = (over = {}) => ({ key: 'BTCUSDT', n: 22, median: 11.5, low: 9.0, high: 14.0, status: 'ranked', rank: 1, tiedWith: [], ...over });
    it('ranked groups state the median, the interval, the count and the rank', () => {
        const v = describeRankings({ by: 'symbol', level: 0.9, minOrders: 20, groups: [g(), g({ key: 'ETHUSDT', median: 12, low: 8, high: 15, rank: 1, tiedWith: ['BTCUSDT'] })] });
        expect(v.rows[0]).toBe('BTCUSDT: median 11.5 bps (90% interval 9.0 bps to 14.0 bps), 22 orders, rank 1.');
        expect(v.rows[1]).toBe('ETHUSDT: median 12.0 bps (90% interval 8.0 bps to 15.0 bps), 22 orders, rank 1; not distinguishable from BTCUSDT.');
    });
    it('a group with too few orders reads "too few to tell" and shows no number', () => {
        const v = describeRankings({ by: 'hour', level: 0.9, minOrders: 20, groups: [g({ key: '14:00 UTC', n: 16, status: 'too-few', median: null, low: null, high: null, rank: null })] });
        expect(v.rows).toEqual(['14:00 UTC: too few to tell (16 orders; 20 are needed).']);
    });
    it('no groups at all is "insufficient data"', () => {
        expect(describeRankings({ by: 'symbol', level: 0.9, minOrders: 20, groups: [] }).rows).toEqual(['Insufficient data: no measured orders.']);
    });
});

describe('describeReplay', () => {
    const replay = {
        order: { orderId: 'o1', symbol: 'BTCUSDT', type: 'MARKET', side: 'BUY', quantity: 0.5, executedQuantity: 0.5, status: 'FILLED', restingMs: null },
        fills: [{ tradeId: 't1', time: '2024-01-15T14:00:01.100Z', price: 40000, quantity: 0.3, notional: 12000, feeUsd: 9, isMaker: false }],
        decomposition: [
            { key: 'execution', label: 'Execution cost', bps: 3, usd: 6, source: { kind: 'order-measurement', field: 'shortfall.executionBps' } },
            { key: 'spread', label: 'Spread paid', bps: null, usd: null, partOf: 'execution', source: { kind: 'order-measurement', field: 'shortfall.spreadBps' } },
        ],
        expectedCost: { applies: true, expectedBps: 2.5, lowBps: 1, highBps: 4, level: 0.9, reason: null },
        sources: [{ kind: 'public-market-data', label: 'Binance daily trades file, BTCUSDT, 2024-01-15', sha256: 'a'.repeat(64), url: 'https://data.binance.vision/x.zip' }],
        notes: ['Delay cost: not measured (no decision timestamp).'],
    };
    it('lists each figure with its source field; a term that was not computed is "not computed"', () => {
        const v = describeReplay(200, replay);
        expect(v.figures).toEqual([
            { label: 'Execution cost', value: '3.0 bps, $6.00', source: 'shortfall.executionBps', indent: false },
            { label: 'Spread paid', value: 'not computed', source: 'shortfall.spreadBps', indent: true },
        ]);
    });
    it('shows the expected cost with its interval, or why it does not apply', () => {
        expect(describeReplay(200, replay).expected).toBe('Modelled cost of a taker event of the same size in the hour before the order: 2.5 bps (90% interval 1.0 bps to 4.0 bps for one event).');
        const none = { ...replay, expectedCost: { applies: false, expectedBps: null, lowBps: null, highBps: null, level: 0.9, reason: 'not a market order: the model is calibrated on taker events, so resting orders are outside it' } };
        expect(describeReplay(200, none).expected).toBe('Expected cost: insufficient data (not a market order: the model is calibrated on taker events, so resting orders are outside it).');
        expect(describeReplay(200, { ...replay, expectedCost: null }).expected).toBeNull();
    });
    it('links each market-data source with the first and last characters of its SHA-256', () => {
        expect(describeReplay(200, replay).sources).toEqual([{ label: 'Binance daily trades file, BTCUSDT, 2024-01-15', url: 'https://data.binance.vision/x.zip', hash: 'aaaaaaaa…aaaa' }]);
    });
    it('keeps the notes and says when the order was not found', () => {
        expect(describeReplay(200, replay).notes).toEqual(['Delay cost: not measured (no decision timestamp).']);
        expect(describeReplay(404, null).error).toBe('This order was not found for this account.');
        expect(describeReplay(500, null).error).toBe('The replay could not be loaded.');
    });
});

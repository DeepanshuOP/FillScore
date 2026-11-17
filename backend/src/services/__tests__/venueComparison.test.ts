import { describe, it, expect } from 'vitest';
import { matchedVenueComparison, notionalBucket } from '../venueComparison';

// M4 §4: the user's own past fills, matched by symbol and size bucket, compared across venues; never pooled across buckets.
// Every group needs 20 fills to be ranked. Constant groups give exact intervals:
//   binance 20 fills of 1.0 bps, bybit 20 fills of 3.0 bps in BTCUSDT 1k-10k:
//   intervals [1, 1] and [3, 3] do not overlap, so binance rank 1 and bybit rank 1 + 1 = 2.
const fills = (exchange: string, symbol: string, notional: number, cost: number, n: number) =>
    Array.from({ length: n }, () => ({ exchange, symbol, notional, costBps: cost }));

describe('notionalBucket', () => {
    it('uses the same edges as the scoring buckets', () => {
        expect([999.99, 1000, 9999, 10000, 99999, 100000].map(notionalBucket)).toEqual(['lt1k', '1k-10k', '1k-10k', '10k-100k', '10k-100k', 'ge100k']);
    });
});

describe('matchedVenueComparison', () => {
    it('with fills on one venue only there is nothing to compare', () => {
        const r = matchedVenueComparison(fills('binance', 'BTCUSDT', 5000, 1, 30));
        expect(r.available).toBe(false);
        expect(r.note).toBe('Insufficient data: fills with a measured cost exist on one venue only, so there is nothing to compare.');
        expect(r.buckets).toEqual([]);
    });
    it('ranks two venues in a matched bucket, cheaper first, with the rank counting the clearly cheaper venues', () => {
        const r = matchedVenueComparison([...fills('binance', 'BTCUSDT', 5000, 1, 20), ...fills('bybit', 'BTCUSDT', 5000, 3, 20)]);
        expect(r.available).toBe(true);
        expect(r.buckets).toHaveLength(1);
        const b = r.buckets[0];
        expect([b.symbol, b.bucket, b.comparable]).toEqual(['BTCUSDT', '1k-10k', true]);
        expect(b.venues.map(v => [v.key, v.rank, v.median])).toEqual([['binance', 1, 1], ['bybit', 2, 3]]);
    });
    it('a venue with 19 fills in the bucket is "too few to tell", and the bucket is not comparable', () => {
        const r = matchedVenueComparison([...fills('binance', 'BTCUSDT', 5000, 1, 20), ...fills('bybit', 'BTCUSDT', 5000, 3, 19)]);
        const b = r.buckets[0];
        expect(b.comparable).toBe(false);
        expect(b.venues.find(v => v.key === 'bybit')).toMatchObject({ status: 'too-few', n: 19, rank: null, median: null });
        expect(b.note).toBe('Too few to tell: a venue has fewer than 20 fills in this bucket.');
    });
    it('keeps symbols and size buckets apart: nothing is pooled', () => {
        const r = matchedVenueComparison([
            ...fills('binance', 'BTCUSDT', 5000, 1, 20), ...fills('bybit', 'BTCUSDT', 5000, 3, 20),
            ...fills('binance', 'ETHUSDT', 500, 2, 20), ...fills('bybit', 'ETHUSDT', 500, 2, 20),
        ]);
        expect(r.buckets.map(b => `${b.symbol}:${b.bucket}`)).toEqual(['BTCUSDT:1k-10k', 'ETHUSDT:lt1k']);
        const eth = r.buckets[1];
        expect(eth.venues.map(v => v.rank)).toEqual([1, 1]);                  // equal groups: not distinguishable, same rank
        expect(eth.venues[0].tiedWith.length).toBe(1);
    });
    it('a bucket that exists on one venue only is listed as not comparable', () => {
        const r = matchedVenueComparison([...fills('binance', 'BTCUSDT', 5000, 1, 20), ...fills('bybit', 'BTCUSDT', 5000, 3, 20), ...fills('binance', 'SOLUSDT', 50, 1, 25)]);
        const sol = r.buckets.find(b => b.symbol === 'SOLUSDT')!;
        expect(sol.comparable).toBe(false);
        expect(sol.note).toBe('Not comparable: only one venue has fills in this bucket.');
    });
    it('a venue whose fills all lack a measured cost does not make the comparison "available" (review finding 5)', () => {
        const r = matchedVenueComparison([...fills('binance', 'BTCUSDT', 5000, 1, 30),
            ...Array.from({ length: 30 }, () => ({ exchange: 'bybit', symbol: 'BTCUSDT', notional: 5000, costBps: null as number | null }))]);
        expect(r.available).toBe(false);
        expect(r.note).toBe('Insufficient data: fills with a measured cost exist on one venue only, so there is nothing to compare.');
    });
    it('ignores fills with no measured cost (never counts them as zero)', () => {
        const r = matchedVenueComparison([...fills('binance', 'BTCUSDT', 5000, 1, 20), ...fills('bybit', 'BTCUSDT', 5000, 3, 20),
            ...Array.from({ length: 50 }, () => ({ exchange: 'bybit', symbol: 'BTCUSDT', notional: 5000, costBps: null as number | null }))]);
        expect(r.buckets[0].venues.find(v => v.key === 'bybit')!.n).toBe(20);
    });
});

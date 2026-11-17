import { describe, it, expect } from 'vitest';
import { rankWithNoise, medianInterval } from '../rankWithNoise';

// M4 §3 (A8): a ranking that says "too few to tell" and does not rank groups whose intervals overlap.
// Hand-computed with constant groups, where every bootstrap resample has the same median:
//   A = six values of 1, B = six values of 3, C = six values of 1  (minN = 5)
//   intervals: A [1, 1], B [3, 3], C [1, 1]
//   A and C overlap (both [1, 1]): neither is clearly cheaper than the other. B is clearly dearer than both.
//   rank = 1 + number of groups that are clearly cheaper:  A 1, C 1, B 1 + 2 = 3.
const rep = (v: number, n: number) => Array.from({ length: n }, () => v);

describe('medianInterval', () => {
    it('is the value itself for a constant group', () => {
        expect(medianInterval(rep(2, 6))).toEqual({ n: 6, median: 2, low: 2, high: 2 });
    });
    it('median of 1,2,3,4,5 is 3 and the interval contains it', () => {
        const r = medianInterval([1, 2, 3, 4, 5]);
        expect(r.median).toBe(3);
        expect(r.low).toBeLessThanOrEqual(3);
        expect(r.high).toBeGreaterThanOrEqual(3);
        expect(r.low).toBeGreaterThanOrEqual(1);
        expect(r.high).toBeLessThanOrEqual(5);
    });
    it('is the same every time (seeded)', () => {
        const v = [4.2, 1.1, 9.3, 2.7, 3.3, 8.8, 0.4];
        expect(medianInterval(v)).toEqual(medianInterval(v));
    });
    it('ignores values that are not finite numbers', () => {
        expect(medianInterval([1, NaN, 3, Infinity, 5]).n).toBe(3);
    });
    it('an empty group has no median', () => {
        expect(medianInterval([])).toEqual({ n: 0, median: null, low: null, high: null });
    });
});

describe('medianInterval on a big group (review finding 1: it ran 2,000 sorts of the whole group and froze the server)', () => {
    const big = Array.from({ length: 20000 }, (_, i) => ((i * 7919) % 1000) / 10);        // 0..99.9, deterministic
    it('is fast: a 20,000-order group answers in well under a second', () => {
        const t0 = Date.now();
        const r = medianInterval(big);
        expect(Date.now() - t0).toBeLessThan(1000);
        expect(r.n).toBe(20000);
    });
    it('keeps the exact median of all values and an interval around it; deterministic', () => {
        const r = medianInterval(big);
        const sorted = [...big].sort((a, b) => a - b);
        expect(r.median).toBeCloseTo((sorted[9999] + sorted[10000]) / 2, 9);
        expect(r.low!).toBeLessThanOrEqual(r.median!);
        expect(r.high!).toBeGreaterThanOrEqual(r.median!);
        expect(medianInterval(big)).toEqual(r);
    });
    it('a group of up to 400 values is bootstrapped whole (nothing is dropped)', () => {
        const v = Array.from({ length: 400 }, (_, i) => (i * 37) % 101);
        expect(medianInterval(v)).toEqual(medianInterval([...v]));
    });
});

describe('rankWithNoise', () => {
    const groups = [{ key: 'A', values: rep(1, 6) }, { key: 'B', values: rep(3, 6) }, { key: 'C', values: rep(1, 6) }];
    it('ranks by 1 + the number of groups that are clearly cheaper, and lists the groups it cannot tell apart', () => {
        const r = rankWithNoise(groups, { minN: 5 });
        const by = Object.fromEntries(r.map(x => [x.key, x]));
        expect([by.A.rank, by.C.rank, by.B.rank]).toEqual([1, 1, 3]);
        expect(by.A.tiedWith).toEqual(['C']);
        expect(by.B.tiedWith).toEqual([]);
        expect(r.map(x => x.key)).toEqual(['A', 'C', 'B']);                // cheapest first, ties in input order
    });
    it('a group with fewer than minN values is "too few to tell": no median, no rank', () => {
        const r = rankWithNoise([...groups, { key: 'D', values: rep(0.5, 4) }], { minN: 5 });
        const d = r.find(x => x.key === 'D')!;
        expect(d).toMatchObject({ status: 'too-few', n: 4, median: null, low: null, high: null, rank: null, tiedWith: [] });
        expect(r[r.length - 1].key).toBe('D');                              // listed last
        expect(r.find(x => x.key === 'B')!.rank).toBe(3);                    // D never counts as "clearly cheaper"
    });
    it('exactly minN values is enough, one fewer is not', () => {
        expect(rankWithNoise([{ key: 'E', values: rep(1, 5) }], { minN: 5 })[0].status).toBe('ranked');
        expect(rankWithNoise([{ key: 'E', values: rep(1, 4) }], { minN: 5 })[0].status).toBe('too-few');
    });
    it('overlapping groups share a rank', () => {
        const r = rankWithNoise([{ key: 'X', values: [1, 2, 3, 4, 5, 6] }, { key: 'Y', values: [2, 3, 4, 5, 6, 7] }], { minN: 5 });
        expect(r.map(x => x.rank)).toEqual([1, 1]);
        expect(r[0].tiedWith).toEqual(['Y']);
    });
    it('the default minimum sample is 20', () => {
        expect(rankWithNoise([{ key: 'F', values: rep(1, 19) }])[0].status).toBe('too-few');
        expect(rankWithNoise([{ key: 'F', values: rep(1, 20) }])[0].status).toBe('ranked');
    });
});

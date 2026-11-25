/**
 * Noise-aware ranking (M4 §3, roadmap A8): a group is ranked only when it has enough orders, and two groups whose intervals
 * overlap are not ranked apart. Pure statistics over numbers that deterministic code already stored; nothing here predicts
 * anything. A group with too few values has no median and no rank ("too few to tell"), never a made-up number.
 *
 * interval = seeded bootstrap of the median (2,000 resamples, fixed seed, 5th and 95th percentile: a 90% interval), so the
 * answer is the same every time.
 * rank     = 1 + the number of ranked groups that are clearly cheaper (their interval lies entirely below this group's).
 */
import { quantile } from './orderSummary';

export const MIN_GROUP_N = 20;
const RESAMPLES = 2000;
const SEED = 20240101;
/** The level of the bootstrap interval (a 90% interval). The rankings route serves it, and the page words it from the same value. */
export const RANK_LEVEL = 0.9;
const LEVEL = RANK_LEVEL;

/** mulberry32: a small seeded generator (the same one the demo build uses). */
function mulberry32(a: number): () => number {
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const median = (v: number[]): number => quantile(v, 0.5) as number;

export interface MedianInterval { n: number; median: number | null; low: number | null; high: number | null }

/** The bootstrap runs on at most this many values. Resampling a whole group of thousands of orders 2,000 times blocked the
 *  server for seconds (review finding 1); a deterministic stride sample keeps the answer the same every time and the
 *  interval honest (it is a little wider than with all values, never narrower). The median is always of ALL values. */
export const MAX_BOOTSTRAP_VALUES = 400;

export function medianInterval(values: number[]): MedianInterval {
    const x = values.filter(v => typeof v === 'number' && Number.isFinite(v));
    if (x.length === 0) return { n: 0, median: null, low: null, high: null };
    const m = median(x);
    if (x.every(v => v === x[0])) return { n: x.length, median: m, low: m, high: m };
    const k = Math.ceil(x.length / MAX_BOOTSTRAP_VALUES);                       // stride; 1 when the group is small enough
    const s0 = k === 1 ? x : x.filter((_, i) => i % k === 0);
    const rnd = mulberry32(SEED);
    const meds: number[] = [];
    for (let b = 0; b < RESAMPLES; b++) {
        const s = new Array<number>(s0.length);
        for (let i = 0; i < s0.length; i++) s[i] = s0[Math.floor(rnd() * s0.length)];
        meds.push(median(s));
    }
    return { n: x.length, median: m, low: quantile(meds, (1 - LEVEL) / 2), high: quantile(meds, (1 + LEVEL) / 2) };
}

export interface RankedGroup extends MedianInterval {
    key: string;
    status: 'ranked' | 'too-few';
    rank: number | null;
    /** Keys of the ranked groups whose interval overlaps this one's: not distinguishable from it. */
    tiedWith: string[];
}

export function rankWithNoise(groups: Array<{ key: string; values: number[] }>, opts: { minN?: number } = {}): RankedGroup[] {
    const minN = opts.minN ?? MIN_GROUP_N;
    const stats = groups.map((g, i) => ({ g, i, s: medianInterval(g.values) }));
    const ranked = stats.filter(x => x.s.n >= minN);
    const rows: Array<RankedGroup & { _i: number }> = ranked.map(x => {
        const clearlyCheaper = ranked.filter(o => o !== x && (o.s.high as number) < (x.s.low as number));
        const tied = ranked.filter(o => o !== x && !((o.s.high as number) < (x.s.low as number)) && !((x.s.high as number) < (o.s.low as number)));
        return { key: x.g.key, ...x.s, status: 'ranked' as const, rank: 1 + clearlyCheaper.length, tiedWith: tied.map(o => o.g.key), _i: x.i };
    });
    rows.sort((a, b) => (a.median as number) - (b.median as number) || a._i - b._i);
    const few: RankedGroup[] = stats.filter(x => x.s.n < minN).map(x => ({
        key: x.g.key, n: x.s.n, median: null, low: null, high: null, status: 'too-few' as const, rank: null, tiedWith: [],
    }));
    return [...rows.map(({ _i, ...r }) => r), ...few];
}

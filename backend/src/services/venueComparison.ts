/**
 * Matched venue comparison (M4 §4, roadmap A8, constrained). Only the user's own past fills, matched by symbol and size
 * bucket, compared across venues. A replay of past fills on another venue's tape is NOT built: it would read as routing
 * advice (invariant I1). Nothing is pooled across symbols or size buckets. Each venue in a bucket needs 20 fills to be
 * ranked (rankWithNoise); fills without a measured cost are ignored, never counted as zero.
 */
import { MIN_GROUP_N, RankedGroup, rankWithNoise } from './rankWithNoise';

const EDGES: Array<[number, string]> = [[1_000, 'lt1k'], [10_000, '1k-10k'], [100_000, '10k-100k']];

/** The size buckets of scoring v2 (ml-service/scoring_v2/components.py NOTIONAL_BUCKETS). */
export function notionalBucket(usd: number): string {
    for (const [edge, name] of EDGES) if (usd < edge) return name;
    return 'ge100k';
}

export interface VenueFill { exchange: string; symbol: string; notional: number; costBps: number | null }
export interface VenueBucket { symbol: string; bucket: string; comparable: boolean; venues: RankedGroup[]; note: string | null }

export function matchedVenueComparison(fills: VenueFill[]) {
    const usable = fills.filter(f => typeof f.costBps === 'number' && Number.isFinite(f.costBps) && f.notional > 0);
    const venues = new Set(usable.map(f => f.exchange));         // only venues with a measured cost count
    if (venues.size < 2) {
        return { available: false, buckets: [] as VenueBucket[], note: 'Insufficient data: fills with a measured cost exist on one venue only, so there is nothing to compare.' };
    }
    const cells = new Map<string, Map<string, number[]>>();
    for (const f of usable) {
        const k = `${f.symbol}\u0000${notionalBucket(f.notional)}`;
        const cell = cells.get(k) ?? new Map<string, number[]>();
        const arr = cell.get(f.exchange) ?? [];
        arr.push(f.costBps as number);
        cell.set(f.exchange, arr);
        cells.set(k, cell);
    }
    const buckets: VenueBucket[] = [...cells.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, cell]) => {
        const [symbol, bucket] = k.split('\u0000');
        const ranked = rankWithNoise([...cell.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, values]) => ({ key, values })), { minN: MIN_GROUP_N });
        const rankedCount = ranked.filter(v => v.status === 'ranked').length;
        const comparable = ranked.length >= 2 && rankedCount === ranked.length;
        const note = ranked.length < 2 ? 'Not comparable: only one venue has fills in this bucket.'
            : !comparable ? 'Too few to tell: a venue has fewer than 20 fills in this bucket.' : null;
        return { symbol, bucket, comparable, venues: ranked, note };
    });
    return { available: true, buckets, note: null as string | null };
}

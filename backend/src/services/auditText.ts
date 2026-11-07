import { Trade } from '../models/Trade';
import { generateRecommendations, computeComponentMeans } from '../scoring/audit';
import { findAdviceTerms } from '../constants/adviceTerms';
import { EnrichedTrade } from '../types';

/**
 * Stored audits can carry recommendation text written by older code (advice wording). Text is
 * regenerated from the deterministic generator whenever a stored line contains an advice or
 * counterfactual term, or the old "(capped at N)" gap wording, so stale wording can never reach a user. Scores and other fields are untouched.
 */
export const isStaleRecommendations = (recs: unknown): boolean =>
    Array.isArray(recs) && recs.some(r => typeof r === 'string' && (findAdviceTerms(r).length > 0 || /\(capped at \d+\)/.test(r)));

export async function regenerateRecommendations(audit: any, accountId: string): Promise<string[]> {
    const docs = await Trade.find({ accountId, fillScore: { $exists: true, $ne: null } }).lean();
    if (docs.length === 0) return [];
    const trades = docs.map(d => ({ ...d, executedAt: new Date(d.executedAt) } as unknown as EnrichedTrade));
    const summary = typeof audit.toObject === 'function' ? audit.toObject() : audit;
    return generateRecommendations(summary, trades);
}

/** Returns the audit as a plain object whose recommendations are guaranteed free of advice wording. */
export async function descriptiveAudit(audit: any, accountId: string): Promise<any> {
    const plain = typeof audit.toObject === 'function' ? audit.toObject() : { ...audit };
    if (isStaleRecommendations(plain.recommendations)) {
        plain.recommendations = await regenerateRecommendations(plain, accountId);
    }
    return plain;
}

/** Response-only (never saved): adds breakdown.componentMeans to an audit stored without it, from the stored
 *  per-trade scores. null when they are not stored, so the UI shows "—". Kept apart from descriptiveAudit, which
 *  must leave every stored field byte-identical. */
export async function withComponentMeans(plain: any, accountId: string): Promise<any> {
    if (!plain?.breakdown || plain.breakdown.componentMeans != null) return plain;
    const docs = await Trade.find({ accountId, fillScore: { $exists: true, $ne: null } }).lean();
    return { ...plain, breakdown: { ...plain.breakdown, componentMeans: componentMeansForPeriod(docs, plain.period) } };
}

/** Component means over only the trades inside the audit's period (bounds inclusive). With no usable period the
 *  trades are not filtered. */
export function componentMeansForPeriod(docs: any[], period?: { start?: any; end?: any } | null) {
    const s = period?.start ? new Date(period.start).getTime() : NaN;
    const e = period?.end ? new Date(period.end).getTime() : NaN;
    if (!Number.isFinite(s) || !Number.isFinite(e)) return componentMeansFromStored(docs);
    return componentMeansFromStored(docs.filter(d => {
        const t = new Date(d.executedAt).getTime();
        return t >= s && t <= e;
    }));
}

/** Read-only: component means from stored per-trade scores; null when no trade carries them. */
export function componentMeansFromStored(docs: any[]) {
    const m = computeComponentMeans(docs);
    return Object.values(m).every(v => v == null) ? null : m;
}

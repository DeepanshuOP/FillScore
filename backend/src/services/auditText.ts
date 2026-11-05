import { Trade } from '../models/Trade';
import { generateRecommendations } from '../scoring/audit';
import { findAdviceTerms } from '../constants/adviceTerms';
import { EnrichedTrade } from '../types';

/**
 * Stored audits can carry recommendation text written by older code (advice wording). Text is
 * regenerated from the deterministic generator whenever a stored line contains an advice or
 * counterfactual term, so stale wording can never reach a user. Scores and other fields are untouched.
 */
export const isStaleRecommendations = (recs: unknown): boolean =>
    Array.isArray(recs) && recs.some(r => typeof r === 'string' && findAdviceTerms(r).length > 0);

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

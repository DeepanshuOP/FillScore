import { AuditHistory } from '../models/AuditHistory';
import { SCORING_VERSION } from '../config/versions';

export interface HistoryPoint {
    snapshotAt: Date;
    avgFillScore: number;
    fillGrade: string;
    totalTrades: number;
}

interface AuditLike {
    avgFillScore: number;
    fillGrade: string;
    totalTrades: number;
    totalNotional: number;
    estimatedLossUSD: number;
    period: { start: Date; end: Date };
    breakdown: { avgSlippageBps: number; avgFeeDragBps: number; makerRatio: number };
}

/**
 * Appends one immutable row describing this audit run. Demo accounts are re-run constantly
 * against frozen data, so for them a snapshot is only written when the result actually changed.
 */
export async function recordAuditSnapshot(
    accountId: string,
    dataSource: 'synthetic-demo' | 'real-user',
    audit: AuditLike
): Promise<void> {
    if (dataSource === 'synthetic-demo') {
        const latest = await AuditHistory.findOne({ accountId }).sort({ snapshotAt: -1 }).lean();
        if (latest && latest.avgFillScore === audit.avgFillScore && latest.totalTrades === audit.totalTrades) {
            return;
        }
    }

    await AuditHistory.create({
        accountId,
        dataSource,
        scoringVersion: SCORING_VERSION,
        avgFillScore: audit.avgFillScore,
        fillGrade: audit.fillGrade,
        totalTrades: audit.totalTrades,
        totalNotional: audit.totalNotional,
        estimatedLossUSD: audit.estimatedLossUSD,
        avgSlippageBps: audit.breakdown.avgSlippageBps,
        avgFeeDragBps: audit.breakdown.avgFeeDragBps,
        makerRatio: audit.breakdown.makerRatio,
        periodStart: audit.period.start,
        periodEnd: audit.period.end,
    });
}

/** The newest `limit` points for an account, returned oldest first so they plot left to right. */
export async function getAuditHistory(accountId: string, limit: number): Promise<HistoryPoint[]> {
    const rows = await AuditHistory.find({ accountId })
        .sort({ snapshotAt: -1 })
        .limit(limit)
        .select('snapshotAt avgFillScore fillGrade totalTrades -_id')
        .lean();

    return rows.reverse().map(r => ({
        snapshotAt: r.snapshotAt,
        avgFillScore: r.avgFillScore,
        fillGrade: r.fillGrade,
        totalTrades: r.totalTrades,
    }));
}

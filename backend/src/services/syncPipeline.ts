/**
 * The background sync of one account: take the lock, fetch the history, enrich, score (v1), then measure and score (v2).
 * Shared by the Sync button (routes/onboarding.ts) and the scheduled re-sync (services/resyncScheduler.ts), so both take the same lock
 * and run the same steps. In-process: nothing here is awaited by the caller after the lock is taken.
 */
import { ExchangeConnection } from '../models/ExchangeConnection';
import { syncAccountTrades } from './SyncService';
import { acquireSyncLock, runSyncJob, JobControl, JobOutcome } from './SyncJobService';
import { MarketDataService } from './MarketDataService';
import { executeAuditPipeline, NoScorableTradesError } from '../routes/audit';
import { INGEST_DAYS_BACK } from '../config/ingestion';
import { mlServiceSecret, requestMeasurement, requestScore } from './measureTrigger';

/** The slow part of a sync, run in-process after the lock is taken. */
export async function performSync(accountId: string, ctl: JobControl): Promise<JobOutcome> {
    const marketDataService = new MarketDataService();
    const report = await syncAccountTrades(accountId, INGEST_DAYS_BACK, { onProgress: ctl.progress, deadlineMs: ctl.deadlineMs });
    if (report.refused?.length && report.refused.length === (await ExchangeConnection.countDocuments({ accountId }))) {
        const r = report.refused[0];
        return { state: 'needs_attention', result: { error: r.reason, exchange: r.exchange, disable: r.disable ?? [], enable: r.enable ?? [], refused: report.refused } };
    }
    // Past the deadline: no enrichment or audit starts; the next sync resumes from the stored coverage.
    if (Date.now() >= ctl.deadlineMs) {
        return { state: 'partial', partialReason: 'time_cap', partialMessage: report.partialMessage, result: { lookbackDays: report.lookbackDays, effectiveDays: report.effectiveDays, invalidSymbols: report.invalidSymbols ?? [], refused: report.refused ?? [], auditSkipped: true } };
    }
    await marketDataService.enrichAllPendingTrades(accountId, ctl.deadlineMs);
    if (Date.now() >= ctl.deadlineMs) {
        return { state: 'partial', partialReason: 'time_cap', result: { lookbackDays: report.lookbackDays, effectiveDays: report.effectiveDays, invalidSymbols: report.invalidSymbols ?? [], refused: report.refused ?? [], auditSkipped: true } };
    }
    const base = {
        lookbackDays: report.lookbackDays, effectiveDays: report.effectiveDays,
        invalidSymbols: report.invalidSymbols ?? [], refused: report.refused ?? [],
    };
    const state = report.partial ? 'partial' as const : 'done' as const;
    const partial = { partialReason: report.partialReason, partialMessage: report.partialMessage };
    try {
        const { savedAudit, tradesScored, totalIngested } = await executeAuditPipeline(accountId);
        return { state, ...partial, result: { ...base, tradesIngested: totalIngested, tradesScored, fillScore: savedAudit.avgFillScore, grade: savedAudit.fillGrade } };
    } catch (e: any) {
        if (e instanceof NoScorableTradesError) return { state, ...partial, result: { ...base, noScorableTrades: true, skippedTrades: e.skippedTrades } };
        if (e.message === 'no_trades_found') return { state, ...partial, result: { ...base, noTrades: true } };
        throw e;
    }
}

/**
 * Take the account's sync lock and run the sync in the background. Returns null when a sync with a live lease is already running.
 * Never rejects after the lock is taken; the result is read from the sync status.
 */
export async function startBackgroundSync(accountId: string, lookbackDays: number | undefined): Promise<{ syncId: string } | null> {
    const lock = await acquireSyncLock(accountId, lookbackDays);
    if (!lock) return null;
    runSyncJob(accountId, lock.syncId, ctl => performSync(accountId, ctl))
        // M1: measure the new fills (measurement v2). Never rejects; pending trades are retried by the next sync.
        .then(() => requestMeasurement(accountId, { baseUrl: process.env.ML_SERVICE_URL, secret: mlServiceSecret() }))
        .then(async r => {
            if (r.status === 'skipped') return;
            console.log(`[measure_v2] ${r.status} calls=${r.calls}`);
            if (r.status === 'done') console.log(`[score_v2] ${await requestScore(accountId, { baseUrl: process.env.ML_SERVICE_URL, secret: mlServiceSecret() })}`);
        })
        .catch(e => console.error('[SyncJob] unexpected:', e?.name));
    return { syncId: lock.syncId };
}

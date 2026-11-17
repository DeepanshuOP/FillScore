/**
 * Scheduled re-sync (M6). An account is stale when the newest of its connections' lastSyncAt (createdAt for a connection that never
 * synced) is older than 24 hours. A tick starts a background sync for the oldest stale accounts, at most 3, through the same lock the
 * Sync button uses, so a user's own sync and a scheduled one never overlap.
 *
 * Left alone: an account whose connections all need attention (a stored key was refused; the user must act), one with a sync running
 * on a live lease, and one whose last sync failed in the last 6 hours (no hammering).
 *
 * Honest limit: the API runs on a free instance that sleeps after 15 idle minutes. The timer runs only while the instance is awake, so
 * the stale-data indicator (getSyncStatus: lastSyncAt, stale) is what tells the user the truth; the schedule only helps while it runs.
 */
import { ExchangeConnection } from '../models/ExchangeConnection';
import { SyncJob } from '../models/SyncJob';

export const STALE_AFTER_MS = 24 * 3600_000;
export const FAILED_BACKOFF_MS = 6 * 3600_000;
export const MAX_PER_TICK = 3;
export const TICK_MS = 10 * 60_000;
export const FIRST_TICK_MS = 60_000;
const CANDIDATE_CAP = 200;

export type StartSync = (accountId: string) => Promise<{ syncId: string } | null>;

export async function findStaleAccounts(now: number, limit = MAX_PER_TICK): Promise<string[]> {
    const rows = await ExchangeConnection.aggregate([
        { $group: {
            _id: '$accountId',
            ref: { $max: { $ifNull: ['$lastSyncAt', '$createdAt'] } },
            healthy: { $sum: { $cond: [{ $eq: ['$status', 'needs_attention'] }, 0, 1] } },
        } },
        { $match: { healthy: { $gt: 0 }, ref: { $lt: new Date(now - STALE_AFTER_MS) } } },
        { $sort: { ref: 1, _id: 1 } },
        { $limit: CANDIDATE_CAP },
    ]);
    if (rows.length === 0) return [];
    const jobs = await SyncJob.find({ accountId: { $in: rows.map(r => r._id) } }, { accountId: 1, state: 1, finishedAt: 1, syncLockExpiresAt: 1 }).lean();
    const byAccount = new Map(jobs.map(j => [j.accountId, j]));
    const out: string[] = [];
    for (const r of rows) {
        const j = byAccount.get(r._id);
        if (j?.state === 'running' && j.syncLockExpiresAt.getTime() > now) continue;                       // a sync is running on a live lease
        if (j?.state === 'failed' && j.finishedAt && now - j.finishedAt.getTime() < FAILED_BACKOFF_MS) continue;
        out.push(r._id as string);
        if (out.length >= limit) break;
    }
    return out;
}

/** One tick: start a sync for each stale account. A failure to start one account never stops the others; only the error name is logged. */
export async function runResyncTick(start: StartSync, now = Date.now()): Promise<{ started: string[]; skipped: number }> {
    const started: string[] = [];
    let skipped = 0;
    for (const id of await findStaleAccounts(now)) {
        try {
            if (await start(id)) started.push(id); else skipped += 1;     // null: the lock was taken between the search and the start
        } catch (e) {
            skipped += 1;
            console.error('[resync] could not start a sync:', (e as Error)?.name);
        }
    }
    return { started, skipped };
}

/**
 * Run a tick shortly after the start (`firstDelayMs`: an instance that woke up for a request may sleep again in 15 minutes) and then
 * every `intervalMs`, never two at once. Returns the function that stops it. The timers do not keep the process alive.
 */
export function startResyncScheduler(start: StartSync, intervalMs = TICK_MS, firstDelayMs = FIRST_TICK_MS): () => void {
    let busy = false;
    const tick = () => {
        if (busy) return;
        busy = true;
        runResyncTick(start).then(r => { if (r.started.length) console.log(`[resync] started ${r.started.length} sync(s)`); })
            .catch(e => console.error('[resync] tick failed:', (e as Error)?.name))
            .finally(() => { busy = false; });
    };
    const first = setTimeout(tick, firstDelayMs);
    const timer = setInterval(tick, intervalMs);
    first.unref();
    timer.unref();
    return () => { clearTimeout(first); clearInterval(timer); };
}

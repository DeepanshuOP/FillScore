import crypto from 'crypto';
import { SyncJob, SyncState } from '../models/SyncJob';
import { ExchangeConnection } from '../models/ExchangeConnection';
import { INGEST_DAYS_BACK } from '../config/ingestion';

/**
 * Background sync jobs. In-process: a Render restart kills a running job. The lease
 * (syncLockExpiresAt) expires after LEASE_MS, after which the lock can be retaken and the
 * status reads `failed: lease_expired`.
 *
 * State machine:  (none/idle) -> running -> done | partial | needs_attention | failed
 *                 running --lease expired--> (retakeable; reported as failed)
 */
export const LEASE_MS = 15 * 60_000;
export const WALL_CLOCK_CAP_MS = 10 * 60_000;
export const TIME_CAP_MESSAGE = 'The sync reached its 10 minute limit, so only part of your history was fetched. Sync again to continue where it stopped.';

export interface JobOutcome {
    state: Exclude<SyncState, 'running' | 'failed'>;
    partialReason?: string;
    partialMessage?: string;
    result?: Record<string, unknown>;
}
export interface JobControl {
    deadlineMs: number;
    progress: (p: { symbolsDone: number; symbolsTotal: number; tradesAdded: number }) => void;
}

/** Atomic lock: null when a job with a live lease is already running for this account. */
export async function acquireSyncLock(accountId: string, lookbackDays: number | undefined, now = Date.now()): Promise<{ syncId: string } | null> {
    const syncId = crypto.randomUUID();
    try {
        const doc = await SyncJob.findOneAndUpdate(
            { accountId, $or: [{ state: { $ne: 'running' } }, { syncLockExpiresAt: { $lt: new Date(now) } }] },
            {
                $set: {
                    syncId, state: 'running', startedAt: new Date(now), syncLockExpiresAt: new Date(now + LEASE_MS),
                    symbolsDone: 0, symbolsTotal: 0, tradesAdded: 0, ...(lookbackDays !== undefined ? { lookbackDays } : {}),
                },
                $unset: { finishedAt: '', partial: '', partialReason: '', partialMessage: '', error: '', result: '', ...(lookbackDays === undefined ? { lookbackDays: '' } : {}) },
            },
            { upsert: true, new: true },
        );
        return doc ? { syncId } : null;
    } catch (e: any) {
        if (e?.code === 11000) return null; // lost the upsert race to a concurrent POST
        throw e;
    }
}

async function finish(accountId: string, syncId: string, set: Record<string, unknown>) {
    // filtered on syncId + running: a job that already hit the cap cannot be overwritten by a late result
    await SyncJob.updateOne({ accountId, syncId, state: 'running' }, { $set: { ...set, finishedAt: new Date() } });
}

export async function runSyncJob(accountId: string, syncId: string, work: (ctl: JobControl) => Promise<JobOutcome>, capMs = WALL_CLOCK_CAP_MS): Promise<void> {
    const ctl: JobControl = {
        deadlineMs: Date.now() + capMs,
        progress: p => { SyncJob.updateOne({ accountId, syncId, state: 'running' }, { $set: p }).catch(() => {}); },
    };
    let timer: NodeJS.Timeout | undefined;
    const capped = new Promise<'cap'>(res => { timer = setTimeout(() => res('cap'), capMs); });
    try {
        const w = work(ctl);
        const out = await Promise.race([w, capped]);
        if (out === 'cap') {
            w.catch(() => undefined); // a late failure after the cap must not be an unhandled rejection
            await finish(accountId, syncId, { state: 'partial', partial: true, partialReason: 'time_cap', partialMessage: TIME_CAP_MESSAGE });
        } else {
            await finish(accountId, syncId, {
                state: out.state, partial: out.state === 'partial', partialReason: out.partialReason, partialMessage: out.partialMessage, result: out.result,
            });
        }
        return;
    } catch (e: any) {
        console.error('[SyncJob] failed:', e?.message);
        // never reject: the caller does not await this, and an unhandled rejection kills Node 20
        await finish(accountId, syncId, { state: 'failed', error: 'sync_failed' }).catch(err => console.error('[SyncJob] could not record failure:', err?.name));
    } finally {
        if (timer) clearTimeout(timer);
    }
}

export async function getSyncStatus(accountId: string) {
    const job = await SyncJob.findOne({ accountId }).lean();
    if (!job) {
        const conns = await ExchangeConnection.find({ accountId }, { lookbackDays: 1 }).lean();
        const lookbackDays = conns.length ? Math.max(...conns.map(c => c.lookbackDays ?? INGEST_DAYS_BACK)) : undefined;
        return { state: 'idle' as const, symbolsDone: 0, symbolsTotal: 0, tradesAdded: 0, lookbackDays };
    }
    const lost = job.state === 'running' && job.syncLockExpiresAt.getTime() < Date.now();
    return {
        state: lost ? ('failed' as const) : job.state,
        syncId: job.syncId,
        symbolsDone: job.symbolsDone, symbolsTotal: job.symbolsTotal, tradesAdded: job.tradesAdded,
        lookbackDays: job.lookbackDays,
        partial: !!job.partial, partialReason: job.partialReason, partialMessage: job.partialMessage,
        error: lost ? 'lease_expired' : job.error,
        startedAt: job.startedAt, finishedAt: job.finishedAt,
        result: job.result,
    };
}

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { acquireSyncLock, runSyncJob, getSyncStatus, LEASE_MS, TIME_CAP_MESSAGE } from '../SyncJobService';
import { SyncJob } from '../../models/SyncJob';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { encryptApiKey } from '../../utils/encryption';
import { loadEnv } from '../../config/env';

loadEnv();
const A = 'acct-syncjob-1';

describe('SyncJobService', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); await SyncJob.syncIndexes(); });
    afterEach(async () => { await SyncJob.deleteMany({ accountId: A }); await ExchangeConnection.deleteMany({ accountId: A }); });

    it('concurrent acquires: exactly one gets the lock', async () => {
        const [a, b] = await Promise.all([acquireSyncLock(A, 365), acquireSyncLock(A, 365)]);
        expect([a, b].filter(Boolean)).toHaveLength(1);
    });

    it('a live lease blocks; an expired lease is retaken', async () => {
        const t0 = Date.UTC(2026, 10, 1, 12, 0, 0);
        const first = await acquireSyncLock(A, 30, t0);
        expect(first).not.toBeNull();
        // 14 min later: lease (15 min) still live -> blocked
        expect(await acquireSyncLock(A, 30, t0 + 14 * 60_000)).toBeNull();
        // 15 min + 1 ms later: lease expired -> retaken with a new syncId
        const again = await acquireSyncLock(A, 30, t0 + LEASE_MS + 1);
        expect(again).not.toBeNull();
        expect(again!.syncId).not.toBe(first!.syncId);
    });

    it('transitions running -> done with progress and result', async () => {
        const lock = (await acquireSyncLock(A, 365))!;
        expect((await getSyncStatus(A)).state).toBe('running');
        let release!: () => void;
        const gate = new Promise<void>(r => { release = r; });
        const p = runSyncJob(A, lock.syncId, async ctl => {
            ctl.progress({ symbolsDone: 2, symbolsTotal: 5, tradesAdded: 40 });
            await gate;
            return { state: 'done', result: { tradesIngested: 40 } };
        });
        await new Promise(r => setTimeout(r, 100));
        const mid = await getSyncStatus(A);
        expect(mid).toMatchObject({ state: 'running', symbolsDone: 2, symbolsTotal: 5, tradesAdded: 40, lookbackDays: 365 });
        release(); await p;
        const end = await getSyncStatus(A);
        expect(end.state).toBe('done');
        expect(end.result).toEqual({ tradesIngested: 40 });
    });

    it('partial and needs_attention outcomes carry their reason; a throw is failed', async () => {
        let l = (await acquireSyncLock(A, 30))!;
        await runSyncJob(A, l.syncId, async () => ({ state: 'partial', partialReason: 'rate_limited', partialMessage: 'm' }));
        expect(await getSyncStatus(A)).toMatchObject({ state: 'partial', partial: true, partialReason: 'rate_limited', partialMessage: 'm' });
        l = (await acquireSyncLock(A, 30))!;
        await runSyncJob(A, l.syncId, async () => ({ state: 'needs_attention', result: { error: 'key_not_read_only' } }));
        expect(await getSyncStatus(A)).toMatchObject({ state: 'needs_attention', result: { error: 'key_not_read_only' } });
        l = (await acquireSyncLock(A, 30))!;
        await runSyncJob(A, l.syncId, async () => { throw new Error('boom'); });
        expect(await getSyncStatus(A)).toMatchObject({ state: 'failed', error: 'sync_failed' });
    });

    it('the wall-clock cap ends a hung job as partial/time_cap, and a late result cannot overwrite it', async () => {
        const l = (await acquireSyncLock(A, 365))!;
        let late!: (v: any) => void;
        const hung = new Promise<any>(r => { late = r; });
        await runSyncJob(A, l.syncId, () => hung, 50);
        expect(await getSyncStatus(A)).toMatchObject({ state: 'partial', partialReason: 'time_cap', partialMessage: TIME_CAP_MESSAGE });
        late({ state: 'done' });
        await new Promise(r => setTimeout(r, 50));
        expect((await getSyncStatus(A)).state).toBe('partial');
    });

    it('a running job whose lease expired reads as failed/lease_expired', async () => {
        await SyncJob.create({ accountId: A, syncId: 's', state: 'running', startedAt: new Date(0), syncLockExpiresAt: new Date(1000) });
        expect(await getSyncStatus(A)).toMatchObject({ state: 'failed', error: 'lease_expired' });
    });

    it('idle status exposes the stored lookback from the connection', async () => {
        await ExchangeConnection.create({ accountId: A, exchange: 'binance', encryptedApiKey: encryptApiKey('k'), encryptedApiSecret: encryptApiKey('s'), lookbackDays: 90 });
        expect(await getSyncStatus(A)).toMatchObject({ state: 'idle', lookbackDays: 90 });
    });

    it('the lock is not freed while in-flight work is still settling after the cap', async () => {
        const l = (await acquireSyncLock(A, 365))!;
        let finishWork!: () => void;
        const inflight = new Promise<any>(r => { finishWork = () => r({ state: 'done' }); });
        const job = runSyncJob(A, l.syncId, () => inflight, 20, 1000);
        await new Promise(r => setTimeout(r, 120)); // past the cap, inside the grace window
        expect((await getSyncStatus(A)).state).toBe('running');
        expect(await acquireSyncLock(A, 365)).toBeNull(); // a second sync cannot start on top of the in-flight one
        finishWork();
        await job;
        expect(await getSyncStatus(A)).toMatchObject({ state: 'partial', partialReason: 'time_cap' });
    });
});

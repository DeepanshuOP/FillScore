/**
 * Scheduled re-sync (M6): which accounts are stale, how many a tick starts, and what the status says about freshness.
 * Rules: an account is stale when the newest of its connections' lastSyncAt (or createdAt for one that never synced) is older than 24 h;
 * an account with a connection that needs attention, a sync running on a live lease, or a failed sync in the last 6 h is left alone; the
 * oldest accounts go first and a tick starts at most 3.
 *
 * Hand-computed fixture, now = T. Reference time of each account (newest of its connections):
 *   I: lastSyncAt T-100h  -> stale, oldest          C: never synced, createdAt T-30h -> stale
 *   A: lastSyncAt T-25h   -> stale                   B: T-23h -> not stale          D: never synced, createdAt T-1h -> not stale
 *   E: needs_attention (T-50h) -> excluded           F: binance T-48h and bybit T-2h -> reference T-2h -> not stale
 *   G: T-30h but a sync failed at T-1h -> backed off H: T-26h but a sync is running on a live lease -> left alone
 * Order of the stale ones, oldest first: I (-100h), C (-30h), A (-25h).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { ExchangeConnection } from '../../models/ExchangeConnection';
import { SyncJob } from '../../models/SyncJob';
import { encryptApiKey } from '../../utils/encryption';
import { findStaleAccounts, runResyncTick, startResyncScheduler, STALE_AFTER_MS, MAX_PER_TICK } from '../resyncScheduler';
import { getSyncStatus } from '../SyncJobService';

const H = 3600_000;
const T = Date.parse('2026-11-18T12:00:00Z');
const at = (hoursAgo: number) => new Date(T - hoursAgo * H);
const enc = () => encryptApiKey('K'.repeat(32));

async function conn(accountId: string, exchange: 'binance' | 'bybit', o: { lastSyncHoursAgo?: number; createdHoursAgo?: number; status?: 'ok' | 'needs_attention' } = {}) {
    await ExchangeConnection.create({
        accountId, userId: accountId, exchange, encryptedApiKey: enc(), encryptedApiSecret: enc(), status: o.status ?? 'ok',
        createdAt: at(o.createdHoursAgo ?? 500), ...(o.lastSyncHoursAgo !== undefined ? { lastSyncAt: at(o.lastSyncHoursAgo) } : {}),
    });
}
const job = (accountId: string, state: 'running' | 'failed', o: { finishedHoursAgo?: number; leaseLive?: boolean } = {}) =>
    SyncJob.create({ accountId, syncId: `s-${accountId}`, state, startedAt: at(2), syncLockExpiresAt: new Date(T + (o.leaseLive ? 10 * 60_000 : -10 * 60_000)),
        symbolsDone: 0, symbolsTotal: 0, tradesAdded: 0, ...(o.finishedHoursAgo !== undefined ? { finishedAt: at(o.finishedHoursAgo) } : {}) });

describe('scheduled re-sync', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    afterAll(async () => { await ExchangeConnection.deleteMany({}); await SyncJob.deleteMany({}); });
    beforeEach(async () => {
        await ExchangeConnection.deleteMany({}); await SyncJob.deleteMany({});
        await conn('I', 'binance', { lastSyncHoursAgo: 100 });
        await conn('C', 'binance', { createdHoursAgo: 30 });
        await conn('A', 'binance', { lastSyncHoursAgo: 25 });
        await conn('B', 'binance', { lastSyncHoursAgo: 23 });
        await conn('D', 'binance', { createdHoursAgo: 1 });
        await conn('E', 'binance', { lastSyncHoursAgo: 50, status: 'needs_attention' });
        await conn('F', 'binance', { lastSyncHoursAgo: 48 });
        await conn('F', 'bybit', { lastSyncHoursAgo: 2 });
        await conn('G', 'binance', { lastSyncHoursAgo: 30 });
        await job('G', 'failed', { finishedHoursAgo: 1 });
        await conn('H', 'binance', { lastSyncHoursAgo: 26 });
        await job('H', 'running', { leaseLive: true });
    });

    it('limits are 24 hours stale and 3 accounts a tick', () => {
        expect(STALE_AFTER_MS).toBe(24 * H);
        expect(MAX_PER_TICK).toBe(3);
    });

    it('finds the stale accounts, oldest first, and leaves the others alone (hand-computed)', async () => {
        expect(await findStaleAccounts(T, 10)).toEqual(['I', 'C', 'A']);
        expect(await findStaleAccounts(T, 2)).toEqual(['I', 'C']);
    });

    it('a failed sync older than 6 hours does not hold an account back, and an expired lease does not count as running', async () => {
        await SyncJob.updateOne({ accountId: 'G' }, { finishedAt: at(7) });
        await SyncJob.updateOne({ accountId: 'H' }, { syncLockExpiresAt: new Date(T - 60_000) });
        // references: I -100h, C -30h, G -30h, H -26h, A -25h; oldest first, a tie goes by account id (C before G)
        expect(await findStaleAccounts(T, 10)).toEqual(['I', 'C', 'G', 'H', 'A']);
    });

    it('a tick starts each stale account once, in order, and counts the ones whose lock was taken', async () => {
        const started: string[] = [];
        const r = await runResyncTick(async (id) => { started.push(id); return id === 'C' ? null : { syncId: `x-${id}` }; }, T);
        expect(started).toEqual(['I', 'C', 'A']);
        expect(r).toEqual({ started: ['I', 'A'], skipped: 1 });
    });

    it('one account failing to start does not stop the others, and the error text is not logged', async () => {
        const logged: string[] = [];
        const orig = console.error;
        console.error = (...a: unknown[]) => { logged.push(a.map(String).join(' ')); };
        try {
            const r = await runResyncTick(async (id) => { if (id === 'I') throw new Error('secret-detail-in-message'); return { syncId: id }; }, T);
            expect(r.started).toEqual(['C', 'A']);
        } finally { console.error = orig; }
        expect(logged.join('\n')).not.toContain('secret-detail-in-message');
    });

    it('the scheduler runs a tick on its interval, can be stopped, and never overlaps itself', async () => {
        let running = 0, maxRunning = 0, ticks = 0;
        const stop = startResyncScheduler(async () => { running++; maxRunning = Math.max(maxRunning, running); ticks++; await new Promise(r => setTimeout(r, 40)); running--; return null; }, 10);
        await new Promise(r => setTimeout(r, 200));
        stop();
        const seen = ticks;
        await new Promise(r => setTimeout(r, 100));
        expect(seen).toBeGreaterThan(0);
        expect(ticks).toBe(seen);          // stopped
        expect(maxRunning).toBe(1);        // a slow tick is not started again on top of itself
    });
});

describe('sync status: how fresh the data is', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    beforeEach(async () => { await ExchangeConnection.deleteMany({}); await SyncJob.deleteMany({}); });

    it('reports the newest lastSyncAt of the account and whether it is more than 24 hours old', async () => {
        const recent = new Date(Date.now() - 1 * H), old = new Date(Date.now() - 49 * H);
        await ExchangeConnection.create({ accountId: 'fresh', exchange: 'binance', encryptedApiKey: enc(), encryptedApiSecret: enc(), lastSyncAt: old });
        await ExchangeConnection.create({ accountId: 'fresh', exchange: 'bybit', encryptedApiKey: enc(), encryptedApiSecret: enc(), lastSyncAt: recent });
        const s = await getSyncStatus('fresh');
        expect(new Date(s.lastSyncAt!).getTime()).toBe(recent.getTime());
        expect(s.stale).toBe(false);
        expect(s.staleAfterHours).toBe(24);
        await ExchangeConnection.create({ accountId: 'old', exchange: 'binance', encryptedApiKey: enc(), encryptedApiSecret: enc(), lastSyncAt: old });
        const o = await getSyncStatus('old');
        expect(o.stale).toBe(true);
    });

    it('says nothing is known (null, not stale) for an account that never synced, and has no data for one without connections', async () => {
        await ExchangeConnection.create({ accountId: 'never', exchange: 'binance', encryptedApiKey: enc(), encryptedApiSecret: enc() });
        const n = await getSyncStatus('never');
        expect(n.lastSyncAt ?? null).toBeNull();
        expect(n.stale).toBeNull();
        const none = await getSyncStatus('nobody');
        expect(none.lastSyncAt ?? null).toBeNull();
        expect(none.stale).toBeNull();
    });
});

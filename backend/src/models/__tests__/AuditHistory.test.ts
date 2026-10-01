import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { AuditHistory } from '../AuditHistory';
import { loadEnv } from '../../config/env';

loadEnv();

const snapshot = (overrides: Record<string, unknown> = {}) => ({
    accountId: 'acc-1',
    dataSource: 'real-user',
    scoringVersion: '1.0.0',
    avgFillScore: 82.5,
    fillGrade: 'B',
    totalTrades: 40,
    totalNotional: 125000,
    estimatedLossUSD: 31.2,
    avgSlippageBps: 2.4,
    avgFeeDragBps: 9.1,
    makerRatio: 0.35,
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-09-30T00:00:00Z'),
    ...overrides,
});

describe('AuditHistory model', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
    });

    afterEach(async () => {
        await AuditHistory.deleteMany({});
    });

    it('stores a snapshot and stamps snapshotAt', async () => {
        const saved = await AuditHistory.create(snapshot());
        expect(saved.snapshotAt).toBeInstanceOf(Date);
        expect(saved.avgFillScore).toBe(82.5);
    });

    it('allows many snapshots per account (unlike the canonical Audit)', async () => {
        await AuditHistory.create(snapshot());
        await AuditHistory.create(snapshot({ avgFillScore: 84 }));
        expect(await AuditHistory.countDocuments({ accountId: 'acc-1' })).toBe(2);
    });

    it.each(['accountId', 'dataSource', 'scoringVersion', 'avgFillScore', 'fillGrade', 'totalTrades'])(
        'requires %s',
        async (field) => {
            const doc = snapshot();
            delete (doc as any)[field];
            await expect(AuditHistory.create(doc)).rejects.toThrow(new RegExp(field));
        }
    );

    it('rejects an unknown dataSource', async () => {
        await expect(AuditHistory.create(snapshot({ dataSource: 'made-up' }))).rejects.toThrow(/dataSource/);
    });

    it('refuses every kind of update: history is append-only', async () => {
        const saved = await AuditHistory.create(snapshot());

        await expect(AuditHistory.updateOne({ _id: saved._id }, { $set: { avgFillScore: 99 } }))
            .rejects.toThrow('audit_history_is_append_only');
        await expect(AuditHistory.updateMany({}, { $set: { avgFillScore: 99 } }))
            .rejects.toThrow('audit_history_is_append_only');
        await expect(AuditHistory.findOneAndUpdate({ _id: saved._id }, { $set: { avgFillScore: 99 } }))
            .rejects.toThrow('audit_history_is_append_only');
        await expect(AuditHistory.replaceOne({ _id: saved._id }, snapshot({ avgFillScore: 99 })))
            .rejects.toThrow('audit_history_is_append_only');

        const reloaded = await AuditHistory.findById(saved._id);
        expect(reloaded?.avgFillScore).toBe(82.5);
    });

    it('refuses to re-save an existing document with changes', async () => {
        const saved = await AuditHistory.create(snapshot());
        saved.avgFillScore = 99;
        await expect(saved.save()).rejects.toThrow('audit_history_is_append_only');
    });

    it('indexes accountId + snapshotAt for the trend query', async () => {
        await AuditHistory.init();
        const indexes = await AuditHistory.collection.indexes();
        expect(indexes.some(i => i.key.accountId === 1 && i.key.snapshotAt === 1)).toBe(true);
    });
});

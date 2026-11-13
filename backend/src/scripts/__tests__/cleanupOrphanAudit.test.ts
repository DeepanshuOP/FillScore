import { describe, it, expect, vi } from 'vitest';
import { findOrphanAccountIds, planCleanup, applyCleanup } from '../cleanupOrphanAudit';

describe('findOrphanAccountIds', () => {
    it('returns unique sorted ids that are neither demo nor a user account', () => {
        expect(findOrphanAccountIds(['demo-moderate', '965b15aa', 'u1', 'u2', '965b15aa'], ['u1'])).toEqual(['965b15aa', 'u2']);
    });
    it('never returns demo ids even when no users exist', () => {
        expect(findOrphanAccountIds(['demo-moderate', 'demo-aggressive'], [])).toEqual([]);
    });
});

describe('planCleanup', () => {
    it('lists orphan audits, their histories and trade counts without deleting trades', () => {
        const audits = [
            { _id: 'a1', accountId: '965b15aa', dataSource: 'real-user' },
            { _id: 'a2', accountId: 'u2', dataSource: 'real-user' },
            { _id: 'a3', accountId: 'u1', dataSource: 'real-user' },
        ];
        const histories = [
            { _id: 'h1', accountId: '965b15aa' },
            { _id: 'h2', accountId: 'u1' },
            { _id: 'h3', accountId: 'u2' },
            { _id: 'h4', accountId: 'u2' },
        ];
        const plan = planCleanup(['965b15aa', 'u2'], audits, histories, { '965b15aa': 12, u2: 0 });
        expect(plan.orphanAccountIds).toEqual(['965b15aa', 'u2']);
        expect(plan.audits).toEqual([
            { _id: 'a1', accountId: '965b15aa', dataSource: 'real-user', tradeCount: 12 },
            { _id: 'a2', accountId: 'u2', dataSource: 'real-user', tradeCount: 0 },
        ]);
        expect(plan.historyIds).toEqual(['h1', 'h3', 'h4']);
        expect(plan.tradesListedNotDeleted).toEqual([
            { accountId: '965b15aa', count: 12 },
            { accountId: 'u2', count: 0 },
        ]);
    });
});

describe('applyCleanup', () => {
    const plan = {
        orphanAccountIds: ['u2'],
        audits: [{ _id: 'a2', accountId: 'u2', dataSource: 'real-user', tradeCount: 0 }],
        historyIds: ['h3'],
        tradesListedNotDeleted: [{ accountId: 'u2', count: 0 }],
    };

    it('backs up before deleting', async () => {
        const calls: string[] = [];
        await applyCleanup(plan, {
            backup: async () => { calls.push('backup'); },
            deleteAudits: async (ids) => { calls.push(`audits:${ids.join(',')}`); },
            deleteHistories: async (ids) => { calls.push(`histories:${ids.join(',')}`); },
        });
        expect(calls).toEqual(['backup', 'audits:a2', 'histories:h3']);
    });

    it('aborts without deleting when the backup fails', async () => {
        const deleteAudits = vi.fn();
        const deleteHistories = vi.fn();
        await expect(applyCleanup(plan, {
            backup: async () => { throw new Error('disk full'); },
            deleteAudits,
            deleteHistories,
        })).rejects.toThrow('disk full');
        expect(deleteAudits).not.toHaveBeenCalled();
        expect(deleteHistories).not.toHaveBeenCalled();
    });
});

describe('dry run does not write', () => {
    it('connects with autoIndex and autoCreate off, so mongoose never builds indexes or collections', () => {
        // the connect call is not injectable, so inspect the source (1c.10 F9)
        const src = require('fs').readFileSync(require('path').resolve(__dirname, '../cleanupOrphanAudit.ts'), 'utf8');
        expect(src).toMatch(/mongoose\.connect\(uri,\s*\{[^}]*autoIndex:\s*false[^}]*\}\)/);
        expect(src).toMatch(/mongoose\.connect\(uri,\s*\{[^}]*autoCreate:\s*false[^}]*\}\)/);
    });
});

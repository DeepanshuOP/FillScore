/**
 * Remove audits (and their audithistories) whose accountId belongs to no user and is not a demo id.
 * Dry run by default; trades are listed but never deleted.
 *
 *   npx ts-node src/scripts/cleanupOrphanAudit.ts            # dry run
 *   npx ts-node src/scripts/cleanupOrphanAudit.ts --apply    # backup to .work/backups/, then delete
 *
 * Users' accountIds are their _id strings (that is what resolveAccount sets as req.accountId).
 * Audits with no accountId are not orphans by this rule; their count is printed separately.
 */
import fs from 'fs';
import path from 'path';

export interface PlanAudit { _id: unknown; accountId: string; dataSource: string }
export interface PlanHistory { _id: unknown; accountId: string }
export interface CleanupPlan {
    orphanAccountIds: string[];
    audits: { _id: unknown; accountId: string; dataSource: string; tradeCount: number }[];
    historyIds: unknown[];
    tradesListedNotDeleted: { accountId: string; count: number }[];
}

export function findOrphanAccountIds(auditAccountIds: string[], userAccountIds: string[]): string[] {
    const users = new Set(userAccountIds);
    const orphans = new Set<string>();
    for (const id of auditAccountIds) {
        if (!id || id.startsWith('demo-') || users.has(id)) continue;
        orphans.add(id);
    }
    return [...orphans].sort();
}

export function planCleanup(
    orphans: string[],
    audits: PlanAudit[],
    histories: PlanHistory[],
    tradeCounts: Record<string, number>,
): CleanupPlan {
    const set = new Set(orphans);
    return {
        orphanAccountIds: [...orphans],
        audits: audits
            .filter(a => set.has(a.accountId))
            .map(a => ({ _id: a._id, accountId: a.accountId, dataSource: a.dataSource, tradeCount: tradeCounts[a.accountId] ?? 0 })),
        historyIds: histories.filter(h => set.has(h.accountId)).map(h => h._id),
        tradesListedNotDeleted: orphans.map(accountId => ({ accountId, count: tradeCounts[accountId] ?? 0 })),
    };
}

export interface ApplyIO {
    backup: () => Promise<void>;
    deleteAudits: (ids: unknown[]) => Promise<void>;
    deleteHistories: (ids: unknown[]) => Promise<void>;
}

/** Backup first; if it throws, nothing is deleted. */
export async function applyCleanup(plan: CleanupPlan, io: ApplyIO): Promise<void> {
    await io.backup();
    await io.deleteAudits(plan.audits.map(a => a._id));
    await io.deleteHistories(plan.historyIds);
}

async function run() {
    const apply = process.argv.includes('--apply');
    const [{ default: mongoose }, { default: dotenv }, { Audit }, { AuditHistory }, { User }, { Trade }] = await Promise.all([
        import('mongoose'),
        import('dotenv'),
        import('../models/Audit'),
        import('../models/AuditHistory'),
        import('../models/User'),
        import('../models/Trade'),
    ]);
    dotenv.config({ path: path.resolve(__dirname, '../../../backend/.env') });
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI not set');
        process.exit(1);
    }
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });   // a dry run must not build indexes or collections

    const users = await User.find({}, { _id: 1 }).lean();
    const userIds = users.map(u => String(u._id));
    const audits = await Audit.find({}).lean();
    const withAccount = audits.filter(a => a.accountId);
    console.log(`Audits without accountId (ignored): ${audits.length - withAccount.length}`);

    const orphans = findOrphanAccountIds(withAccount.map(a => a.accountId), userIds);
    const histories = await AuditHistory.find({ accountId: { $in: orphans } }).lean();
    const tradeCounts: Record<string, number> = {};
    for (const id of orphans) tradeCounts[id] = await Trade.countDocuments({ accountId: id });

    const plan = planCleanup(orphans, withAccount as any, histories as any, tradeCounts);
    for (const a of plan.audits) {
        console.log(`audit ${String(a._id)} accountId=${a.accountId} dataSource=${a.dataSource} trades=${a.tradeCount}`);
    }
    console.log(`audithistories that would be deleted: ${plan.historyIds.length}`);
    console.log('Trades are listed, never deleted:', JSON.stringify(plan.tradesListedNotDeleted));

    if (!apply) {
        console.log('DRY RUN — no writes');
        await mongoose.disconnect();
        return;
    }

    const auditIdSet = new Set(plan.audits.map(a => String(a._id)));
    const historyIdSet = new Set(plan.historyIds.map(String));
    await applyCleanup(plan, {
        backup: async () => {
            const dir = path.resolve(__dirname, '../../../.work/backups');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `orphan-audits-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
            const payload = {
                audits: audits.filter(a => auditIdSet.has(String(a._id))),
                auditHistories: histories.filter(h => historyIdSet.has(String(h._id))),
            };
            fs.writeFileSync(file, JSON.stringify(payload, null, 2));
            const back = JSON.parse(fs.readFileSync(file, 'utf8'));
            if (back.audits.length !== payload.audits.length || back.auditHistories.length !== payload.auditHistories.length) {
                throw new Error('backup verification failed');
            }
            console.log(`Backup written: ${file}`);
        },
        deleteAudits: async ids => {
            const r = await Audit.deleteMany({ _id: { $in: ids as any[] } });
            console.log(`Deleted audits: ${r.deletedCount}`);
        },
        deleteHistories: async ids => {
            const r = await AuditHistory.deleteMany({ _id: { $in: ids as any[] } });
            console.log(`Deleted audithistories: ${r.deletedCount}`);
        },
    });
    await mongoose.disconnect();
}

if (require.main === module) {
    run().catch(e => {
        console.error(e);
        process.exit(1);
    });
}

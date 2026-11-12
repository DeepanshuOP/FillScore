/**
 * Seed the three Binance demos rebuilt from real prints (M2) from ml-service/demo_v2/out/<demo>/*.json.
 * DRY RUN BY DEFAULT: prints what would be replaced and writes nothing.
 *
 *   npx ts-node src/scripts/seedDemoV2.ts            # dry run
 *   npx ts-node src/scripts/seedDemoV2.ts --apply    # Deepanshu only (docs/PROGRESS.md, "Waiting for Deepanshu")
 *
 * --apply replaces, for demo-aggressive, demo-moderate and demo-disciplined only, their trades, orders and fee
 * snapshots. Every document is checked first: its accountId must be the demo it belongs to, its dataSource
 * 'synthetic-demo', and a fee snapshot must say 'published-schedule'. No other account can be touched: the plan and
 * the apply step both refuse any other id. Stored v1 audits are not touched (published grades are frozen).
 */
import fs from 'fs';
import path from 'path';
import { Types } from 'mongoose';

export const REBUILT_DEMOS = ['demo-aggressive', 'demo-moderate', 'demo-disciplined'] as const;
type Doc = Record<string, any>;
export interface DemoFiles { trades: Doc[]; orders: Doc[]; fee_snapshots: Doc[] }
export interface DemoPlan { trades: Doc[]; orders: Doc[]; feeSnapshots: Doc[]; counts: { trades: number; orders: number; feeSnapshots: number } }
export type SeedPlan = Record<string, DemoPlan>;

function isRebuilt(id: string): boolean {
    return (REBUILT_DEMOS as readonly string[]).includes(id);
}

function toDate(v: unknown, what: string): Date {
    const d = new Date(String(v));
    if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw new Error(`${what}: not an ISO date`);
    return d;
}

function check(doc: Doc, demo: string, what: string, needSource = true): void {
    if (doc.accountId !== demo) throw new Error(`${what}: accountId ${doc.accountId} inside ${demo}`);
    if (needSource && doc.dataSource !== 'synthetic-demo') throw new Error(`${what}: dataSource must be synthetic-demo`);
}

export function planDemoSeed(byDemo: Record<string, DemoFiles>): SeedPlan {
    const plan: SeedPlan = {};
    for (const [demo, f] of Object.entries(byDemo)) {
        if (!isRebuilt(demo)) throw new Error(`${demo} is not a rebuilt demo account`);
        const trades = f.trades.map((t, i) => {
            check(t, demo, `trade ${i}`);
            if (t.userId !== demo) throw new Error(`trade ${i}: userId ${t.userId} inside ${demo}`);
            return { ...t, executedAt: toDate(t.executedAt, `trade ${i}`) };
        });
        const orders = f.orders.map((o, i) => {
            check(o, demo, `order ${i}`);
            return { ...o, createdAt: toDate(o.createdAt, `order ${i}`), updatedAt: toDate(o.updatedAt, `order ${i}`) };
        });
        const feeSnapshots = f.fee_snapshots.map((s, i) => {
            check(s, demo, `fee snapshot ${i}`, false);
            if (s.source !== 'published-schedule') throw new Error(`fee snapshot ${i}: a demo snapshot is a published schedule`);
            return { ...s, fetchedAt: toDate(s.fetchedAt, `fee snapshot ${i}`) };
        });
        plan[demo] = { trades, orders, feeSnapshots, counts: { trades: trades.length, orders: orders.length, feeSnapshots: feeSnapshots.length } };
    }
    return plan;
}

export interface SeedIO { replace: (collection: 'trades' | 'orders' | 'fee_snapshots', accountId: string, docs: Doc[]) => Promise<void> }

export async function applyDemoSeed(plan: SeedPlan, io: SeedIO): Promise<void> {
    const demos = Object.keys(plan).sort();
    for (const demo of demos) if (!isRebuilt(demo)) throw new Error(`${demo} is not a rebuilt demo account`);
    for (const demo of demos) {
        await io.replace('trades', demo, plan[demo].trades);
        await io.replace('orders', demo, plan[demo].orders);
        await io.replace('fee_snapshots', demo, plan[demo].feeSnapshots);
    }
}

type ModelMap = Record<'trades' | 'orders' | 'fee_snapshots', any>;
const COLLECTION_OF: Record<string, 'trades' | 'orders' | 'fee_snapshots'> = { trades: 'trades', orders: 'orders', feeSnapshots: 'fee_snapshots' };

/** Every document the Mongoose schemas would reject, as "<collection> <demo> #<i>: <message>". The dry run prints
 *  these and refuses to continue, so a dry run that passes proves the apply cannot fail on validation. */
export function validateWithModels(plan: SeedPlan, models: ModelMap): string[] {
    const errors: string[] = [];
    for (const [demo, p] of Object.entries(plan)) {
        for (const key of ['trades', 'orders', 'feeSnapshots'] as const) {
            const coll = COLLECTION_OF[key];
            p[key].forEach((doc, i) => {
                const err = new models[coll](doc).validateSync();
                if (err) errors.push(`${coll} ${demo} #${i}: ${err.message}`);
            });
        }
    }
    return errors;
}

/** Replace one demo account's documents in one collection without ever leaving it empty: insert the new documents
 *  (with ids chosen here), and only then delete the account's other documents. If the insert fails, the documents it
 *  did insert are removed again, so the account keeps exactly its old documents (review M2, medium 2). */
export function mongoReplace(models: ModelMap) {
    return async (collection: 'trades' | 'orders' | 'fee_snapshots', accountId: string, docs: Doc[]): Promise<void> => {
        if (!isRebuilt(accountId)) throw new Error(`${accountId} is not a rebuilt demo account`);
        const m = models[collection];
        const withIds = docs.map(d => ({ ...d, _id: new Types.ObjectId() }));
        const ids = withIds.map(d => d._id);
        try {
            if (withIds.length) await m.insertMany(withIds, { ordered: true });
        } catch (e: any) {
            await m.deleteMany({ accountId, _id: { $in: ids } });
            const dup = e?.code === 11000 || /E11000/.test(String(e?.message));
            throw new Error(`${collection} ${accountId}: insert failed, old documents kept${dup ? ' (duplicate key: already applied?)' : ''}: ${e?.message}`);
        }
        await m.deleteMany({ accountId, _id: { $nin: ids } });
    };
}

export function readDemoFiles(outDir: string): Record<string, DemoFiles> {
    const read = (demo: string, name: string) => JSON.parse(fs.readFileSync(path.join(outDir, demo, `${name}.json`), 'utf8'));
    return Object.fromEntries(REBUILT_DEMOS.map(d => [d, { trades: read(d, 'trades'), orders: read(d, 'orders'), fee_snapshots: read(d, 'fee_snapshots') }]));
}

async function run() {
    const apply = process.argv.includes('--apply');
    const outDir = path.resolve(__dirname, '../../../ml-service/demo_v2/out');
    const plan = planDemoSeed(readDemoFiles(outDir));
    for (const [demo, p] of Object.entries(plan)) console.log(`${demo}: ${JSON.stringify(p.counts)}`);
    const [{ default: mongoose }, { loadEnv }, { Trade }, { Order }, { FeeSnapshot }] = await Promise.all([
        import('mongoose'), import('../config/env'), import('../models/Trade'), import('../models/Order'), import('../models/FeeSnapshot'),
    ]);
    const models: ModelMap = { trades: Trade, orders: Order, fee_snapshots: FeeSnapshot };
    const errors = validateWithModels(plan, models);                 // no database needed
    if (errors.length) {
        console.error(`${errors.length} document(s) fail schema validation; nothing written:\n${errors.slice(0, 20).join('\n')}`);
        process.exit(1);
    }
    console.log('All documents pass schema validation.');
    if (!apply) {
        console.log('Dry run: nothing written. Re-run with --apply to replace these demo accounts.');
        return;
    }
    await mongoose.connect(loadEnv().MONGODB_URI);
    for (const demo of Object.keys(plan)) {
        const before = await Promise.all([Trade.countDocuments({ accountId: demo }), Order.countDocuments({ accountId: demo }), FeeSnapshot.countDocuments({ accountId: demo })]);
        console.log(`${demo} before: trades ${before[0]}, orders ${before[1]}, fee snapshots ${before[2]}`);
    }
    const replace = mongoReplace(models);
    await applyDemoSeed(plan, {
        replace: async (collection, accountId, docs) => {
            await replace(collection, accountId, docs);
            console.log(`${collection}: ${accountId} replaced with ${docs.length}`);
        },
    });
    await mongoose.disconnect();
}

if (require.main === module) {
    run().catch(e => { console.error(e); process.exit(1); });
}

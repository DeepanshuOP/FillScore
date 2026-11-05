/**
 * Swap the Trade unique index from {userId, exchange, tradeId} to {userId, exchange, symbol, tradeId}.
 *   npx tsx src/scripts/migrateTradeIndex.ts              # dry-run (default): prints, changes nothing
 *   npx tsx src/scripts/migrateTradeIndex.ts --apply      # creates the new index, then drops the old one
 * Idempotent: re-running after --apply reports nothing to do.
 */
import mongoose from 'mongoose';

export const OLD_KEY = { userId: 1, exchange: 1, tradeId: 1 };
export const NEW_KEY = { userId: 1, exchange: 1, symbol: 1, tradeId: 1 };
export const NEW_NAME = 'userId_1_exchange_1_symbol_1_tradeId_1';

export interface IndexCollection {
    indexes(): Promise<Array<{ name?: string; key: Record<string, number>; unique?: boolean }>>;
    aggregate(p: object[]): { toArray(): Promise<any[]> };
    createIndex(key: object, opts: object): Promise<string>;
    dropIndex(name: string): Promise<unknown>;
}

const sameKey = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

export async function migrateTradeIndex(col: IndexCollection, apply: boolean, log: (s: string) => void = console.log) {
    const idx = await col.indexes();
    log('Existing indexes:');
    idx.forEach(i => log(`  ${i.name}  ${JSON.stringify(i.key)}${i.unique ? '  unique' : ''}`));

    const old = idx.find(i => sameKey(i.key, OLD_KEY));
    const hasNew = idx.some(i => sameKey(i.key, NEW_KEY));

    const dupes = await col.aggregate([
        { $group: { _id: { userId: '$userId', exchange: '$exchange', symbol: '$symbol', tradeId: '$tradeId' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
        { $limit: 1000 },
    ]).toArray();
    log(`Duplicates under the new key: ${dupes.length}`);
    if (dupes.length > 0) {
        log('Refusing: resolve duplicates before the unique index can be built.');
        return { changed: false, duplicates: dupes.length, refused: true };
    }

    const steps: string[] = [];
    if (!hasNew) steps.push(`createIndex(${JSON.stringify(NEW_KEY)}, { unique: true, name: '${NEW_NAME}' })`);
    if (old) steps.push(`dropIndex('${old.name}')`);
    if (steps.length === 0) { log('Nothing to do (already migrated).'); return { changed: false, duplicates: 0, refused: false }; }

    log(apply ? 'Applying:' : 'Dry-run, would do (in this order):');
    steps.forEach(s => log(`  ${s}`));
    if (!apply) { log('Re-run with --apply to execute.'); return { changed: false, duplicates: 0, refused: false }; }

    if (!hasNew) await col.createIndex(NEW_KEY, { unique: true, name: NEW_NAME });
    if (old) await col.dropIndex(old.name!);
    log('Done.');
    return { changed: true, duplicates: 0, refused: false };
}

if (require.main === module) {
    (async () => {
        const { loadEnv } = await import('../config/env');
        loadEnv();
        await mongoose.connect(process.env.MONGODB_URI!);
        const col = mongoose.connection.collection('trades') as unknown as IndexCollection;
        await migrateTradeIndex(col, process.argv.includes('--apply'));
        await mongoose.disconnect();
    })().catch(e => { console.error(e.message); process.exit(1); });
}

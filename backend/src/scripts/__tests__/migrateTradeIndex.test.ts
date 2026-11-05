import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { migrateTradeIndex, IndexCollection } from '../migrateTradeIndex';
import { loadEnv } from '../../config/env';

loadEnv();

describe('migrateTradeIndex (in-memory mongo, throwaway collection)', () => {
    const name = 'trades_migration_test';
    let col: any;
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        col = mongoose.connection.collection(name);
        await col.deleteMany({});
        await col.createIndex({ userId: 1, exchange: 1, tradeId: 1 }, { unique: true });
        // same tradeId '7' on two symbols cannot coexist under the old index; store distinct ones
        await col.insertMany([
            { userId: 'u', exchange: 'binance', symbol: 'BTCUSDT', tradeId: '7' },
            { userId: 'u', exchange: 'binance', symbol: 'ETHUSDT', tradeId: '8' },
        ]);
    });
    afterAll(async () => { await col.drop().catch(() => {}); });

    it('dry-run lists indexes, reports 0 duplicates, prints create+drop, changes nothing', async () => {
        const out: string[] = [];
        const r = await migrateTradeIndex(col as IndexCollection, false, s => out.push(s));
        const text = out.join('\n');
        expect(text).toContain('userId_1_exchange_1_tradeId_1');
        expect(text).toContain('Duplicates under the new key: 0');
        expect(text).toContain("createIndex({\"userId\":1,\"exchange\":1,\"symbol\":1,\"tradeId\":1}");
        expect(text).toContain("dropIndex('userId_1_exchange_1_tradeId_1')");
        expect(text.indexOf('createIndex')).toBeLessThan(text.indexOf('dropIndex'));
        expect(r.changed).toBe(false);
        expect((await col.indexes()).map((i: any) => i.name)).toContain('userId_1_exchange_1_tradeId_1');
    });

    it('--apply creates the new index then drops the old; second apply is a no-op', async () => {
        const r = await migrateTradeIndex(col as IndexCollection, true, () => {});
        expect(r.changed).toBe(true);
        const names = (await col.indexes()).map((i: any) => i.name);
        expect(names).toContain('userId_1_exchange_1_symbol_1_tradeId_1');
        expect(names).not.toContain('userId_1_exchange_1_tradeId_1');
        const out: string[] = [];
        const r2 = await migrateTradeIndex(col as IndexCollection, true, s => out.push(s));
        expect(r2.changed).toBe(false);
        expect(out.join('\n')).toContain('Nothing to do');
    });
});

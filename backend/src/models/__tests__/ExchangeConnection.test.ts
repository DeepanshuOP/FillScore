import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { ExchangeConnection } from '../ExchangeConnection';
import { loadEnv } from '../../config/env';

loadEnv();

describe('ExchangeConnection Model', () => {
    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
        await ExchangeConnection.init(); // ensure indexes are built before tests
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });
    
    afterEach(async () => {
        // Cleanup connections created during testing to avoid polluting real seed database
        await ExchangeConnection.deleteMany({ accountId: { $regex: /^test_/ } });
    });

    it('Requires accountId to save', async () => {
        const conn = new ExchangeConnection({
            exchange: 'binance',
            encryptedApiKey: { iv: 'a', encrypted: 'b', authTag: 'c' },
            encryptedApiSecret: { iv: 'a', encrypted: 'b', authTag: 'c' }
        });
        await expect(conn.save()).rejects.toThrow(/Path `accountId` is required/);
    });

    it('Duplicate accountId+exchange throws a Mongo duplicate-key error', async () => {
        const accountId = `test_acc_${Date.now()}`;
        
        const conn1 = new ExchangeConnection({
            accountId,
            exchange: 'binance',
            encryptedApiKey: { iv: 'a', encrypted: 'b', authTag: 'c' },
            encryptedApiSecret: { iv: 'a', encrypted: 'b', authTag: 'c' }
        });
        await conn1.save();

        const conn2 = new ExchangeConnection({
            accountId,
            exchange: 'binance',
            encryptedApiKey: { iv: 'a', encrypted: 'b', authTag: 'c' },
            encryptedApiSecret: { iv: 'a', encrypted: 'b', authTag: 'c' }
        });

        await expect(conn2.save()).rejects.toThrow(/E11000 duplicate key error/);
    });

    it('Allows the same accountId to connect different exchanges', async () => {
        const accountId = `test_acc_multi_${Date.now()}`;
        
        const conn1 = new ExchangeConnection({
            accountId,
            exchange: 'binance',
            encryptedApiKey: { iv: 'a', encrypted: 'b', authTag: 'c' },
            encryptedApiSecret: { iv: 'a', encrypted: 'b', authTag: 'c' }
        });
        await conn1.save();

        const conn2 = new ExchangeConnection({
            accountId,
            exchange: 'bybit',
            encryptedApiKey: { iv: 'a', encrypted: 'b', authTag: 'c' },
            encryptedApiSecret: { iv: 'a', encrypted: 'b', authTag: 'c' }
        });

        await conn2.save(); // Should not throw
        
        const count = await ExchangeConnection.countDocuments({ accountId });
        expect(count).toBe(2);
    });
});

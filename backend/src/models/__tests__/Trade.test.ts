import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Trade } from '../Trade';

import { loadEnv } from '../../config/env';

loadEnv();

describe('Trade Model', () => {
    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await Trade.deleteMany({});
    });

    it('requires accountId to save', async () => {
        const trade = new Trade({
            userId: 'user1',
            exchange: 'binance',
            symbol: 'BTCUSDT',
            tradeId: 't1',
            orderId: 'o1',
            side: 'BUY',
            orderType: 'MARKET',
            isMaker: false,
            executionPrice: 50000,
            quantity: 1,
            notional: 50000,
            fee: 10,
            feeAsset: 'USDT',
            executedAt: new Date()
        });

        await expect(trade.save()).rejects.toThrow(/accountId.*required/);
    });

    it('saves successfully with accountId', async () => {
        const trade = new Trade({
            userId: 'user1',
            accountId: 'acc1',
            dataSource: 'synthetic-demo',
            exchange: 'binance',
            symbol: 'BTCUSDT',
            tradeId: 't1',
            orderId: 'o1',
            side: 'BUY',
            orderType: 'MARKET',
            isMaker: false,
            executionPrice: 50000,
            quantity: 1,
            notional: 50000,
            fee: 10,
            feeAsset: 'USDT',
            executedAt: new Date()
        });

        const saved = await trade.save();
        expect(saved.accountId).toBe('acc1');
    });

    it('has an index on accountId', async () => {
        await Trade.createIndexes();
        const indexes = await Trade.collection.indexes();
        const hasAccountIdIndex = indexes.some(idx => idx.key.accountId === 1);
        expect(hasAccountIdIndex).toBe(true);
    });

    it('requires dataSource to save', async () => {
        const trade = new Trade({
            userId: 'user1',
            accountId: 'acc1',
            exchange: 'binance',
            symbol: 'BTCUSDT',
            tradeId: 't_no_ds',
            orderId: 'o1',
            side: 'BUY',
            orderType: 'MARKET',
            isMaker: false,
            executionPrice: 50000,
            quantity: 1,
            notional: 50000,
            fee: 10,
            feeAsset: 'USDT',
            executedAt: new Date()
        });
        await expect(trade.save()).rejects.toThrow(/dataSource.*required/);
    });

    it('rejects invalid dataSource', async () => {
        const trade = new Trade({
            userId: 'user1',
            accountId: 'acc1',
            dataSource: 'invalid-source',
            exchange: 'binance',
            symbol: 'BTCUSDT',
            tradeId: 't_inv_ds',
            orderId: 'o1',
            side: 'BUY',
            orderType: 'MARKET',
            isMaker: false,
            executionPrice: 50000,
            quantity: 1,
            notional: 50000,
            fee: 10,
            feeAsset: 'USDT',
            executedAt: new Date()
        });
        await expect(trade.save()).rejects.toThrow(/dataSource.*enum/);
    });

    it('prevents mutation of dataSource (immutable)', async () => {
        const trade = new Trade({
            userId: 'user1',
            accountId: 'acc1',
            dataSource: 'synthetic-demo',
            exchange: 'binance',
            symbol: 'BTCUSDT',
            tradeId: 't_immut',
            orderId: 'o2',
            side: 'BUY',
            orderType: 'MARKET',
            isMaker: false,
            executionPrice: 50000,
            quantity: 1,
            notional: 50000,
            fee: 10,
            feeAsset: 'USDT',
            executedAt: new Date()
        });

        const saved = await trade.save();
        expect(saved.dataSource).toBe('synthetic-demo');

        saved.dataSource = 'real-user';
        await saved.save();
        const refetched = await Trade.findById(saved._id);
        expect(refetched?.dataSource).toBe('synthetic-demo');

        const updated = await Trade.findOneAndUpdate(
            { _id: saved._id },
            { $set: { dataSource: 'real-user' } },
            { new: true }
        );
        expect(updated?.dataSource).toBe('synthetic-demo');
    });
});

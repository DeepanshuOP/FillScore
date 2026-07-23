import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Audit } from '../Audit';

import { loadEnv } from '../../config/env';

loadEnv();

describe('Audit Model', () => {
    beforeAll(async () => {
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI not set");
        await mongoose.connect(uri);
    });

    afterAll(async () => {
        await mongoose.disconnect();
    });

    afterEach(async () => {
        await Audit.deleteMany({});
    });

    it('requires accountId to save', async () => {
        const audit = new Audit({
            userId: 'user1',
            period: { start: new Date(), end: new Date() },
            exchange: 'binance',
            totalTrades: 10,
            totalNotional: 1000,
            avgFillScore: 90,
            fillGrade: 'A',
            estimatedLossUSD: 5,
            breakdown: {
                avgSlippageBps: 1,
                avgFeeDragBps: 1,
                makerRatio: 0.5,
                bestHour: 10,
                worstHour: 15,
                bestSymbol: 'BTCUSDT',
                worstSymbol: 'ETHUSDT'
            }
        });

        await expect(audit.save()).rejects.toThrow(/accountId.*required/);
    });

    it('saves successfully with accountId', async () => {
        const audit = new Audit({
            userId: 'user1',
            accountId: 'acc1',
            dataSource: 'synthetic-demo',
            period: { start: new Date(), end: new Date() },
            exchange: 'binance',
            totalTrades: 10,
            totalNotional: 1000,
            avgFillScore: 90,
            fillGrade: 'A',
            estimatedLossUSD: 5,
            breakdown: {
                avgSlippageBps: 1,
                avgFeeDragBps: 1,
                makerRatio: 0.5,
                bestHour: 10,
                worstHour: 15,
                bestSymbol: 'BTCUSDT',
                worstSymbol: 'ETHUSDT'
            }
        });

        const saved = await audit.save();
        expect(saved.accountId).toBe('acc1');
    });

    it('has an index on accountId', async () => {
        await Audit.createIndexes();
        const indexes = await Audit.collection.indexes();
        const hasAccountIdIndex = indexes.some(idx => idx.key.accountId === 1);
        expect(hasAccountIdIndex).toBe(true);
    });

    it('requires dataSource to save', async () => {
        const audit = new Audit({
            userId: 'user1',
            accountId: 'acc1',
            period: { start: new Date(), end: new Date() },
            exchange: 'binance',
            totalTrades: 10,
            totalNotional: 1000,
            avgFillScore: 90,
            fillGrade: 'A',
            estimatedLossUSD: 5,
            breakdown: {
                avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0.5,
                bestHour: 10, worstHour: 15, bestSymbol: 'BTC', worstSymbol: 'ETH'
            }
        });
        await expect(audit.save()).rejects.toThrow(/dataSource.*required/);
    });

    it('rejects invalid dataSource', async () => {
        const audit = new Audit({
            userId: 'user1',
            accountId: 'acc1',
            dataSource: 'invalid-source',
            period: { start: new Date(), end: new Date() },
            exchange: 'binance',
            totalTrades: 10,
            totalNotional: 1000,
            avgFillScore: 90,
            fillGrade: 'A',
            estimatedLossUSD: 5,
            breakdown: {
                avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0.5,
                bestHour: 10, worstHour: 15, bestSymbol: 'BTC', worstSymbol: 'ETH'
            }
        });
        await expect(audit.save()).rejects.toThrow(/dataSource.*enum/);
    });

    it('prevents mutation of dataSource (immutable)', async () => {
        const audit = new Audit({
            userId: 'user1',
            accountId: 'acc1',
            dataSource: 'synthetic-demo',
            period: { start: new Date(), end: new Date() },
            exchange: 'binance',
            totalTrades: 10,
            totalNotional: 1000,
            avgFillScore: 90,
            fillGrade: 'A',
            estimatedLossUSD: 5,
            breakdown: {
                avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0.5,
                bestHour: 10, worstHour: 15, bestSymbol: 'BTC', worstSymbol: 'ETH'
            }
        });

        const saved = await audit.save();
        expect(saved.dataSource).toBe('synthetic-demo');

        saved.dataSource = 'real-user';
        await saved.save();
        const refetched = await Audit.findById(saved._id);
        expect(refetched?.dataSource).toBe('synthetic-demo');

        const updated = await Audit.findOneAndUpdate(
            { _id: saved._id },
            { $set: { dataSource: 'real-user' } },
            { new: true }
        );
        expect(updated?.dataSource).toBe('synthetic-demo');
    });
});

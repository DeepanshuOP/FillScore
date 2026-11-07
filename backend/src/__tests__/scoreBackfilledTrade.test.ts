import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mongoose from 'mongoose';
import { scoreTrade } from '../scoring/engine';
import { executeAuditPipeline } from '../routes/audit';
import { Trade } from '../models/Trade';
import { Audit } from '../models/Audit';
import { EnrichedTrade } from '../types';
import { loadEnv } from '../config/env';

loadEnv();

// A trade shaped like one the 4a backfill touched, AFTER the 4R-0 fix: spreadBps stays the scorer's number and the
// estimator output lives in spreadEstimates / halfSpreadBps.
const base = {
    userId: 'bf-user', accountId: 'bf-user', exchange: 'binance', symbol: 'BTCUSDT', tradeId: 't', orderId: 'o',
    side: 'BUY', orderType: 'LIMIT', isMaker: true, executionPrice: 40000, quantity: 0.1, notional: 4000,
    fee: 0.4, feeUsd: 0.4, feeAsset: 'USDT', executedAt: new Date('2024-01-15T10:00:00Z'),
    arrivalPriceProxy: 40000, spreadBps: 1.2,
} as unknown as EnrichedTrade;
const backfilled = {
    ...base,
    spreadEstimates: { cs: 3.05, ar: 2.71, n_pairs: 60, version: 1 },
    halfSpreadBps: 1.354,
    postPrices: { '1': 40001, '5': 40002, '30': null, '60': null, '300': null },
    markoutVersion: 1,
} as unknown as EnrichedTrade;

describe('scoring a backfilled trade', () => {
    it('spread score is unchanged by the extra enrichment fields', () => {
        // spreadBps 1.2 <= 1.5 -> exchangeScore 100 (never driven by the estimates 3.05 / 2.71, which would give 40)
        expect(scoreTrade(backfilled).exchangeScore).toBe(100);
        expect(scoreTrade(backfilled)).toEqual(scoreTrade(base));
    });
});

describe('scoreTrade with spreadBps missing (pins today\'s behaviour: refuses, never guesses)', () => {
    // Snapshot of current behaviour: undefined/null -> "missing spreadBps enrichment"; NaN -> assertValidNumber.
    // executeAuditPipeline catches per trade and skips it, so this is "no throw" at pipeline level.
    it('undefined', () => expect(() => scoreTrade({ ...base, spreadBps: undefined } as any)).toThrow(/missing spreadBps/));
    it('null', () => expect(() => scoreTrade({ ...base, spreadBps: null } as any)).toThrow(/missing spreadBps/));
    it('NaN', () => expect(() => scoreTrade({ ...base, spreadBps: NaN } as any)).toThrow(/spreadBps/));
});

describe('executeAuditPipeline on backfilled trades', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
        // raw insert, as the python backfill writes (bypasses mongoose strict stripping)
        await Trade.collection.insertMany([1, 2, 3].map(i => ({
            ...(backfilled as any), tradeId: `bf${i}`, dataSource: 'real-user',
            executedAt: new Date(`2024-01-15T1${i}:00:00Z`),
        })));
    });
    afterAll(async () => {
        await Trade.deleteMany({ accountId: 'bf-user' });
        await Audit.deleteMany({});
    });

    it('returns an audit, not no_trades_found', async () => {
        const audit: any = await executeAuditPipeline('bf-user');
        expect(audit).toBeTruthy();
        expect(audit.tradesScored ?? audit.breakdown?.tradesScored ?? 3).toBeGreaterThan(0);
        const stored = await Trade.collection.findOne({ accountId: 'bf-user', tradeId: 'bf1' });
        expect(stored!.spreadEstimates).toEqual({ cs: 3.05, ar: 2.71, n_pairs: 60, version: 1 });
        expect(typeof stored!.spreadBps).toBe('number');
    });
});

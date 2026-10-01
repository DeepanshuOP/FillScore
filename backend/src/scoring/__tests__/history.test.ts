import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { Trade } from '../../models/Trade';
import { Audit } from '../../models/Audit';
import { AuditHistory } from '../../models/AuditHistory';
import { executeAuditPipeline } from '../../routes/audit';
import { getAuditHistory } from '../history';
import { SCORING_VERSION } from '../../config/versions';
import { loadEnv } from '../../config/env';

loadEnv();

const trade = (accountId: string, tradeId: string, extra: Record<string, unknown> = {}) => ({
    userId: accountId, accountId,
    dataSource: accountId.startsWith('demo-') ? 'synthetic-demo' : 'real-user',
    exchange: 'binance', tradeId, orderId: `o-${tradeId}`, symbol: 'BTCUSDT', side: 'BUY',
    orderType: 'MARKET', isMaker: false, quantity: 1, executionPrice: 50000, notional: 50000,
    fee: 50, feeAsset: 'USDT', executedAt: new Date('2026-09-10T12:00:00Z'),
    arrivalPriceProxy: 50000, vwap5min: 50000, spreadBps: 1.0, ...extra,
});

describe('audit history snapshots', () => {
    beforeAll(async () => {
        await mongoose.connect(process.env.MONGODB_URI!);
    });

    afterEach(async () => {
        await Trade.deleteMany({});
        await Audit.deleteMany({});
        await AuditHistory.deleteMany({});
    });

    it('appends a snapshot for a real account on every run, even when nothing changed', async () => {
        await Trade.create(trade('real-1', 't1'));

        await executeAuditPipeline('real-1');
        await executeAuditPipeline('real-1');

        const history = await AuditHistory.find({ accountId: 'real-1' }).sort({ snapshotAt: 1 });
        expect(history).toHaveLength(2);
        expect(history[0].dataSource).toBe('real-user');
        expect(history[0].scoringVersion).toBe(SCORING_VERSION);
        expect(history[0].totalTrades).toBe(1);
        // the canonical audit is still a single upserted document
        expect(await Audit.countDocuments({ accountId: 'real-1' })).toBe(1);
    });

    it('snapshots carry the same numbers as the audit they came from', async () => {
        await Trade.create(trade('real-2', 't1'));
        const { savedAudit } = await executeAuditPipeline('real-2');

        const snap = (await AuditHistory.findOne({ accountId: 'real-2' }))!;
        expect(snap.avgFillScore).toBe(savedAudit.avgFillScore);
        expect(snap.fillGrade).toBe(savedAudit.fillGrade);
        expect(snap.totalNotional).toBe(savedAudit.totalNotional);
        expect(snap.avgSlippageBps).toBe(savedAudit.breakdown.avgSlippageBps);
        expect(snap.makerRatio).toBe(savedAudit.breakdown.makerRatio);
    });

    it('does not pile up identical snapshots for a demo account that has not changed', async () => {
        await Trade.create(trade('demo-disciplined', 't1'));

        await executeAuditPipeline('demo-disciplined');
        await executeAuditPipeline('demo-disciplined');
        await executeAuditPipeline('demo-disciplined');
        expect(await AuditHistory.countDocuments({ accountId: 'demo-disciplined' })).toBe(1);

        await Trade.create(trade('demo-disciplined', 't2', { executionPrice: 50500 }));
        await executeAuditPipeline('demo-disciplined');
        expect(await AuditHistory.countDocuments({ accountId: 'demo-disciplined' })).toBe(2);
    });

    it('getAuditHistory returns the account\'s own points oldest first and respects the limit', async () => {
        await AuditHistory.create([
            { accountId: 'real-3', dataSource: 'real-user', scoringVersion: '1.0.0', avgFillScore: 70, fillGrade: 'C', totalTrades: 5, totalNotional: 1, estimatedLossUSD: 0, avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0, periodStart: new Date(), periodEnd: new Date(), snapshotAt: new Date('2026-08-01') },
            { accountId: 'real-3', dataSource: 'real-user', scoringVersion: '1.0.0', avgFillScore: 75, fillGrade: 'B', totalTrades: 9, totalNotional: 1, estimatedLossUSD: 0, avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0, periodStart: new Date(), periodEnd: new Date(), snapshotAt: new Date('2026-09-01') },
            { accountId: 'real-3', dataSource: 'real-user', scoringVersion: '1.0.0', avgFillScore: 80, fillGrade: 'B', totalTrades: 12, totalNotional: 1, estimatedLossUSD: 0, avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0, periodStart: new Date(), periodEnd: new Date(), snapshotAt: new Date('2026-09-20') },
            { accountId: 'someone-else', dataSource: 'real-user', scoringVersion: '1.0.0', avgFillScore: 11, fillGrade: 'F', totalTrades: 1, totalNotional: 1, estimatedLossUSD: 0, avgSlippageBps: 1, avgFeeDragBps: 1, makerRatio: 0, periodStart: new Date(), periodEnd: new Date(), snapshotAt: new Date('2026-09-05') },
        ]);

        const all = await getAuditHistory('real-3', 90);
        expect(all.map(p => p.avgFillScore)).toEqual([70, 75, 80]);
        expect(all[0]).not.toHaveProperty('accountId');

        // a small limit keeps the NEWEST points, still oldest first
        const latestTwo = await getAuditHistory('real-3', 2);
        expect(latestTwo.map(p => p.avgFillScore)).toEqual([75, 80]);
    });
});

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { Audit } from '../../models/Audit';
import { Trade } from '../../models/Trade';
import { descriptiveAudit, isStaleRecommendations } from '../auditText';
import { findAdviceTerms, KNOWN_BAD_STRINGS } from '../../constants/adviceTerms';
import { loadEnv } from '../../config/env';

loadEnv();
const A = 'demo-guardtest';

describe('stored audits with old advice wording are never served as-is', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    afterEach(async () => { await Audit.deleteMany({ accountId: A }); await Trade.deleteMany({ accountId: A }); });

    it('regenerates only the recommendation text; every score field is unchanged', async () => {
        for (let i = 0; i < 4; i++) {
            await Trade.create({
                accountId: A, userId: A, dataSource: 'synthetic-demo', exchange: 'binance', symbol: 'BTCUSDT', tradeId: `g${i}`, orderId: `o${i}`,
                side: 'BUY', orderType: 'MARKET', isMaker: false, executionPrice: 40100, quantity: 0.1, notional: 4010, fee: 4, feeUsd: 4, feeAsset: 'USDT',
                executedAt: new Date(Date.UTC(2024, 0, 2 + i, 23, 0)), arrivalPriceProxy: 40000, spreadBps: 2, fillScore: 70, fillGrade: 'C',
            });
        }
        const stored = await Audit.create({
            accountId: A, userId: A, dataSource: 'synthetic-demo', period: { start: new Date('2024-01-02'), end: new Date('2024-01-31') },
            exchange: 'binance', totalTrades: 4, totalNotional: 16040, avgFillScore: 60.67469266790485, fillGrade: 'C', estimatedLossUSD: 80,
            breakdown: { avgSlippageBps: 25, avgFeeDragBps: 10, makerRatio: 0, bestHour: 23, worstHour: 23, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' },
            recommendations: KNOWN_BAD_STRINGS,
        } as any);
        expect(isStaleRecommendations(stored.recommendations)).toBe(true);

        const before = JSON.stringify({ ...stored.toObject(), recommendations: undefined });
        const served = await descriptiveAudit(stored, A);
        const after = JSON.stringify({ ...served, recommendations: undefined });
        expect(after).toBe(before); // scores/breakdown byte-identical
        expect(served.recommendations.length).toBeGreaterThan(0);
        expect(findAdviceTerms(served.recommendations.join('\n'))).toEqual([]);
        for (const bad of KNOWN_BAD_STRINGS) expect(served.recommendations).not.toContain(bad);
    });

    it('clean stored text is passed through untouched', async () => {
        const clean = ['You used market orders for 100% of trades, paying taker fees on each.'];
        const out = await descriptiveAudit({ recommendations: clean, breakdown: {} }, A);
        expect(out.recommendations).toEqual(clean);
    });
});

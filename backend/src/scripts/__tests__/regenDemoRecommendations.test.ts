import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { regenDemoRecommendations } from '../regenDemoRecommendations';
import { Audit } from '../../models/Audit';
import { Trade } from '../../models/Trade';
import { KNOWN_BAD_STRINGS, findAdviceTerms } from '../../constants/adviceTerms';
import { loadEnv } from '../../config/env';

loadEnv();
const A = 'demo-disciplined';

describe('regenDemoRecommendations (in-memory mongo)', () => {
    beforeAll(async () => { await mongoose.connect(process.env.MONGODB_URI!); });
    afterEach(async () => { await Audit.deleteMany({ accountId: A }); await Trade.deleteMany({ accountId: A }); });

    async function seed() {
        for (let i = 0; i < 4; i++) {
            await Trade.create({ accountId: A, userId: A, dataSource: 'synthetic-demo', exchange: 'binance', symbol: 'BTCUSDT', tradeId: `r${i}`, orderId: `o${i}`, side: 'BUY', orderType: 'MARKET', isMaker: false, executionPrice: 40100, quantity: 0.1, notional: 4010, fee: 4, feeUsd: 4, feeAsset: 'USDT', executedAt: new Date(Date.UTC(2024, 0, 2 + i, 23)), arrivalPriceProxy: 40000, spreadBps: 2, fillScore: 70, fillGrade: 'C' });
        }
        return Audit.create({ accountId: A, userId: A, dataSource: 'synthetic-demo', period: { start: new Date('2024-01-02'), end: new Date('2024-01-31') }, exchange: 'binance', totalTrades: 4, totalNotional: 16040, avgFillScore: 95.88542572161496, fillGrade: 'A', estimatedLossUSD: 80, breakdown: { avgSlippageBps: 25, avgFeeDragBps: 10, makerRatio: 0, bestHour: 23, worstHour: 23, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' }, recommendations: KNOWN_BAD_STRINGS } as any);
    }

    it('dry-run writes nothing and shows the diff; the write mode changes recommendations only and is idempotent', async () => {
        const a = await seed();
        const out: string[] = [];
        const r = await regenDemoRecommendations(false, s => out.push(s));
        expect(r.changed).toBe(1);
        expect(out.join('\n')).toContain('score fields byte-identical');
        expect(out.join('\n')).toContain('Your biggest opportunity'); // old line shown as "-"
        expect((await Audit.findById(a._id))!.recommendations).toEqual(KNOWN_BAD_STRINGS); // untouched by the dry-run

        const before = JSON.stringify({ ...(await Audit.findById(a._id))!.toObject(), recommendations: 0 });
        await regenDemoRecommendations(true, () => {});
        const after = await Audit.findById(a._id);
        expect(JSON.stringify({ ...after!.toObject(), recommendations: 0 })).toBe(before);
        expect(after!.avgFillScore).toBe(95.88542572161496);
        expect(findAdviceTerms(after!.recommendations.join('\n'))).toEqual([]);

        expect((await regenDemoRecommendations(true, () => {})).changed).toBe(0);
    });
});

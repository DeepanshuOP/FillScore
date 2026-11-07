import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateRecommendations } from '../scoring/audit';
import { buildCoach } from '../scoring/coach';
import { EnrichedTrade, AuditSummary } from '../types';

// Old strings from audit §2.10 that must never be generated again.
const BANNED = ['retail average', 'Poor execution quality has cost you', 'per 30 days', '(modelled)', 'Lowest-slippage venue'];

// Fixture: 4 taker fills, 25 bps slippage, 10 bps fee drag, trading 22:00-07:00 UTC so every rec branch fires.
const trades: EnrichedTrade[] = [0, 1, 2, 3].map(i => ({
    userId: 'u', exchange: 'binance', symbol: 'BTCUSDT', tradeId: `t${i}`, orderId: `o${i}`, side: 'BUY', orderType: 'MARKET',
    isMaker: false, executionPrice: 40100, quantity: 0.1, notional: 4010, fee: 4.01, feeUsd: 4.01, feeAsset: 'USDT',
    executedAt: new Date(`2024-01-0${i + 2}T23:00:00Z`), arrivalPriceProxy: 40000, spreadBps: 1,
}) as unknown as EnrichedTrade);
const summary = {
    userId: 'u', period: { start: new Date('2024-01-02'), end: new Date('2024-01-31') }, exchange: 'binance',
    totalTrades: 4, totalNotional: 16040, avgFillScore: 60, fillGrade: 'C', estimatedLossUSD: 80,
    breakdown: { avgSlippageBps: 25, avgFeeDragBps: 10, makerRatio: 0, bestHour: 10, worstHour: 23, bestSymbol: 'BTCUSDT', worstSymbol: 'BTCUSDT' },
    recommendations: [], createdAt: new Date(),
} as unknown as AuditSummary;

describe('copy honesty (audit §2.10)', () => {
    const recs = generateRecommendations(summary, trades);
    it('recommendations contain none of the banned strings', () => {
        const text = recs.join('\n');
        for (const b of BANNED) expect(text, b).not.toContain(b);
    });
    it('fee-cost sentence is the reference-level wording; taker line states fees paid', () => {
        expect(recs.some(r => /^Fees above 2 bps of notional came to \$[\d,.]+ over this period/.test(r))).toBe(true);
        // 4 taker fills x $4.01 = $16.04
        expect(recs.some(r => r.includes('You paid $16.04 in fees on taker fills this period'))).toBe(true);
    });
    it('coach output contains none of the banned strings', () => {
        const actions = JSON.stringify(buildCoach({
            breakdown: summary.breakdown as any, periodText: 'this period',
            trades: trades.map(t => ({ ...t, fillScore: 60, slippageScore: 50, feeScore: 0, timingScore: 50, exchangeScore: 100 })) as any,
            attribution: { feeCost: 16.04, timingCost: 50, totalNotional: 16040 },
            venue: { venueAlphaBps: 3, bestExchange: 'binance', worstExchange: 'bybit' },
        }));
        for (const b of BANNED) expect(actions, b).not.toContain(b);
    });
    it('UI/readme copy: no "Institutional-grade", "Venue Alpha"; venue card and fee label reworded', () => {
        const root = path.resolve(__dirname, '../../..');
        const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
        const utils = fs.readdirSync(path.join(root, 'frontend/app/utils')).filter(f => f.endsWith('.ts')).map(f => `frontend/app/utils/${f}`);
        for (const f of ['frontend/app/layout.tsx', 'frontend/app/page.tsx', 'frontend/app/dashboard/page.tsx', 'README.md', ...utils]) {
            const t = read(f).toLowerCase();
            expect(t, f).not.toContain('institutional');
            expect(t, f).not.toContain('venue alpha');
            expect(t, f).not.toContain('exchange spread cost');
        }
        expect(read('frontend/app/dashboard/page.tsx')).toContain('Average slippage by venue (unmatched)');
        expect(read('frontend/app/dashboard/componentCards.ts')).toContain("'LIQUIDITY PROVISION'");
    });
});

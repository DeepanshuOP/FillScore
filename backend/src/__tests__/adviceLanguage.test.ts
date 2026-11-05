import { describe, it, expect, vi } from 'vitest';
import PDFDocument from 'pdfkit';
import { computeAuditSummary } from '../scoring/audit';
import { buildCoach, describePeriod } from '../scoring/coach';
import { aggregateCostAttribution } from '../scoring/attribution';
import { ReportService } from '../services/ReportService';
import { scoreTrade } from '../scoring/engine';
import { findAdviceTerms, KNOWN_BAD_STRINGS } from '../constants/adviceTerms';
import { EnrichedTrade } from '../types';

// Synthetic fixtures shaped like the three demo users: disciplined (maker, daytime, tight slippage),
// moderate (mixed), aggressive (taker, 22:00-07:00 UTC, wide slippage, two venues).
interface Profile { name: string; makerEvery: number; hours: number[]; slipBps: number; feeFrac: number; exchanges: Array<'binance' | 'bybit'> }
const PROFILES: Profile[] = [
    { name: 'disciplined', makerEvery: 1, hours: [10, 11, 14], slipBps: 1, feeFrac: 0.0002, exchanges: ['binance'] },
    { name: 'moderate', makerEvery: 2, hours: [3, 11, 15, 19], slipBps: 8, feeFrac: 0.0006, exchanges: ['binance', 'bybit'] },
    { name: 'aggressive', makerEvery: 9, hours: [1, 2, 3, 23, 11], slipBps: 40, feeFrac: 0.001, exchanges: ['binance', 'bybit'] },
];

function trades(p: Profile): EnrichedTrade[] {
    return Array.from({ length: 60 }, (_, i) => {
        const hour = p.hours[i % p.hours.length];
        const exchange = p.exchanges[i % p.exchanges.length];
        const arrival = 40000;
        const price = arrival * (1 + (p.slipBps + (exchange === 'bybit' ? 3 : 0)) / 10000);
        const notional = 4000 + (i % 5) * 500;
        return {
            userId: `demo-${p.name}`, exchange, symbol: i % 3 === 0 ? 'ETHUSDT' : 'BTCUSDT', tradeId: `t${String(i).padStart(3, '0')}`,
            orderId: `o${i}`, side: 'BUY', orderType: i % p.makerEvery === 0 ? 'LIMIT' : 'MARKET', isMaker: i % p.makerEvery === 0,
            executionPrice: price, quantity: notional / price, notional, fee: notional * p.feeFrac, feeUsd: notional * p.feeFrac, feeAsset: 'USDT',
            executedAt: new Date(Date.UTC(2024, 0, 1 + (i % 28), hour, i % 60)), arrivalPriceProxy: arrival, spreadBps: 2, vwap5min: arrival,
        } as EnrichedTrade;
    });
}

function pdfText(audit: any, attribution: any, worst: any[], comparison: any): string {
    const seen: string[] = [];
    const orig = (PDFDocument.prototype as any).text;
    const spy = vi.spyOn(PDFDocument.prototype as any, 'text').mockImplementation(function (this: any, t: any, ...rest: any[]) {
        seen.push(String(t));
        return orig.call(this, t, ...rest);
    });
    try {
        const doc = ReportService.generateReport(audit, attribution, worst, comparison);
        doc.on('data', () => {});
    } finally { spy.mockRestore(); }
    return seen.join('\n');
}

describe('no advice language where copy is generated (three demo-shaped users)', () => {
    for (const p of PROFILES) {
        it(`${p.name}: recommendations, coach, venue note and PDF text contain no advice or counterfactual term`, async () => {
            const ts = trades(p);
            const summary = await computeAuditSummary(`demo-${p.name}`, ts);
            const attribution = aggregateCostAttribution(ts.map(t => ({ ...t, ...scoreTrade(t) })) as any);
            const venue = p.exchanges.length > 1 ? { bestExchange: 'binance', worstExchange: 'bybit', venueAlphaBps: 3 } : null;
            const coach = buildCoach({ breakdown: summary.breakdown, periodText: describePeriod(summary.period), trades: ts.map(t => ({ executedAt: t.executedAt, fillScore: scoreTrade(t).fillScore })), attribution: attribution as any, venue });

            const comparison = venue ? { exchanges: p.exchanges.map(e => ({ exchange: e, avgFillScore: 80, totalNotional: 1000, tradeCount: 10, makerRatio: 0.5, avgSlippageBps: 2, avgFeeDragBps: 3 })), ...venue } : undefined;
            const pdf = pdfText({ ...summary, avgFillScore: summary.avgFillScore }, attribution, [], comparison);

            const copy: Record<string, string> = {
                recommendations: summary.recommendations.join('\n'),
                coach: [coach.headline, ...coach.actions.flatMap(a => [a.title, a.detail, a.estimatedImpact])].join('\n'),
                pdf,
            };
            expect(summary.recommendations.length).toBeGreaterThan(0);
            for (const [where, text] of Object.entries(copy)) {
                expect({ where, hits: findAdviceTerms(text) }).toEqual({ where, hits: [] });
            }
            if (venue) expect(pdf).toContain('cost less slippage than on');
            expect(pdf).toContain('INSIGHTS & EXECUTION PATTERNS');
        });
    }

    it('the three strings seen on the deployed sample dashboard are caught by the detector', () => {
        for (const s of KNOWN_BAD_STRINGS) expect(findAdviceTerms(s).length).toBeGreaterThan(0);
    });
});

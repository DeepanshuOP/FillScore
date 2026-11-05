import { describe, it, expect, afterEach } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { computeAuditSummary } from '../scoring/audit';
import { aggregateCostAttribution } from '../scoring/attribution';
import { ReportService } from '../services/ReportService';
import { scoreTrade } from '../scoring/engine';
import { findAdviceTerms, KNOWN_BAD_STRINGS } from '../constants/adviceTerms';
import { EnrichedTrade } from '../types';

// 12 demo-shaped binance trades at 10/11/14 UTC; arithmetic is not asserted, only rendered text.
function trades(): EnrichedTrade[] {
    return Array.from({ length: 12 }, (_, i) => {
        const notional = 4000;
        const price = 40000 * 1.0001;
        return {
            userId: 'demo-disciplined', exchange: 'binance', symbol: 'BTCUSDT', tradeId: `t${i}`, orderId: `o${i}`, side: 'BUY',
            orderType: 'LIMIT', isMaker: true, executionPrice: price, quantity: notional / price, notional,
            fee: 0.8, feeUsd: 0.8, feeAsset: 'USDT', executedAt: new Date(Date.UTC(2024, 0, 1 + i, [10, 11, 14][i % 3], i)),
            arrivalPriceProxy: 40000, spreadBps: 2, vwap5min: 40000,
        } as EnrichedTrade;
    });
}

async function renderPdfText(): Promise<string> {
    const ts = trades();
    const summary = await computeAuditSummary('demo-disciplined', ts);
    const scored = ts.map(t => ({ ...t, ...scoreTrade(t) }));
    const attribution = aggregateCostAttribution(scored as any);
    const worst = scored.slice(0, 5);
    const doc = ReportService.generateReport(summary as any, attribution, worst as any, undefined as any);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    await new Promise<void>(r => { doc.on('end', () => r()); });
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const out = await parser.getText();
    await parser.destroy();
    return out.text;
}

describe('demo PDF text (extracted with pdf-parse)', () => {
    const saved = process.env.FRONTEND_URL;
    afterEach(() => { if (saved === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = saved; });

    it('has the 2b wording, full exchange name, no advice, no fillscore.io', async () => {
        delete process.env.FRONTEND_URL;
        const text = await renderPdfText();
        expect(text).toContain('INSIGHTS & EXECUTION PATTERNS');
        expect(text).toContain('BINANCE');
        expect(text).not.toMatch(/fillscore\.io/i);
        expect(text).not.toContain('RECOMMENDATIONS & ACTION PLAN');
        expect(findAdviceTerms(text)).toEqual([]);
        for (const s of KNOWN_BAD_STRINGS) expect(text).not.toContain(s);
    }, 30000);

    it('prints the configured FRONTEND_URL host in the footer', async () => {
        process.env.FRONTEND_URL = 'https://fill-score-kappa.vercel.app';
        const text = await renderPdfText();
        expect(text).toContain('fill-score-kappa.vercel.app');
    }, 30000);
});

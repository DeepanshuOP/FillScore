import { describe, it, expect } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { computeAuditSummary } from '../scoring/audit';
import { ReportService } from '../services/ReportService';
import { scoreTrade } from '../scoring/engine';
import { EnrichedTrade } from '../types';

// Decision 11 (2026-11-13): a rebuilt demo has no per-trade v1 fields, so the report has no cost attribution and no
// worst-trade list. The PDF must say "not computed for this data", never print $0.00 costs or an empty table.
function trades(): EnrichedTrade[] {
    return Array.from({ length: 12 }, (_, i) => {
        const price = 40000 * 1.0001;
        return {
            userId: 'demo-disciplined', exchange: 'binance', symbol: 'BTCUSDT', tradeId: `t${i}`, orderId: `o${i}`, side: 'BUY',
            orderType: 'LIMIT', isMaker: true, executionPrice: price, quantity: 4000 / price, notional: 4000,
            fee: 0.8, feeUsd: 0.8, feeAsset: 'USDT', executedAt: new Date(Date.UTC(2024, 0, 1 + i, [10, 11, 14][i % 3], i)),
            arrivalPriceProxy: 40000, spreadBps: 2, vwap5min: 40000,
        } as EnrichedTrade;
    });
}

async function pdfText(attribution: any, worst: any[]): Promise<string> {
    const ts = trades();
    const summary = await computeAuditSummary('demo-disciplined', ts);
    const doc = ReportService.generateReport(summary as any, attribution, worst as any, undefined as any);
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    await new Promise<void>(r => { doc.on('end', () => r()); });
    const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
    const out = await parser.getText();
    await parser.destroy();
    return out.text;
}

describe('report PDF without per-trade v1 fields', () => {
    it('says "not computed for this data" for the cost breakdown and the worst trades, and prints no $0.00 cost', async () => {
        const text = await pdfText(null, []);
        expect(text).toMatch(/not computed for this data/i);
        expect(text).not.toContain('Slippage cost');
        expect(text).not.toContain('TOTAL COST');
        expect(text).not.toMatch(/\$0\.00/);
    }, 30000);

    it('a rebuilt demo prints its current fills and orders, not the stored audit counts, and no negative zero', async () => {
        const ts = trades();
        const summary: any = await computeAuditSummary('demo-disciplined', ts);
        summary.current = { fills: 607, orders: 245, notionalUsd: 123456.7, makerRatio: 0.66 };   // stored audit says 12 trades
        summary.breakdown.avgSlippageBps = -0.0004;
        const doc = ReportService.generateReport(summary, null, [], undefined as any);
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        await new Promise<void>(r => { doc.on('end', () => r()); });
        const parser = new PDFParse({ data: new Uint8Array(Buffer.concat(chunks)) });
        const text = (await parser.getText()).text;
        await parser.destroy();
        expect(text).toMatch(/Fills Analysed\s*:\s*607 \(in 245 orders\)/);
        expect(text).toContain('$123,457');
        expect(text).toContain('66% of fills');
        expect(text).not.toContain('Trades Analysed');
        expect(text).toContain('>-0.01 bps avg');
        expect(text).not.toMatch(/-0\.0 bps/);
    }, 30000);

    it('a v1-enriched account still prints its numbers', async () => {
        const ts = trades().map(t => ({ ...t, ...scoreTrade(t) }));
        const { aggregateCostAttribution } = await import('../scoring/attribution');
        const text = await pdfText(aggregateCostAttribution(ts as any), ts.slice(0, 3));
        expect(text).toContain('Slippage cost');
        expect(text).toContain('TOTAL COST');
    }, 30000);
});

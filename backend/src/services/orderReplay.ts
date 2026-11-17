/**
 * The replay of one order (M4 §1, roadmap A6 and E2). Pure: it arranges values that ml-service/measure stored, and computes
 * only USD = bps x intended notional / 10,000 and a fill's notional. Every figure names the stored field it came from; the
 * market data behind them is listed with its public file or window and its SHA-256, so a third party can fetch it and check.
 * A value that was not computed stays null ("not computed"), never zero. No advice, no cause: the text is fixed templates.
 */
import { formatBps } from '../utils/formatBps';

const VISION_BASE = 'https://data.binance.vision/data/spot/daily/aggTrades';
const REST_AGG_TRADES = 'https://api.binance.com/api/v3/aggTrades';

export interface ReplayOrder {
    orderId: string; symbol: string; exchange?: string; type: string | null; side: string; origQty: number; executedQty: number; status: string;
    restingMs?: number | null; createdAt: Date; updatedAt: Date;
}
export interface ReplayFill { tradeId: string; executionPrice: number; quantity: number; executedAt: Date; feeUsd?: number | null; isMaker?: boolean | null }
export interface ReplayMeasurement {
    version?: string; arrivalMid: number | null; endMid: number | null; endBasis: string | null; unmeasuredReason: string | null;
    shortfall: Record<string, any> | null; expectedCost?: Record<string, any> | null; marketDataRefs: Array<Record<string, any>>;
}

export interface ReplayFigure { key: string; label: string; bps: number | null; usd: number | null; partOf?: string; source: { kind: 'order-measurement'; field: string } }
export interface ReplaySource { kind: 'public-market-data'; label: string; sha256: string; url: string | null }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const r8 = (v: number) => Math.round(v * 1e8) / 1e8;
const iso = (ms: number) => new Date(ms).toISOString();

const TERMS: Array<[string, string, string, string | undefined]> = [
    // key, label, shortfall field, parent
    ['execution', 'Execution cost', 'executionBps', undefined],
    ['spread', 'Spread paid', 'spreadBps', 'execution'],
    ['impactTiming', 'Impact and timing', 'impactTimingBps', 'execution'],
    ['unfilled', 'Unfilled orders', 'opportunityBps', undefined],
    ['fees', 'Fees', 'feesBps', undefined],
    ['total', 'Total', 'totalBps', undefined],
];

function sourceOf(ref: Record<string, any>): ReplaySource | null {
    if (typeof ref.sha256 !== 'string') return null;
    if (ref.source === 'data.binance.vision' && ref.date && ref.symbol) {
        return { kind: 'public-market-data', label: `Binance daily trades file, ${ref.symbol}, ${ref.date}`, sha256: ref.sha256,
            url: `${VISION_BASE}/${ref.symbol}/${ref.symbol}-aggTrades-${ref.date}.zip` };
    }
    if (ref.source === 'api.binance.com' && Array.isArray(ref.window) && ref.window.length === 2 && ref.symbol && ref.window.every(num)) {
        const [a, b] = ref.window as [number, number];
        return { kind: 'public-market-data', label: `Binance public trades window, ${ref.symbol}, ${iso(a)} to ${iso(b)}`, sha256: ref.sha256,
            url: `${REST_AGG_TRADES}?symbol=${ref.symbol}&startTime=${a}&endTime=${b}` };
    }
    return { kind: 'public-market-data', label: `Market data (${ref.source ?? 'unknown source'})`, sha256: ref.sha256, url: null };
}

export function buildOrderReplay(a: { order: ReplayOrder; fills: ReplayFill[]; measurement: ReplayMeasurement | null }) {
    const { order, fills, measurement: m } = a;
    const notes: string[] = [];
    const fillRows = [...fills].sort((x, y) => x.executedAt.getTime() - y.executedAt.getTime()).map(f => ({
        tradeId: f.tradeId, time: f.executedAt.toISOString(), price: f.executionPrice, quantity: f.quantity,
        notional: r8(f.executionPrice * f.quantity), feeUsd: num(f.feeUsd) ? f.feeUsd : null, isMaker: f.isMaker ?? null,
    }));
    const orderOut = { orderId: order.orderId, symbol: order.symbol, exchange: order.exchange ?? 'binance', type: order.type, side: order.side,
        quantity: order.origQty, executedQuantity: order.executedQty, status: order.status, restingMs: order.restingMs ?? null,
        createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() };

    if (!m) {
        notes.push('Insufficient data: this order has no stored measurement.');
        return { order: orderOut, fills: fillRows, decomposition: [] as ReplayFigure[], expectedCost: null, sources: [] as ReplaySource[], notes };
    }
    const sources = (m.marketDataRefs ?? []).map(sourceOf).filter((s): s is ReplaySource => s !== null);
    const sf = m.shortfall;
    let decomposition: ReplayFigure[] = [];
    if (!sf) {
        notes.push(`Not measured: ${m.unmeasuredReason ?? 'no reason was stored'}.`);
    } else {
        const notional = num(sf.intendedNotional) && sf.intendedNotional > 0 ? sf.intendedNotional : null;
        decomposition = TERMS.map(([key, label, field, partOf]) => {
            const bps = num(sf[field]) ? sf[field] as number : null;
            return { key, label, bps, usd: bps !== null && notional !== null ? bps * notional / 1e4 : null, ...(partOf ? { partOf } : {}),
                source: { kind: 'order-measurement' as const, field: `shortfall.${field}` } };
        });
        if (sf.delayBps == null) notes.push(`Delay cost: not measured (${sf.delayReason ?? 'no reason was stored'}).`);
        else if (num(sf.delayBps)) notes.push(`Delay cost: ${formatBps(sf.delayBps)}.`);
    }
    const ec = m.expectedCost ?? null;
    const expectedCost = ec ? {
        applies: !!ec.applies, expectedBps: num(ec.expectedBps) ? ec.expectedBps : null, lowBps: num(ec.lowBps) ? ec.lowBps : null,
        highBps: num(ec.highBps) ? ec.highBps : null, level: ec.level ?? null, bucket: ec.bucket ?? null, reason: ec.reason ?? null,
        source: { kind: 'order-measurement' as const, field: 'expectedCost', version: ec.version, calibrationSha256: ec.calibrationSha256 },
    } : null;
    return { order: orderOut, fills: fillRows, decomposition, expectedCost, sources, notes };
}

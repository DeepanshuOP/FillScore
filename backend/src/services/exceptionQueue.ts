/**
 * The exception queue (M4 §2, roadmap E1) and its one-line findings (C3).
 *
 * Deterministic rules over stored order measurements, each with a threshold that the response states:
 *   1. above-expected-interval: a market order whose execution cost is above the upper end of its expected-cost interval.
 *   2. unfilled-cost: an order that never filled and whose total cost is above the account's own 90th percentile.
 *   3. high-total-cost: a filled order whose total cost is above the account's own 90th percentile.
 * Rules 2 and 3 need at least 20 measured orders; with fewer the queue says "insufficient data" for them. An order without a
 * measurement is counted as skipped, never scored as zero. The comparison with a threshold is strict.
 *
 * Every finding is a fixed template that places stored numbers (no model writes a number or a sentence here), in past tense,
 * with no advice and no cause. USD = bps x intended notional / 10,000.
 */
import { quantile } from './orderSummary';
import { formatBps } from '../utils/formatBps';

export const MIN_QUEUE_ORDERS = 20;
export const QUEUE_LIMIT = 20;

export interface ExpectedCostLike {
    applies: boolean; expectedBps: number | null; lowBps: number | null; highBps: number | null; level: number; bucket: string | null;
}
export interface ExceptionOrder {
    orderId: string;
    symbol: string;
    type: string | null;
    status: string | null;
    shortfall: Record<string, any> | null;
    expectedCost: ExpectedCostLike | null;
}
export type ExceptionRule = 'above-expected-interval' | 'unfilled-cost' | 'high-total-cost';
export interface ExceptionItem {
    orderId: string; symbol: string; rules: ExceptionRule[]; finding: string; usd: number; totalBps: number;
}
export interface ExceptionQueue {
    items: ExceptionItem[];
    /** How many orders met a rule, before the cap. */
    total: number;
    checked: number;
    skipped: number;
    thresholds: { minOrders: number; p90TotalBps: number } | null;
    note: string | null;
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const usd = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;

export function buildExceptionQueue(orders: ExceptionOrder[]): ExceptionQueue {
    const measured = orders.filter(o => o.shortfall && num(o.shortfall.totalBps) && num(o.shortfall.intendedNotional) && o.shortfall.intendedNotional > 0);
    const skipped = orders.length - measured.length;
    const totals = measured.map(o => o.shortfall!.totalBps as number);
    const enough = measured.length >= MIN_QUEUE_ORDERS;
    const p90 = enough ? (quantile(totals, 0.9) as number) : null;
    const med = enough ? (quantile(totals, 0.5) as number) : null;

    const items: ExceptionItem[] = [];
    for (const o of measured) {
        const s = o.shortfall!;
        const total = s.totalBps as number;
        const notional = s.intendedNotional as number;
        const rules: ExceptionRule[] = [];
        const lines: string[] = [];
        const ec = o.expectedCost;
        if (o.type === 'MARKET' && ec && ec.applies && num(ec.highBps) && num(ec.lowBps) && num(ec.expectedBps) && num(s.executionBps) && s.executionBps > ec.highBps) {
            rules.push('above-expected-interval');
            lines.push(`This market order cost ${formatBps(s.executionBps)} in execution; the modelled cost of a taker event of the same size in the hour before the order was ${formatBps(ec.expectedBps)} `
                + `(${Math.round(ec.level * 100)}% interval ${formatBps(ec.lowBps)} to ${formatBps(ec.highBps)} for one event).`);
        }
        const neverFilled = s.fillRatio === 0;
        if (p90 !== null && total > p90) {
            if (neverFilled) {
                rules.push('unfilled-cost');
                const opp = num(s.opportunityBps) ? s.opportunityBps : total;
                lines.push(`This order never filled and ended ${o.status ?? 'without a stored status'}; its unfilled part cost ${formatBps(opp)} `
                    + `(about ${usd(opp * notional / 1e4)}).`);
            } else {
                rules.push('high-total-cost');
                lines.push(`This order's total cost was ${formatBps(total)} against a median of ${formatBps(med)} for the account's ${measured.length} measured orders `
                    + `(its 90th percentile was ${formatBps(p90)}).`);
            }
        }
        if (rules.length) items.push({ orderId: o.orderId, symbol: o.symbol, rules, finding: lines.join(' '), usd: total * notional / 1e4, totalBps: total });
    }
    items.sort((a, b) => b.usd - a.usd || (a.orderId < b.orderId ? -1 : 1));
    return {
        items: items.slice(0, QUEUE_LIMIT), total: items.length, checked: measured.length, skipped,
        thresholds: p90 === null ? null : { minOrders: MIN_QUEUE_ORDERS, p90TotalBps: p90 },
        note: enough ? null : `Insufficient data: fewer than ${MIN_QUEUE_ORDERS} measured orders, so no order is compared with the account's own distribution.`,
    };
}

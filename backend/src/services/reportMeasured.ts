/**
 * The measured block of the PDF report for an account whose trades carry no per-trade v1 fields (a rebuilt demo).
 * Pure: it only arranges values that the scorer (scoring v2) and the order summary already computed; it computes no
 * market value. A value that is missing stays missing (null or an empty list), never zero.
 */
import type { summariseOrders } from './orderSummary';

export type OrdersSummary = ReturnType<typeof summariseOrders>;

export const COMPONENT_LABELS: Record<string, string> = {
    execution: 'Execution cost', fees: 'Fees', unfilled: 'Unfilled orders',
};
const ORDER = ['execution', 'fees', 'unfilled'];

export interface MeasuredReport {
    v2: { scoringVersion: string; grade: string | null; composite: number | null; band: [number, number] | null } | null;
    components: Array<{ key: string; label: string; score: number | null; measured: number; reason: string | null }>;
    /** Equal weights of v2.3.0: 1 / number of components, shown as a percentage by the report. */
    weight: number | null;
    timingNote: string | null;
    shortfall: { n: number; unmeasured: number; totals: NonNullable<OrdersSummary['shortfall']>['totals'] } | null;
    orders: OrdersSummary['orders'] | null;
    restingMs: OrdersSummary['restingMs'];
    demo: boolean;
    v1Published: { grade: string | null; score: number | null };
}

export function buildMeasuredReport(args: {
    v2: { scoringVersion: string; result: any } | null;
    orders: OrdersSummary | null;
    demo: boolean;
    v1: { grade?: string | null; score?: number | null };
}): MeasuredReport {
    const r = args.v2?.result ?? null;
    const comps = r?.components ?? {};
    const keys = ORDER.filter(k => comps[k]);
    const timing = r?.timing;
    return {
        v2: r ? {
            scoringVersion: args.v2!.scoringVersion,
            grade: r.grade ?? null,
            composite: typeof r.composite === 'number' ? r.composite : null,
            band: Array.isArray(r.band) && r.band.length === 2 ? [r.band[0], r.band[1]] : null,
        } : null,
        components: keys.map(k => ({ key: k, label: COMPONENT_LABELS[k], score: typeof comps[k].score === 'number' ? comps[k].score : null,
            measured: comps[k].measured ?? 0, reason: comps[k].reason ?? null })),
        weight: keys.length ? 1 / keys.length : null,
        timingNote: timing && timing.scored === false && timing.message ? `Timing, not scored: ${timing.message}` : null,
        shortfall: args.orders?.shortfall ? { n: args.orders.shortfall.n, unmeasured: args.orders.shortfall.unmeasured, totals: args.orders.shortfall.totals } : null,
        orders: args.orders?.orders ?? null,
        restingMs: args.orders?.restingMs ?? null,
        demo: args.demo,
        v1Published: { grade: args.v1.grade ?? null, score: typeof args.v1.score === 'number' ? args.v1.score : null },
    };
}

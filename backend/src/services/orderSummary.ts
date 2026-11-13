/**
 * Measured order views (M2 closing task, decision 11): how the orders ended, how long limit orders rested, and the
 * implementation shortfall that ml-service/measure measured. Pure statistics over stored documents: this reads
 * `orders` and `order_measurements`, and it never computes a market value itself. A block with nothing to show is
 * null, never zero. Every value coincided with the orders; none is shown to be caused by anything.
 */
const FINAL = new Set(['FILLED', 'CANCELED', 'REJECTED', 'EXPIRED', 'EXPIRED_IN_MATCH']);
const QTY_TOL = 1e-9;

export interface OrderLike { orderId: string; exchange?: string; symbol?: string; type?: string; origQty: number; executedQty: number; status: string; restingMs?: number | null }
export interface MeasurementLike { orderId: string; exchange?: string; symbol?: string; unmeasuredReason?: string | null; shortfall?: Record<string, any> | null }

/** Order ids are only unique per exchange and symbol (the unique index of both collections says so). */
const keyOf = (o: { orderId: string; exchange?: string; symbol?: string }) => `${o.exchange ?? ''}|${o.symbol ?? ''}|${o.orderId}`;

/** Linear interpolation between order statistics (numpy's default). null for an empty list. */
export function quantile(values: number[], q: number): number | null {
    const x = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (x.length === 0) return null;
    const pos = q * (x.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return x[lo] + (pos - lo) * (x[hi] - x[lo]);
}

const median = (v: number[]) => quantile(v, 0.5);
const nums = (rows: Array<Record<string, any>>, key: string): number[] =>
    rows.map(r => r[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

export function summariseOrders(orders: OrderLike[], measurements: MeasurementLike[]) {
    const counts = { total: orders.length, filled: 0, partial: 0, unfilled: 0, open: 0 };
    const unfilledIds = new Set<string>();
    for (const o of orders) {
        const none = o.executedQty <= o.origQty * QTY_TOL;
        if (!FINAL.has(o.status)) counts.open++;
        else if (o.status === 'FILLED') counts.filled++;
        else if (none) { counts.unfilled++; unfilledIds.add(keyOf(o)); }
        else counts.partial++;
    }
    const resting = orders.map(o => o.restingMs).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const measured = measurements.filter(m => m.shortfall && !m.unmeasuredReason);
    const sf = measured.map(m => m.shortfall as Record<string, any>);
    const unfilledSf = measured.filter(m => unfilledIds.has(keyOf(m))).map(m => m.shortfall as Record<string, any>);
    const unfilledOpp = median(nums(unfilledSf, 'opportunityBps'));

    return {
        orders: counts,
        restingMs: resting.length ? { n: resting.length, medianMs: median(resting), p90Ms: quantile(resting, 0.9) } : null,
        shortfall: sf.length ? {
            n: sf.length,
            unmeasured: measurements.length - measured.length,
            medianBps: {
                execution: median(nums(sf, 'executionBps')),
                spread: median(nums(sf, 'spreadBps')),
                impactTiming: median(nums(sf, 'impactTimingBps')),
                opportunity: median(nums(sf, 'opportunityBps')),
                total: median(nums(sf, 'totalBps')),
            },
        } : null,
        unfilled: unfilledSf.length ? { n: unfilledSf.length, medianOpportunityBps: unfilledOpp } : null,
    };
}

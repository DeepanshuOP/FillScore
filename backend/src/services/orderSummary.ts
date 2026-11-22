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

export const TERMS: Array<[string, string]> = [
    ['execution', 'executionBps'], ['spread', 'spreadBps'], ['impactTiming', 'impactTimingBps'],
    ['opportunity', 'opportunityBps'], ['fees', 'feesBps'], ['total', 'totalBps'],
];

/** Totals per term over all measured orders: USD = bps x intended notional / 10,000, summed over the orders that have
 *  the term; bps = that USD over the same orders' intended notional. null when no order states its notional. */
export function termTotals(sf: Array<Record<string, any>>) {
    const out: Record<string, { usd: number; bps: number; n: number } | null> = {};
    let any = false;
    for (const [name, key] of TERMS) {
        let usd = 0, notional = 0, n = 0;
        for (const s of sf) {
            const b = s[key], nt = s.intendedNotional;
            if (typeof b !== 'number' || !Number.isFinite(b) || typeof nt !== 'number' || !(nt > 0)) continue;
            usd += b * nt / 1e4; notional += nt; n++;
        }
        out[name] = n ? { usd, bps: usd / notional * 1e4, n } : null;
        if (n) any = true;
    }
    return any ? out as Record<string, { usd: number; bps: number; n: number }> : null;
}

/** The order type's family: MARKET; LIMIT and LIMIT_MAKER (limit orders); anything else is "other". */
export function typeFamily(type: string | undefined): 'market' | 'limit' | 'other' {
    const t = (type ?? '').toUpperCase();
    return t === 'MARKET' ? 'market' : t === 'LIMIT' || t === 'LIMIT_MAKER' ? 'limit' : 'other';
}

/**
 * Design v3 fixes B2: the shortfall totals (termTotals) per order type family, and over all measured orders, from the
 * same measurements. The families partition the measured orders, so their dollars and order counts add up to `all`
 * term by term (bps do not add: each is its own dollars over its own notional). A family with nothing measured is null.
 * Computed on read beside `summariseOrders`, whose output (also used by the evidence pack) is unchanged.
 */
export function totalsByType(orders: OrderLike[], measurements: MeasurementLike[]) {
    const fam = new Map(orders.map(o => [keyOf(o), typeFamily(o.type)]));
    const measured = measurements.filter(x => x.shortfall && !x.unmeasuredReason);
    const of = (f: string) => termTotals(measured.filter(x => (fam.get(keyOf(x)) ?? 'other') === f).map(x => x.shortfall as Record<string, any>));
    return { all: termTotals(measured.map(x => x.shortfall as Record<string, any>)), market: of('market'), limit: of('limit'), other: of('other') };
}

type TermT = { usd: number; bps: number; n: number } | null | undefined;

/**
 * Design v3.1 (2026-11-21, second) and fixes F1 (2026-11-22, second order): the overview's cost strip. Three parts that
 * add up to the total: `fees`; `missed` = the modelled cost of orders that never filled (`missedUsd`, the served
 * `unfilledCost.usd`; null, when unfilled orders exist and none was measured, counts as 0: such orders are not in the
 * total either); and `execution` = total - fees - missed, the filled orders' execution (negative: an improvement).
 * Each part's share is its dollars over the sum of the positive parts, so a negative part has no width and is named
 * apart. null without a total or without fees. Computed on read from the same totals as the headline.
 */
export function costStrip(t: { total?: TermT; fees?: TermT } | null | undefined, missedUsd?: number | null) {
    const total = t?.total?.usd, fees = t?.fees?.usd;
    if (typeof total !== 'number' || !Number.isFinite(total) || typeof fees !== 'number' || !Number.isFinite(fees)) return null;
    const missed = typeof missedUsd === 'number' && Number.isFinite(missedUsd) ? missedUsd : 0;
    const parts: Array<['execution' | 'missed' | 'fees', number]> = [['execution', total - fees - missed], ['missed', missed], ['fees', fees]];
    const pos = parts.reduce((s, [, v]) => s + Math.max(0, v), 0);
    return {
        totalUsd: total,
        // `below`: a negative part's size on the same scale (|usd| over the positive sum), drawn below the line
        segments: parts.map(([key, usd]) => ({ key, usd, share: pos > 0 && usd > 0 ? usd / pos : 0, below: pos > 0 && usd < 0 ? -usd / pos : 0 })),
    };
}

/**
 * Design v3.1 fixes A1: the part of the headline total that sits in orders that never filled (a final status other than
 * FILLED, nothing executed). Nobody paid it: it is the modelled cost of the missed fill, so a copy line that names it
 * must say "cost", never "paid". `usd` is the unfilled orders' total cost summed the same way as the headline (termTotals);
 * `count` is every unfilled order, `measured` those with a measurement. null dollars (never zero) when unfilled orders
 * exist and none was measured. Computed on read; `summariseOrders` is unchanged.
 */
export function unfilledCost(orders: OrderLike[], measurements: MeasurementLike[]) {
    const ids = new Set<string>();
    for (const o of orders) if (FINAL.has(o.status) && o.status !== 'FILLED' && o.executedQty <= o.origQty * QTY_TOL) ids.add(keyOf(o));
    const sf = measurements.filter(m => m.shortfall && !m.unmeasuredReason && ids.has(keyOf(m))).map(m => m.shortfall as Record<string, any>);
    if (ids.size === 0) return { usd: 0, count: 0, measured: 0 };
    return { usd: termTotals(sf)?.total?.usd ?? null, count: ids.size, measured: sf.length };
}

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
            totals: termTotals(sf),
        } : null,
        unfilled: unfilledSf.length ? { n: unfilledSf.length, medianOpportunityBps: unfilledOpp } : null,
    };
}

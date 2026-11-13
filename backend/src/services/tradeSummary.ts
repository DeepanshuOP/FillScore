/**
 * Header figures from the account's current fills and orders, not from the stored v1 audit (which, for a rebuilt demo,
 * describes the earlier trades). Fills and orders are counted apart: one order can have many fills.
 * Nothing measured is shown as zero: with no fills, notional and maker ratio are null.
 */
export function summariseTrades(fills: Array<{ notional?: number | null; isMaker?: boolean }>, orders: number) {
    if (fills.length === 0) return { fills: 0, orders, notionalUsd: null, makerRatio: null };
    const notionalUsd = fills.reduce((s, f) => s + (typeof f.notional === 'number' && Number.isFinite(f.notional) ? f.notional : 0), 0);
    return { fills: fills.length, orders, notionalUsd, makerRatio: fills.filter(f => f.isMaker).length / fills.length };
}

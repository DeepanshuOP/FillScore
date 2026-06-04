import { EnrichedTrade } from '../types';

// ─────────────────────────────────────────────────────────
// Cost Attribution Engine
// Decomposes total execution cost into four independent
// components: slippage, fees, timing penalty, and spread.
// All functions are pure — no DB access, no side effects.
// ─────────────────────────────────────────────────────────

/**
 * Per-trade cost breakdown in USD terms.
 */
export interface TradeCostBreakdown {
    slippageCost: number;
    feeCost: number;
    timingCost: number;
    spreadCost: number;
    totalCost: number;
}

/**
 * Aggregated cost attribution across all trades for a user.
 */
export interface CostAttribution {
    slippageCost: number;
    feeCost: number;
    timingCost: number;
    spreadCost: number;
    totalCost: number;
    totalNotional: number;
    tradeCount: number;
    /** Per-symbol cost breakdown for drill-down */
    bySymbol: Record<string, {
        slippageCost: number;
        feeCost: number;
        timingCost: number;
        spreadCost: number;
        totalCost: number;
        tradeCount: number;
    }>;
}

// ─────────────────────────────────────────────────────────
// PATCH 1 — Per-trade cost calculation (pure functions)
// ─────────────────────────────────────────────────────────

/** Off-peak timing penalty multiplier applied to notional */
const TIMING_PENALTY_RATE = 0.0005;

/** UTC hours considered peak liquidity (inclusive both ends) */
const PEAK_HOURS_START = 8;
const PEAK_HOURS_END = 16;

/**
 * Computes the slippage cost in USD.
 * Slippage = |arrivalPrice − executionPrice| / arrivalPrice × notional
 *
 * Returns 0 if arrival price is missing or zero (safe fallback).
 */
export function computeSlippageCost(
    executionPrice: number,
    arrivalPrice: number | undefined | null,
    notional: number
): number {
    if (
        arrivalPrice == null ||
        arrivalPrice === 0 ||
        !isFinite(arrivalPrice) ||
        !isFinite(executionPrice) ||
        !isFinite(notional)
    ) {
        return 0;
    }

    return (Math.abs(arrivalPrice - executionPrice) / arrivalPrice) * notional;
}

/**
 * Returns the fee already paid on the trade.
 * Safe fallback to 0 for missing or invalid values.
 */
export function computeFeeCost(fee: number | undefined | null): number {
    if (fee == null || !isFinite(fee) || fee < 0) return 0;
    return fee;
}

/**
 * Estimates timing penalty cost.
 * Trades executed outside the 08:00–16:00 UTC peak window
 * incur an estimated cost of 0.05% × notional (wider spreads,
 * lower liquidity).
 *
 * Returns 0 for trades within peak hours.
 */
export function computeTimingCost(
    executedAt: Date,
    notional: number
): number {
    if (
        !(executedAt instanceof Date) ||
        isNaN(executedAt.getTime()) ||
        !isFinite(notional)
    ) {
        return 0;
    }

    const hour = executedAt.getUTCHours();

    if (hour >= PEAK_HOURS_START && hour < PEAK_HOURS_END) {
        return 0;
    }

    return TIMING_PENALTY_RATE * notional;
}

/**
 * Computes spread cost in USD.
 * spreadCost = spreadBps / 10 000 × notional
 *
 * Returns 0 if spreadBps is missing or invalid.
 */
export function computeSpreadCost(
    spreadBps: number | undefined | null,
    notional: number
): number {
    if (
        spreadBps == null ||
        !isFinite(spreadBps) ||
        spreadBps < 0 ||
        !isFinite(notional)
    ) {
        return 0;
    }

    return (spreadBps / 10000) * notional;
}

/**
 * Computes the full cost breakdown for a single trade.
 * All inputs are sourced from EnrichedTrade fields — no DB access.
 */
export function computeTradeCost(trade: EnrichedTrade): TradeCostBreakdown {
    const slippageCost = computeSlippageCost(
        trade.executionPrice,
        trade.arrivalPriceProxy,
        trade.notional
    );

    const feeCost = computeFeeCost(trade.fee);

    const timingCost = computeTimingCost(
        trade.executedAt,
        trade.notional
    );

    const spreadCost = computeSpreadCost(
        trade.spreadBps,
        trade.notional
    );

    return {
        slippageCost,
        feeCost,
        timingCost,
        spreadCost,
        totalCost: slippageCost + feeCost + timingCost + spreadCost,
    };
}

// ─────────────────────────────────────────────────────────
// PATCH 2 — Aggregation across all trades
// ─────────────────────────────────────────────────────────

/**
 * Aggregates cost attribution for an array of enriched trades.
 * Returns totals plus a per-symbol sub-breakdown.
 *
 * Trades that fail individual cost computation are silently
 * skipped (defensive — same pattern as scoreTrade in audit.ts).
 */
export function aggregateCostAttribution(trades: EnrichedTrade[]): CostAttribution {
    const result: CostAttribution = {
        slippageCost: 0,
        feeCost: 0,
        timingCost: 0,
        spreadCost: 0,
        totalCost: 0,
        totalNotional: 0,
        tradeCount: 0,
        bySymbol: {},
    };

    for (const trade of trades) {
        try {
            const costs = computeTradeCost(trade);

            result.slippageCost += costs.slippageCost;
            result.feeCost += costs.feeCost;
            result.timingCost += costs.timingCost;
            result.spreadCost += costs.spreadCost;
            result.totalCost += costs.totalCost;
            result.totalNotional += trade.notional;
            result.tradeCount++;

            // Per-symbol accumulation
            const sym = trade.symbol;
            if (!result.bySymbol[sym]) {
                result.bySymbol[sym] = {
                    slippageCost: 0,
                    feeCost: 0,
                    timingCost: 0,
                    spreadCost: 0,
                    totalCost: 0,
                    tradeCount: 0,
                };
            }

            result.bySymbol[sym].slippageCost += costs.slippageCost;
            result.bySymbol[sym].feeCost += costs.feeCost;
            result.bySymbol[sym].timingCost += costs.timingCost;
            result.bySymbol[sym].spreadCost += costs.spreadCost;
            result.bySymbol[sym].totalCost += costs.totalCost;
            result.bySymbol[sym].tradeCount++;
        } catch {
            // Skip trades with invalid data
        }
    }

    // Round all dollar values to 2 decimal places for clean API output
    result.slippageCost = round2(result.slippageCost);
    result.feeCost = round2(result.feeCost);
    result.timingCost = round2(result.timingCost);
    result.spreadCost = round2(result.spreadCost);
    result.totalCost = round2(result.totalCost);
    result.totalNotional = round2(result.totalNotional);

    for (const sym of Object.keys(result.bySymbol)) {
        const s = result.bySymbol[sym];
        s.slippageCost = round2(s.slippageCost);
        s.feeCost = round2(s.feeCost);
        s.timingCost = round2(s.timingCost);
        s.spreadCost = round2(s.spreadCost);
        s.totalCost = round2(s.totalCost);
    }

    return result;
}

/** Rounds to 2 decimal places (financial rounding). */
function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

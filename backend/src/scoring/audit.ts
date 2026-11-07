import { EnrichedTrade, AuditSummary } from '../types';
import {
    scoreTrade,
    gradeFromScore,
    computeArrivalSlippageBps,
    computeFeeDragBps
} from './engine';
import { tradeFeeUsd } from './fees';

/**
 * Wording for the best-hour vs worst-hour score gap. A measured gap is stated exactly. When only the capped
 * model value is available, a value at the cap is a floor ("at least"), below the cap it is exact.
 */
export function hourGapPhrase(input: { measured?: number | null; modelValue?: number; cap?: number }): string {
    const cap = input.cap ?? 30;
    if (input.measured != null && Number.isFinite(input.measured)) return `averaged ${input.measured.toFixed(1)} points higher`;
    const v = input.modelValue ?? 0;
    return v >= cap ? `averaged at least ${cap.toFixed(1)} points higher` : `averaged ${v.toFixed(1)} points higher`;
}

export interface ComponentMeans { slippage: number | null; fees: number | null; timing: number | null; spread: number | null }
type ScoredLike = { notional: number; slippageScore?: number | null; feeScore?: number | null; timingScore?: number | null; exchangeScore?: number | null };

/** Notional-weighted means of the per-trade component scores the engine already computed. A component averages only
 *  over trades that carry it, and is null when no trade does. Display only; never feeds the grade. */
export function computeComponentMeans(trades: ScoredLike[]): ComponentMeans {
    const mean = (pick: (t: ScoredLike) => number | null | undefined): number | null => {
        let sum = 0, w = 0;
        for (const t of trades) {
            const v = pick(t);
            if (v == null || !Number.isFinite(v) || !(t.notional > 0)) continue;
            sum += v * t.notional; w += t.notional;
        }
        return w > 0 ? sum / w : null;
    };
    return { slippage: mean(t => t.slippageScore), fees: mean(t => t.feeScore), timing: mean(t => t.timingScore), spread: mean(t => t.exchangeScore) };
}

export async function computeAuditSummary(userId: string, trades: EnrichedTrade[]): Promise<AuditSummary> {
    if (trades.length === 0) {
        return {
            userId,
            period: { start: new Date(), end: new Date() },
            exchange: '',
            totalTrades: 0,
            totalNotional: 0,
            avgFillScore: 0,
            fillGrade: 'F',
            estimatedLossUSD: 0,
            breakdown: {
                avgSlippageBps: 0,
                avgFeeDragBps: 0,
                makerRatio: 0,
                bestHour: 0,
                worstHour: 0,
                bestSymbol: '',
                worstSymbol: ''
            },
            recommendations: [],
            createdAt: new Date()
        };
    }

    // Pin determinism for floating-point math
    // tradeId is only unique per symbol, so ties break on symbol (same order as before when ids are distinct).
    trades.sort((a, b) => a.tradeId.localeCompare(b.tradeId) || a.symbol.localeCompare(b.symbol));

    let totalNotional = 0;
    let weightedFillScoreSum = 0;
    let weightedSlippageBpsSum = 0;
    let weightedFeeDragBpsSum = 0;
    let makerCount = 0;
    let estimatedLossUSD = 0;

    const scoredForMeans: ScoredLike[] = [];
    let minDate = trades[0].executedAt;
    let maxDate = trades[0].executedAt;

    const hourStats: Record<number, { sum: number; notional: number; count: number }> = {};
    const symbolStats: Record<string, { sum: number; notional: number; count: number }> = {};

    for (const trade of trades) {
        let scores;
        try {
            scores = scoreTrade(trade);
        } catch (e) {
            continue;
        }

        const notional = trade.notional;
        scoredForMeans.push({ notional, ...scores });
        totalNotional += notional;

        if (trade.executedAt < minDate) minDate = trade.executedAt;
        if (trade.executedAt > maxDate) maxDate = trade.executedAt;

        const arrivalSlippageBps = Math.abs(computeArrivalSlippageBps(trade.executionPrice, trade.arrivalPriceProxy!, trade.side));
        const feeDragBps = computeFeeDragBps(tradeFeeUsd(trade), trade.notional);

        weightedFillScoreSum += scores.fillScore * notional;
        weightedSlippageBpsSum += arrivalSlippageBps * notional;
        weightedFeeDragBpsSum += feeDragBps * notional;

        if (trade.isMaker) makerCount++;

        const loss = ((feeDragBps - 2) / 10000) * notional;
        if (loss > 0) estimatedLossUSD += loss;

        const hour = trade.executedAt.getUTCHours();
        if (!hourStats[hour]) hourStats[hour] = { sum: 0, notional: 0, count: 0 };
        hourStats[hour].sum += scores.fillScore * notional;
        hourStats[hour].notional += notional;
        hourStats[hour].count += 1;

        const sym = trade.symbol;
        if (!symbolStats[sym]) symbolStats[sym] = { sum: 0, notional: 0, count: 0 };
        symbolStats[sym].sum += scores.fillScore * notional;
        symbolStats[sym].notional += notional;
        symbolStats[sym].count += 1;
    }

    if (totalNotional === 0) {
        throw new Error("Total notional is 0, cannot compute weighted averages.");
    }

    let bestHour = 0;
    let worstHour = 0;
    let maxHourScore = -1;
    let minHourScore = 101;

    for (const [hourStr, stat] of Object.entries(hourStats)) {
        if (stat.count < 3) continue;
        const h = parseInt(hourStr, 10);
        const avgScore = stat.notional > 0 ? stat.sum / stat.notional : 0;
        if (avgScore > maxHourScore) { maxHourScore = avgScore; bestHour = h; }
        if (avgScore < minHourScore) { minHourScore = avgScore; worstHour = h; }
    }

    // fallback if no hour has >= 3 trades
    if (maxHourScore === -1) {
        for (const [hourStr, stat] of Object.entries(hourStats)) {
            const h = parseInt(hourStr, 10);
            const avgScore = stat.notional > 0 ? stat.sum / stat.notional : 0;
            if (avgScore > maxHourScore) { maxHourScore = avgScore; bestHour = h; }
            if (avgScore < minHourScore) { minHourScore = avgScore; worstHour = h; }
        }
    }

    let bestSymbol = trades[0].symbol;
    let worstSymbol = trades[0].symbol;
    let maxSymScore = -1;
    let minSymScore = 101;

    for (const [sym, stat] of Object.entries(symbolStats)) {
        if (stat.count < 3) continue;
        const avgScore = stat.notional > 0 ? stat.sum / stat.notional : 0;
        if (avgScore > maxSymScore) { maxSymScore = avgScore; bestSymbol = sym; }
        if (avgScore < minSymScore) { minSymScore = avgScore; worstSymbol = sym; }
    }
    
    if (maxSymScore === -1) {
        for (const [sym, stat] of Object.entries(symbolStats)) {
            const avgScore = stat.notional > 0 ? stat.sum / stat.notional : 0;
            if (avgScore > maxSymScore) { maxSymScore = avgScore; bestSymbol = sym; }
            if (avgScore < minSymScore) { minSymScore = avgScore; worstSymbol = sym; }
        }
    }

    const avgFillScore = weightedFillScoreSum / totalNotional;

    const summary: AuditSummary = {
        userId,
        period: { start: minDate, end: maxDate },
        exchange: new Set(trades.map(t => t.exchange)).size > 1 ? 'multi' : trades[0].exchange,
        totalTrades: trades.length,
        totalNotional,
        avgFillScore,
        fillGrade: gradeFromScore(avgFillScore),
        estimatedLossUSD,
        breakdown: {
            avgSlippageBps: weightedSlippageBpsSum / totalNotional,
            avgFeeDragBps: weightedFeeDragBpsSum / totalNotional,
            makerRatio: makerCount / trades.length,
            bestHour,
            worstHour,
            bestSymbol,
            worstSymbol,
            componentMeans: computeComponentMeans(scoredForMeans)
        },
        recommendations: [],
        createdAt: new Date()
    };

    summary.recommendations = generateRecommendations(summary, trades);

    return summary;
}

export function generateRecommendations(summary: AuditSummary, trades: EnrichedTrade[]): string[] {
    const recs: string[] = [];
    const b = summary.breakdown;


    if (b.makerRatio < 0.3) {
        const takingPercent = Math.round((1 - b.makerRatio) * 100);
        let takerFeesUsd = 0;
        for (const t of trades) { if (!t.isMaker) { try { takerFeesUsd += tradeFeeUsd(t); } catch (e) { } } }
        recs.push(`You used market orders for ${takingPercent}% of trades, paying taker fees on each. You paid $${takerFeesUsd.toFixed(2)} in fees on taker fills this period.`);
    }

    if (b.worstHour >= 22 || b.worstHour < 7) {
        const hourStats: Record<number, { sum: number; notional: number }> = {};
        for (const t of trades) {
            try {
                const s = scoreTrade(t);
                const h = t.executedAt.getUTCHours();
                if (!hourStats[h]) hourStats[h] = { sum: 0, notional: 0 };
                hourStats[h].sum += s.fillScore * t.notional;
                hourStats[h].notional += t.notional;
            } catch (e) { }
        }
        let worstScore = 0;
        let bestScore = 0;
        if (hourStats[b.worstHour] && hourStats[b.worstHour].notional > 0) {
            worstScore = hourStats[b.worstHour].sum / hourStats[b.worstHour].notional;
        }
        if (hourStats[b.bestHour] && hourStats[b.bestHour].notional > 0) {
            bestScore = hourStats[b.bestHour].sum / hourStats[b.bestHour].notional;
        }

        const xStr = worstScore.toFixed(1);
        // The measured gap (best-hour avg minus worst-hour avg) is stated as measured; no model cap is applied.
        const gapPhrase = hourGapPhrase({ measured: bestScore - worstScore });
        const gapText = bestScore > worstScore ? ` Your best hour ${gapPhrase}.` : '';
        recs.push(`Your worst-performing trades (avg score: ${xStr}) fell between 22:00–07:00 UTC.${gapText}`);
    }

    if (b.avgSlippageBps > 20) {
        const xStr = b.avgSlippageBps.toFixed(1);
        recs.push(`Your average arrival slippage of ${xStr} bps over this period.`);
    }

    if (summary.estimatedLossUSD > 50) {
        let avgSlip = 0, avgFee = 0, avgTime = 0;
        let validNotional = 0;
        for (const t of trades) {
            try {
                const s = scoreTrade(t);
                avgSlip += s.slippageScore * t.notional;
                avgFee += s.feeScore * t.notional;
                avgTime += s.timingScore * t.notional;
                validNotional += t.notional;
            } catch (e) { }
        }
        if (validNotional > 0) {
            avgSlip /= validNotional;
            avgFee /= validNotional;
            avgTime /= validNotional;
        }

        let contributor = 'slippage';
        let lowest = avgSlip;
        if (avgFee < lowest) { lowest = avgFee; contributor = 'fees'; }
        if (avgTime < lowest) { lowest = avgTime; contributor = 'timing'; }

        const xStr = summary.estimatedLossUSD.toFixed(2);
        recs.push(`Fees above 2 bps of notional came to $${xStr} over this period (2 bps is a reference level, not a benchmark). The lowest-scoring component was ${contributor}.`);
    }

    const symStats: Record<string, { sum: number; notional: number }> = {};
    for (const t of trades) {
        try {
            const s = scoreTrade(t);
            const sym = t.symbol;
            if (!symStats[sym]) symStats[sym] = { sum: 0, notional: 0 };
            symStats[sym].sum += s.fillScore * t.notional;
            symStats[sym].notional += t.notional;
        } catch (e) { }
    }
    let bestSymScore = 0;
    if (b.bestSymbol && symStats[b.bestSymbol] && symStats[b.bestSymbol].notional > 0) {
        bestSymScore = symStats[b.bestSymbol].sum / symStats[b.bestSymbol].notional;
    }
    recs.push(`Your best-performing symbol is ${b.bestSymbol} (avg score: ${bestSymScore.toFixed(1)}). Your execution quality is most consistent there.`);

    return recs;
}

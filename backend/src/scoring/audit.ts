import { EnrichedTrade, AuditSummary } from '../types';
import {
    scoreTrade,
    gradeFromScore,
    computeArrivalSlippageBps,
    computeFeeDragBps
} from './engine';

export async function computeAuditSummary(userId: string, trades: EnrichedTrade[]): Promise<AuditSummary> {
    if (trades.length === 0) {
        throw new Error("Cannot compute audit summary for 0 trades.");
    }

    let totalNotional = 0;
    let weightedFillScoreSum = 0;
    let weightedSlippageBpsSum = 0;
    let weightedFeeDragBpsSum = 0;
    let makerCount = 0;
    let estimatedLossUSD = 0;

    let minDate = trades[0].executedAt;
    let maxDate = trades[0].executedAt;

    const hourStats: Record<number, { sum: number; notional: number }> = {};
    const symbolStats: Record<string, { sum: number; notional: number }> = {};

    for (const trade of trades) {
        let scores;
        try {
            scores = scoreTrade(trade);
        } catch (e) {
            continue;
        }

        const notional = trade.notional;
        totalNotional += notional;

        if (trade.executedAt < minDate) minDate = trade.executedAt;
        if (trade.executedAt > maxDate) maxDate = trade.executedAt;

        const arrivalSlippageBps = Math.abs(computeArrivalSlippageBps(trade.executionPrice, trade.arrivalPriceProxy!, trade.side));
        const feeDragBps = computeFeeDragBps(trade.fee, trade.notional);

        weightedFillScoreSum += scores.fillScore * notional;
        weightedSlippageBpsSum += arrivalSlippageBps * notional;
        weightedFeeDragBpsSum += feeDragBps * notional;

        if (trade.isMaker) makerCount++;

        const loss = ((feeDragBps - 2) / 10000) * notional;
        if (loss > 0) estimatedLossUSD += loss;

        const hour = trade.executedAt.getUTCHours();
        if (!hourStats[hour]) hourStats[hour] = { sum: 0, notional: 0 };
        hourStats[hour].sum += scores.fillScore * notional;
        hourStats[hour].notional += notional;

        const sym = trade.symbol;
        if (!symbolStats[sym]) symbolStats[sym] = { sum: 0, notional: 0 };
        symbolStats[sym].sum += scores.fillScore * notional;
        symbolStats[sym].notional += notional;
    }

    if (totalNotional === 0) {
        throw new Error("Total notional is 0, cannot compute weighted averages.");
    }

    let bestHour = 0;
    let worstHour = 0;
    let maxHourScore = -1;
    let minHourScore = 101;

    for (const [hourStr, stat] of Object.entries(hourStats)) {
        const h = parseInt(hourStr, 10);
        const avgScore = stat.notional > 0 ? stat.sum / stat.notional : 0;
        if (avgScore > maxHourScore) { maxHourScore = avgScore; bestHour = h; }
        if (avgScore < minHourScore) { minHourScore = avgScore; worstHour = h; }
    }

    let bestSymbol = trades[0].symbol;
    let worstSymbol = trades[0].symbol;
    let maxSymScore = -1;
    let minSymScore = 101;

    for (const [sym, stat] of Object.entries(symbolStats)) {
        const avgScore = stat.notional > 0 ? stat.sum / stat.notional : 0;
        if (avgScore > maxSymScore) { maxSymScore = avgScore; bestSymbol = sym; }
        if (avgScore < minSymScore) { minSymScore = avgScore; worstSymbol = sym; }
    }

    const avgFillScore = weightedFillScoreSum / totalNotional;

    const summary: AuditSummary = {
        userId,
        period: { start: minDate, end: maxDate },
        exchange: trades[0].exchange,
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
            worstSymbol
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

    const msDiff = summary.period.end.getTime() - summary.period.start.getTime();
    let days = msDiff / (1000 * 60 * 60 * 24);
    if (days < 1) days = 1;
    const monthlyMultiplier = 30 / days;

    if (b.makerRatio < 0.3) {
        const takingPercent = Math.round((1 - b.makerRatio) * 100);
        const savingsUsd = summary.estimatedLossUSD * monthlyMultiplier;
        const y = savingsUsd.toFixed(2);
        recs.push(`You used market orders for ${takingPercent}% of trades, paying taker fees every time. Switching to limit orders could save ~$${y}/month based on your trading volume.`);
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
        const zStr = (bestScore - worstScore).toFixed(1);
        recs.push(`Your worst-performing trades (avg score: ${xStr}) happen between 22:00–07:00 UTC when crypto spreads are 2–4× wider. Shifting these to 08:00–16:00 UTC could improve your score by ~${zStr} points.`);
    }

    if (b.avgSlippageBps > 20) {
        const xStr = b.avgSlippageBps.toFixed(1);
        recs.push(`Your average arrival slippage of ${xStr} bps is above the retail average of 15–20 bps. This suggests you're often entering during volatile moments. Consider using limit orders with a small price buffer.`);
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
        recs.push(`Poor execution quality has cost you an estimated $${xStr} over this period. The biggest contributor is ${contributor}.`);
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

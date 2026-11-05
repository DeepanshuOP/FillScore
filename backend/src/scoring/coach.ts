const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface HourSummary {
    avgScore: number;
    count: number;
}

interface ScoredTrade {
    executedAt: Date;
    fillScore?: number | null;
}

/** Average fill score of the scored trades executed in one UTC hour, or null if there are none. */
export function hourSummary(trades: ScoredTrade[], hour: number): HourSummary | null {
    let total = 0;
    let count = 0;
    for (const t of trades) {
        if (t.fillScore == null) continue;
        if (new Date(t.executedAt).getUTCHours() !== hour) continue;
        total += t.fillScore;
        count++;
    }
    return count === 0 ? null : { avgScore: Math.round(total / count), count };
}

/** The audited span in whole days ("29 days"), so cost figures state the period they cover. */
export function describePeriod(period: { start: Date; end: Date }): string {
    const days = Math.max(1, Math.round((new Date(period.end).getTime() - new Date(period.start).getTime()) / MS_PER_DAY));
    return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function describeWindow(summary: HourSummary | null): string | null {
    if (!summary) return null;
    return `avg score ${summary.avgScore} across ${summary.count} ${summary.count === 1 ? 'trade' : 'trades'}`;
}

/** Hour as shown to users: 3 -> "03:00". */
export const formatHour = (h: number) => String(h).padStart(2, '0') + ':00';

/** "avg 82 across 13 trades", the measured average and sample behind a window. */
export function describeAvg(summary: HourSummary | null): string | null {
    if (!summary) return null;
    return `avg ${summary.avgScore} across ${summary.count} ${summary.count === 1 ? 'trade' : 'trades'}`;
}

export interface CoachAction {
    category: 'TIMING' | 'VENUE' | 'ORDER_TYPE';
    title: string;
    detail: string;
    estimatedImpact: string;
    impactValue: number;
    icon: 'clock' | 'exchange' | 'tag';
    priority?: number;
}

export interface CoachInput {
    breakdown: { bestHour?: number | null; worstHour?: number | null; makerRatio?: number | null };
    periodText: string | null;
    trades: ScoredTrade[];
    attribution: { timingCost: number; feeCost: number; totalNotional: number } | null;
    venue: { bestExchange: string; worstExchange: string; venueAlphaBps: number } | null;
}

/**
 * Describes where modelled cost came from, in the past tense. It states what the measured data
 * shows; it never tells the user what to do. Every number is computed here from the inputs.
 */
export function buildCoach(input: CoachInput): { headline: string; actions: CoachAction[] } {
    const { breakdown: b, attribution, venue, trades } = input;
    const overPeriod = input.periodText ? ` over ${input.periodText}` : '';
    const actions: CoachAction[] = [];

    if (b.bestHour != null && b.worstHour != null && attribution && attribution.timingCost > 0) {
        const bestH = formatHour(b.bestHour);
        const worstH = formatHour(b.worstHour);
        const best = describeAvg(hourSummary(trades, b.bestHour));
        const worst = describeAvg(hourSummary(trades, b.worstHour));
        actions.push({
            category: 'TIMING',
            title: `Best-scoring hour: ${bestH} UTC`,
            detail: `Your highest-scoring trades clustered around ${bestH} UTC${best ? ` (${best})` : ''}; your lowest around ${worstH} UTC${worst ? ` (${worst})` : ''}.`,
            estimatedImpact: `~$${Math.round(attribution.timingCost)}${overPeriod} (modelled)`,
            impactValue: attribution.timingCost,
            icon: 'clock',
        });
    }

    if (venue && venue.venueAlphaBps > 0) {
        const bestX = (venue.bestExchange || '').toUpperCase();
        const worstX = (venue.worstExchange || '').toUpperCase();
        actions.push({
            category: 'VENUE',
            title: `Lowest-slippage venue: ${bestX}`,
            detail: `Your fills averaged less slippage on ${bestX} than on ${worstX}.`,
            estimatedImpact: `~${venue.venueAlphaBps.toFixed(1)} bps slippage difference`,
            impactValue: venue.venueAlphaBps * (attribution?.totalNotional || 0) / 10000,
            icon: 'exchange',
        });
    }

    if (b.makerRatio != null && b.makerRatio < 0.7 && attribution && attribution.feeCost > 0) {
        const taker = attribution.feeCost * (0.7 - b.makerRatio);
        actions.push({
            category: 'ORDER_TYPE',
            title: `Maker share of fills: ${Math.round(b.makerRatio * 100)}%`,
            detail: `${Math.round(b.makerRatio * 100)}% of your fills were maker; the rest paid taker fees.`,
            estimatedImpact: `~$${Math.round(taker)} of taker-fee cost${overPeriod} (modelled)`,
            impactValue: taker,
            icon: 'tag',
        });
    }

    actions.sort((a, c) => c.impactValue - a.impactValue);
    actions.forEach((a, i) => { a.priority = i + 1; });

    let headline = 'No modelled cost driver stood out in this period.';
    if (actions.length > 0) {
        const top = actions[0];
        const driver = top.category === 'TIMING' ? 'timing' : top.category === 'VENUE' ? 'venue' : 'order type (taker fees)';
        headline = `Largest modelled cost driver: ${driver} (${top.estimatedImpact})`;
    }
    return { headline, actions };
}

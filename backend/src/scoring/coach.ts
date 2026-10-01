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

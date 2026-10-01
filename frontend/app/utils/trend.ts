export interface HistoryPoint {
  snapshotAt: string;
  avgFillScore: number;
  fillGrade: string;
  totalTrades: number;
}

export interface TrendDatum {
  label: string;
  score: number;
  isCurrent: boolean;
  snapshotAt: string;
}

export type TrendView =
  | { state: 'empty' }
  | { state: 'single'; score: number; label: string }
  | { state: 'series'; data: TrendDatum[]; delta: number; spanDays: number };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const formatLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** Turns stored audit snapshots into what the dashboard can draw. Nothing here is estimated. */
export function buildTrend(points: HistoryPoint[]): TrendView {
  if (points.length === 0) return { state: 'empty' };

  if (points.length === 1) {
    const only = points[0];
    return { state: 'single', score: Math.round(only.avgFillScore), label: formatLabel(only.snapshotAt) };
  }

  const data = points.map((p, i) => ({
    label: formatLabel(p.snapshotAt),
    score: Math.round(p.avgFillScore),
    isCurrent: i === points.length - 1,
    snapshotAt: p.snapshotAt,
  }));

  const first = points[0];
  const last = points[points.length - 1];

  return {
    state: 'series',
    data,
    delta: Math.round(last.avgFillScore) - Math.round(first.avgFillScore),
    spanDays: Math.round((new Date(last.snapshotAt).getTime() - new Date(first.snapshotAt).getTime()) / MS_PER_DAY),
  };
}

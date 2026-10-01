import { describe, it, expect } from 'vitest';
import { buildTrend, HistoryPoint } from './trend';

const point = (snapshotAt: string, avgFillScore: number, totalTrades = 10): HistoryPoint => ({
  snapshotAt,
  avgFillScore,
  fillGrade: 'B',
  totalTrades,
});

describe('buildTrend', () => {
  it('reports empty when there is no history', () => {
    expect(buildTrend([])).toEqual({ state: 'empty' });
  });

  it('reports a single audit without inventing a trend', () => {
    const result = buildTrend([point('2026-09-10T08:00:00Z', 84.4)]);
    expect(result.state).toBe('single');
    if (result.state === 'single') {
      expect(result.score).toBe(84);
      expect(result.label).toBe('Sep 10');
    }
  });

  it('builds a series from real points with a measured change', () => {
    const result = buildTrend([
      point('2026-08-01T00:00:00Z', 70),
      point('2026-09-01T00:00:00Z', 76.5),
      point('2026-09-20T00:00:00Z', 81),
    ]);
    expect(result.state).toBe('series');
    if (result.state === 'series') {
      expect(result.data.map(d => d.score)).toEqual([70, 77, 81]);
      expect(result.data.map(d => d.label)).toEqual(['Aug 1', 'Sep 1', 'Sep 20']);
      expect(result.data.map(d => d.isCurrent)).toEqual([false, false, true]);
      expect(result.delta).toBe(11);
      expect(result.spanDays).toBe(50);
    }
  });

  it('reports a negative change when the score fell', () => {
    const result = buildTrend([point('2026-09-01T00:00:00Z', 90), point('2026-09-08T00:00:00Z', 85.2)]);
    expect(result.state).toBe('series');
    if (result.state === 'series') {
      expect(result.delta).toBe(-5);
      expect(result.spanDays).toBe(7);
    }
  });

  it('labels by UTC date so the chart does not shift with the viewer timezone', () => {
    const result = buildTrend([point('2026-09-30T23:30:00Z', 80), point('2026-10-01T00:30:00Z', 81)]);
    expect(result.state).toBe('series');
    if (result.state === 'series') {
      expect(result.data.map(d => d.label)).toEqual(['Sep 30', 'Oct 1']);
    }
  });
});

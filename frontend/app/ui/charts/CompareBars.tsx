import { bps } from '../../lib/format'
import type { RankRow } from '../../dashboard/rankingsView'
import { niceDomain, niceTicks } from './ticks'

/**
 * Comparisons (design v5, PROPOSAL §5 and §6): one horizontal bar per group, from the zero line to the group's median execution
 * cost, with a whisker over its 90% interval. Group names on the left, the value at the bar's end, the order count on the right.
 * Every value is served (`/audit/rankings`); the SVG only maps them to positions. Ticks are round values; the axis title is
 * HTML under the plot, so it never overlaps a tick. A bar differs from its whisker by shape, not colour alone.
 */
const ROW = 40
const pos = (v: number, lo: number, hi: number) => `${(((v - lo) / (hi - lo)) * 100).toFixed(3)}%`

export function CompareBars({ rows, level }: { rows: RankRow[]; level: number }) {
  const [lo, hi] = niceDomain(Math.min(...rows.map((r) => r.low)), Math.max(...rows.map((r) => r.high)))
  const ticks = niceTicks(lo, hi)
  const pct = Math.round(level * 100)
  return (
    <figure className="m-0 flex flex-col gap-2" data-testid="compare-bars" aria-label={`Median execution cost per group with a ${pct}% interval`}>
      <ol className="flex flex-col">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(64px,110px)_minmax(0,1fr)_auto] items-center gap-3 border-b border-ui-rule" style={{ height: ROW }}>
            <span className="truncate text-[14px] font-medium text-ui-ink" title={r.key}>{r.key}</span>
            <svg width="100%" height={ROW} style={{ overflow: 'visible' }} role="img" aria-label={`${r.key}: median ${bps(r.median)}, ${pct}% interval ${bps(r.low)} to ${bps(r.high)}${r.tie ? `, ${r.tie}` : ''}`}>
              {ticks.map((t) => <line key={t} x1={pos(t, lo, hi)} x2={pos(t, lo, hi)} y1="0" y2={ROW} stroke="var(--ui-grid)" />)}
              <line x1={pos(0, lo, hi)} x2={pos(0, lo, hi)} y1="0" y2={ROW} stroke="var(--ui-axis)" strokeWidth="1.5" />
              <rect x={pos(Math.min(0, r.median), lo, hi)} width={`${((Math.abs(r.median) / (hi - lo)) * 100).toFixed(3)}%`} y="10" height="14" rx="2" fill="var(--ui-series-1)" />
              <line x1={pos(r.low, lo, hi)} x2={pos(r.high, lo, hi)} y1="17" y2="17" stroke="var(--ui-ink)" strokeWidth="2" />
              <line x1={pos(r.low, lo, hi)} x2={pos(r.low, lo, hi)} y1="11" y2="23" stroke="var(--ui-ink)" strokeWidth="2" />
              <line x1={pos(r.high, lo, hi)} x2={pos(r.high, lo, hi)} y1="11" y2="23" stroke="var(--ui-ink)" strokeWidth="2" />
              <text x={pos(Math.max(r.high, r.median, 0), lo, hi)} dx="6" y="21" fontSize="13" fill="var(--ui-ink)">{bps(r.median)}</text>
            </svg>
            <span className="text-right text-[13px] tabular-nums text-ui-graphite">{r.n} orders</span>
          </li>
        ))}
      </ol>
      <div className="grid grid-cols-[minmax(64px,110px)_minmax(0,1fr)_auto] gap-3" aria-hidden="true">
        <span />
        <div className="relative h-4">
          {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2 text-[12px] tabular-nums text-ui-graphite" style={{ left: pos(t, lo, hi) }}>{t}</span>)}
        </div>
        <span className="invisible text-[13px]">000 orders</span>
      </div>
      <p className="text-center text-[12px] text-ui-graphite">Median execution cost (bps). The whisker is the {pct}% interval.</p>
    </figure>
  )
}

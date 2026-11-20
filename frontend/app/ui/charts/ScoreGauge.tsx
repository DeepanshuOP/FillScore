'use client'

import * as m from 'motion/react-m'
import { GradeChip } from '../GradeChip'
import { formatScore } from '../format'

/**
 * Radial score gauge: a 240-degree arc from 0 to 100, the measured score drawn in the grade's colour, the letter in the
 * centre. The arc is decoration of a number that is written beside it in words (role img + label), never the only form.
 * The arc draws in once (0.9 s, ease out) on first load; with reduced motion Motion skips to the end.
 *
 * Geometry (hand-checked): sweep 240 deg starting at 150 deg (lower left) clockwise; r = 52 in a 128 box, so the arc
 * length is 2 pi 52 x 240/360 = 217.82; the drawn part is 217.82 x score/100.
 */
export const GAUGE = { size: 128, r: 52, sweep: 240, start: 150 } as const

export function arcPath(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number): string {
  const rad = (d: number) => (d * Math.PI) / 180
  const x0 = cx + r * Math.cos(rad(startDeg)), y0 = cy + r * Math.sin(rad(startDeg))
  const x1 = cx + r * Math.cos(rad(startDeg + sweepDeg)), y1 = cy + r * Math.sin(rad(startDeg + sweepDeg))
  const large = sweepDeg > 180 ? 1 : 0
  const f = (n: number) => Math.round(n * 100) / 100
  return `M${f(x0)} ${f(y0)} A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`
}

export function ScoreGauge({ score, grade, size = 168 }: { score: number; grade: string; size?: number }) {
  const { r, sweep, start } = GAUGE
  const c = GAUGE.size / 2
  const t = Math.max(0, Math.min(100, score)) / 100
  const g = ['A', 'B', 'C', 'D', 'F'].includes(grade) ? `var(--ui-grade-${grade.toLowerCase()})` : 'var(--ui-graphite)'
  const track = arcPath(c, c, r, start, sweep)
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${GAUGE.size} ${GAUGE.size}`} width={size} height={size} role="img" aria-label={`Measured score ${formatScore(score)} of 100, grade ${grade}`}>
        <path d={track} fill="none" stroke="var(--ui-overlay)" strokeWidth={9} strokeLinecap="round" />
        {/* ticks at 0, 25, 50, 75, 100 */}
        {[0, 0.25, 0.5, 0.75, 1].map((k) => {
          const a = ((start + sweep * k) * Math.PI) / 180
          return <line key={k} x1={c + (r + 9) * Math.cos(a)} y1={c + (r + 9) * Math.sin(a)} x2={c + (r + 12) * Math.cos(a)} y2={c + (r + 12) * Math.sin(a)} stroke="var(--ui-edge)" strokeWidth={1} />
        })}
        <m.path d={track} fill="none" stroke={g} strokeWidth={9} strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: t }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          style={{ filter: `drop-shadow(0 0 10px color-mix(in srgb, ${g} 35%, transparent))` }} />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 pt-2">
        <GradeChip grade={grade} size="lg" />
        <span className="text-[13px] tabular-nums text-ui-graphite"><span className="font-medium text-ui-ink">{formatScore(score)}</span> of 100</span>
      </div>
    </div>
  )
}

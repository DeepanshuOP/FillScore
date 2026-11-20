import { cn } from '../../lib/utils'
import { getGradeColor } from '../utils/gradeColor'
import { readableOn } from './contrast'
import { formatScore } from './format'

/**
 * A grade letter on the grade's own colour (gradeColor.ts is the one source; the letter is the one place a verdict is
 * allowed) with the words that say what the grade is: "measured" for scoring v2, "rule-based" for the frozen v1.
 * The text on the chip is near-black or white, whichever reads better on that grade colour (tested at 4.5:1).
 */
export function GradeBadge({ grade, score, version, scoringVersion, v1Basis, size = 'md', className }: {
  grade: string
  score?: number | null
  version: 'v1' | 'v2'
  scoringVersion?: string
  /** v1 only: what the grade was computed from. The default is the published grade of the earlier demo data. */
  v1Basis?: string
  size?: 'md' | 'lg'
  className?: string
}) {
  const bg = getGradeColor(grade)
  const kind = version === 'v2' ? 'Measured score' : 'Rule-based score'
  const detail = [
    score != null && Number.isFinite(score) ? `${formatScore(score)} of 100` : null,
    version === 'v2' ? (scoringVersion ? `scoring ${scoringVersion}` : null) : (v1Basis ?? 'published grade of the earlier demo data, scoring v1'),
  ].filter(Boolean).join(', ')
  return (
    <div className={cn('flex items-center gap-3', className)} data-grade-version={version}>
      <span aria-hidden="true" style={{ background: bg, color: readableOn(bg) }}
        className={cn('inline-grid shrink-0 place-items-center rounded-ui font-semibold', size === 'lg' ? 'size-14 text-[1.75rem]' : 'size-10 text-[1.25rem]')}>
        {grade}
      </span>
      <div className="leading-snug">
        <p className="text-sm font-medium text-ui-ink">{kind}, grade {grade}</p>
        {detail ? <p className="text-sm text-ui-graphite tabular-nums">{detail}</p> : null}
      </div>
    </div>
  )
}

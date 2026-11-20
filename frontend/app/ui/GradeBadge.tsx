import { cn } from '../../lib/utils'
import { GradeChip } from './GradeChip'
import { formatScore } from './format'

/**
 * A grade chip with the words that say what the grade is: "measured" for scoring v2, "rule-based" for the frozen v1.
 * Design v2: the chip is the refined, desaturated GradeChip (letter in the grade colour on a 14% tint).
 */
export function GradeBadge({ grade, score, version, scoringVersion, v1Basis, size = 'md', className }: {
  grade: string
  score?: number | null
  version: 'v1' | 'v2'
  scoringVersion?: string
  /** v1 only: what the grade was computed from. The default is the published grade of the earlier demo data. */
  v1Basis?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const kind = version === 'v2' ? 'Measured score' : 'Rule-based score'
  const detail = [
    score != null && Number.isFinite(score) ? `${formatScore(score)} of 100` : null,
    version === 'v2' ? (scoringVersion ? `scoring ${scoringVersion}` : null) : (v1Basis ?? 'published grade of the earlier demo data, scoring v1'),
  ].filter(Boolean).join(', ')
  return (
    <div className={cn('flex items-center gap-3', className)} data-grade-version={version}>
      <GradeChip grade={grade} size={size} />
      <div className="leading-snug">
        <p className="text-sm font-medium text-ui-ink">{kind}, grade {grade}</p>
        {detail ? <p className="text-[13px] text-ui-graphite tabular-nums">{detail}</p> : null}
      </div>
    </div>
  )
}

'use client'

import Link from 'next/link'
import { GradeStamp } from '../ui/GradeStamp'
import { ValueState } from '../ui/ValueState'
import { formatScore, formatUsd } from '../ui/format'
import { totalSentence, unmeasuredNote, type GradeView, type Headline } from './headline'

/**
 * The key figures under Ask on Home (IA v4, step 3): the overview's chapter 01 (the period's total, one sentence) and chapter 02
 * (the grade as the small stamp, with the scoring version and range printed beside it, because the small stamp prints the period
 * only). Everything comes from the same answers as the overview. The rest of the audit is one link away.
 */
export function HomeFigures({ headline, grade, band, periodLabel, scope, overviewHref }: {
  headline: Headline | null
  grade: GradeView | null
  band: [number, number] | null
  periodLabel: string
  /** The code-built scope line, "January 2024, 245 orders": the unit and period of the total, in words. */
  scope: string
  overviewHref: string
}) {
  return (
    <section aria-labelledby="home-figures-t" className="border-t border-ui-ink pt-8" data-testid="home-figures">
      <h2 id="home-figures-t" className="sr-only">Key figures, {periodLabel}</h2>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="min-w-0">
          <p aria-hidden="true" className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">01 TOTAL</p>
          {headline ? (
            <>
              <p className="display-lg mt-2 text-ui-ink" data-testid="home-total">{formatUsd(headline.totalUsd)}</p>
              <p className="mt-3 max-w-[48ch] text-[20px] leading-snug font-bold tracking-[-0.02em] text-ui-ink" data-testid="home-total-sentence">{totalSentence(headline)}</p>
              <p className="mt-1.5 text-[15px] text-ui-graphite">{scope}</p>
              {headline.feesNotMeasured ? <p className="mt-1.5 text-[14px] text-ui-graphite">Not independently measured: fees at the published rate.</p> : null}
              {headline.unmeasuredOrders > 0 ? <p className="mt-1.5 text-[14px] text-ui-graphite">{unmeasuredNote(headline.unmeasuredOrders)}</p> : null}
            </>
          ) : <ValueState state="not-computed" label="Total cost" reason="The orders were not measured, so there is no dollar total." />}
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <p aria-hidden="true" className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">02 GRADE</p>
          {grade?.kind === 'graded' ? (
            <>
              <GradeStamp grade={grade.letter} score={grade.score} period={periodLabel} version={grade.scoringVersion} size="sm" />
              <p className="font-mono text-[12px] tracking-[0.06em] text-ui-graphite uppercase" data-testid="home-stamp-version">
                Scoring {grade.scoringVersion} (measured){band ? `, range ${formatScore(band[0])} to ${formatScore(band[1])}` : ''}
              </p>
            </>
          ) : grade ? <ValueState state="insufficient" label="Measured grade" reason={grade.text} /> : null}
        </div>
      </div>
      <p className="mt-10"><Link href={overviewHref} className="text-[16px] font-bold text-ui-ink underline underline-offset-4" data-testid="home-overview-link">Read the full overview</Link></p>
    </section>
  )
}

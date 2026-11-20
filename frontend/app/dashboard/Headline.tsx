import React from 'react';
import { GradeBadge } from '../ui/GradeBadge';
import { ProvenanceChip } from '../ui/ProvenanceChip';
import { ValueState } from '../ui/ValueState';
import { formatSignedBps, formatUsd } from '../ui/format';
import { unmeasuredNote, type GradeView, type Headline as HeadlineData } from './headline';

interface Props {
  grade: GradeView | null;
  headline: HeadlineData | null;
  /** The one short cost-against-expected sentence (difference, interval, n); null when there is no figure. */
  sentence: string | null;
  /** What is missing when there is no figure: shown as an "insufficient data" value, never as a sentence. */
  insufficientReason: string | null;
  dataSource: 'synthetic-demo' | 'real-user';
  facts: Array<[string, string]>;
  /** The frozen rule-based grade (scoring v1): a labelled secondary line. null when it was not computed for this data. */
  v1: { grade: string; score: number; basis?: string } | null;
  v1Note: string | null;
  actions?: React.ReactNode;
}

/**
 * The one headline of the dashboard: the measured grade, what the orders paid in total, which part of that was measured
 * against market prices and which was not, and one sentence about cost against expected. The v1 grade is a labelled
 * second line, never the lead. Every missing number is a ValueState.
 */
export default function Headline({ grade, headline, sentence, insufficientReason, dataSource, facts, v1, v1Note, actions }: Props) {
  return (
    <section aria-labelledby="headline" data-testid="headline" className="rounded-ui border border-ui-rule bg-ui-raised p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {grade?.kind === 'graded' ? (
          <GradeBadge grade={grade.letter} score={grade.score} version="v2" scoringVersion={grade.scoringVersion} size="lg" />
        ) : grade ? (
          <ValueState state="insufficient" label="Measured grade" reason={grade.text} size="md" />
        ) : (
          <span className="text-ui-graphite">Loading the measured grade.</span>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceChip dataSource={dataSource} className="mr-2" />
          {actions}
        </div>
      </div>

      {/* The total is a sum of measured terms and, for a demo account, of fees stated at the published rate. So the total
          itself carries no "measured" marker; the marker sits on the measured part below. */}
      {headline ? (
        <>
          <h2 id="headline" className="mt-6 max-w-[34ch] text-[1.5rem] leading-[1.3] font-semibold text-balance text-ui-ink sm:text-[1.75rem] sm:leading-[1.3]">
            The {headline.orders} {headline.orders === 1 ? 'order' : 'orders'} paid {formatUsd(headline.totalUsd)} in total.
          </h2>
          <dl className="mt-4 grid gap-x-10 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="mb-1 text-sm text-ui-graphite">{headline.feesNotMeasured ? 'Measured against market prices' : 'Measured'}</dt>
              <dd><ValueState state="measured" label="Measured part of the total" value={formatUsd(headline.measuredUsd)} size="md" n={headline.orders} nLabel="orders" /></dd>
            </div>
            {headline.feesNotMeasured && headline.feesUsd !== null ? (
              <div>
                <dt className="mb-1 text-sm text-ui-graphite">Fees at the published rate, not independently measured</dt>
                <dd className="text-[1.25rem] leading-7 font-semibold tabular-nums text-ui-ink">{formatUsd(headline.feesUsd)}</dd>
              </div>
            ) : null}
          </dl>
          <p className="mt-3 text-sm text-ui-graphite">
            The total is {formatSignedBps(headline.totalBps)} of the value ordered.
            {headline.unmeasuredOrders > 0 ? ` ${unmeasuredNote(headline.unmeasuredOrders)}` : ''}
          </p>
        </>
      ) : (
        <>
          <h2 id="headline" className="mt-6 text-[1.5rem] leading-[1.3] font-semibold text-ui-ink sm:text-[1.75rem]">What the orders paid in total</h2>
          <div className="mt-3">
            <ValueState state="not-computed" label="Total cost" reason="The orders were not measured, so there is no dollar total." />
          </div>
        </>
      )}

      <div className="mt-4 max-w-[68ch]" data-testid="cost-sentence">
        {sentence ? <p className="text-ui-graphite">{sentence}</p>
          : (
            <>
              <p className="mb-1 text-sm text-ui-graphite">Cost against expected</p>
              <ValueState state="insufficient" label="Cost against expected" reason={insufficientReason ?? 'no figure was computed'} size="md" />
            </>
          )}
      </div>

      <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-ui-rule pt-4 text-sm sm:grid-cols-3 lg:grid-cols-5" data-testid="scope-facts">
        {facts.map(([label, value]) => (
          <div key={label}><dt className="text-ui-graphite">{label}</dt><dd className="font-medium tabular-nums text-ui-ink">{value}</dd></div>
        ))}
      </dl>

      <div className="mt-6 border-t border-ui-rule pt-4">
        {v1 ? (
          <div data-testid="score-v1-label"><GradeBadge grade={v1.grade} score={v1.score} version="v1" v1Basis={v1.basis} /></div>
        ) : (
          <p data-testid="score-v1-label" className="text-sm text-ui-graphite">Rule-based score (v1): not computed for this data.</p>
        )}
        {v1Note ? <p data-testid="score-v1-demo-note" className="mt-2 max-w-[68ch] text-sm text-ui-graphite">{v1Note}</p> : null}
      </div>
    </section>
  );
}

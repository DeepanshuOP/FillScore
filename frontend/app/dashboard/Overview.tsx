'use client'

import { useState, type ReactNode } from 'react'
import * as m from 'motion/react-m'
import { Info } from 'lucide-react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { cn } from '../../lib/utils'
import { ValueState } from '../ui/ValueState'
import { GradeBadge } from '../ui/GradeBadge'
import { Figure, USD_FORMAT } from '../ui/Figure'
import { formatSignedBps, formatUsd } from '../ui/format'
import { ScoreGauge } from '../ui/charts/ScoreGauge'
import { StackBar, type StackPart } from '../ui/charts/StackBar'
import { IntervalPlot } from '../ui/charts/IntervalPlot'
import { BarList } from '../ui/ChartFrame'
import { barRows, costSentence, costInsufficientReason, unmeasuredNote, type GradeView, type Headline } from './headline'
import { describeOrders, type OrdersBody } from './ordersView'
import type { CostVsExpected } from './scoreV2'

/** Bento card: a raised panel that fades and settles in once on first load (opacity and a 6 px rise; no count-up). */
function Card({ title, info, children, className, testId, id, delay = 0, aside }: {
  title: string; info?: ReactNode; children: ReactNode; className?: string; testId?: string; id?: string; delay?: number; aside?: ReactNode
}) {
  return (
    <m.section id={id} data-testid={testId} aria-labelledby={id ? `${id}-t` : undefined}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={cn('panel flex min-w-0 flex-col p-5 sm:p-6', className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 id={id ? `${id}-t` : undefined} className="flex items-center gap-1.5 text-[13px] font-medium text-ui-graphite">
          {title}
          {info ? (
            <HoverCard openDelay={150}>
              <HoverCardTrigger asChild>
                <button type="button" aria-label={`About: ${title}`} className="grid size-5 place-items-center rounded text-ui-graphite hover:text-ui-ink"><Info aria-hidden="true" className="size-3.5" /></button>
              </HoverCardTrigger>
              <HoverCardContent className="w-80 text-[13px] leading-5 text-ui-graphite">{info}</HoverCardContent>
            </HoverCard>
          ) : null}
        </h2>
        {aside}
      </header>
      {children}
    </m.section>
  )
}

export interface OverviewProps {
  grade: GradeView | null
  headline: Headline | null
  costVs: CostVsExpected | undefined
  ordersBody: unknown
  isDemo: boolean
  facts: Array<[string, string]>
  v1: { grade: string; score: number; basis?: string } | null
  v1Note: string | null
  freshness?: ReactNode
}

function GradeCard({ grade, v1, v1Note }: Pick<OverviewProps, 'grade' | 'v1' | 'v1Note'>) {
  return (
    <Card title="Measured grade" id="grade" className="lg:col-span-4" delay={0}
      info={<>The measured grade (scoring v2) compares each order with the exchange&rsquo;s public prints of the same seconds. Execution cost, fees and unfilled orders are scored; timing is shown, not scored. The rule-based grade (scoring v1) is frozen and kept for reference.</>}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-2">
        {grade?.kind === 'graded' ? (
          <>
            <ScoreGauge score={grade.score} grade={grade.letter} />
            <p className="text-[13px] text-ui-graphite">Scoring {grade.scoringVersion}</p>
          </>
        ) : grade ? (
          <ValueState state="insufficient" label="Measured grade" reason={grade.text} size="md" />
        ) : <div className="size-[168px] rounded-full bg-ui-overlay/60" aria-label="Loading the measured grade" />}
      </div>
      <div className="mt-4 border-t border-ui-rule pt-3">
        {v1 ? (
          <div data-testid="score-v1-label"><GradeBadge grade={v1.grade} score={v1.score} version="v1" v1Basis={v1.basis} size="sm" /></div>
        ) : (
          <p data-testid="score-v1-label" className="text-[13px] text-ui-graphite">Rule-based score (v1): not computed for this data.</p>
        )}
        {v1Note ? <p data-testid="score-v1-demo-note" className="mt-1.5 text-[12px] leading-4 text-ui-graphite">{v1Note}</p> : null}
      </div>
    </Card>
  )
}

function TotalCard({ headline, ordersBody, isDemo }: Pick<OverviewProps, 'headline' | 'ordersBody' | 'isDemo'>) {
  const t = (ordersBody as { shortfall?: { totals?: Record<string, { usd: number } | null> } } | null)?.shortfall?.totals
  const parts: StackPart[] = []
  if (headline && t) {
    if (t.execution) parts.push({ key: 'execution', label: 'Execution cost', value: t.execution.usd, valueLabel: formatUsd(t.execution.usd), note: 'measured' })
    if (t.opportunity) parts.push({ key: 'opportunity', label: 'Unfilled orders', value: t.opportunity.usd, valueLabel: formatUsd(t.opportunity.usd), note: 'measured' })
    if (t.fees) parts.push({ key: 'fees', label: isDemo ? 'Fees at the published rate' : 'Fees', value: t.fees.usd, valueLabel: formatUsd(t.fees.usd), stated: isDemo, note: isDemo ? 'not independently measured' : 'from the account’s fee rates' })
  }
  return (
    <Card title="Total cost" id="total" testId="headline" className="lg:col-span-8" delay={0.05}
      info={<>Each term is its basis points times the intended value of the order, summed over the measured orders. {isDemo ? 'A demo account’s fees were generated at the published rate, so they are drawn as an outline: no market data checks them.' : ''}</>}>
      {headline ? (
        <div className="flex flex-1 flex-col justify-between gap-6">
          <div>
            <h2 id="headline" className="text-[1.375rem] leading-tight font-semibold tracking-[-0.02em] text-ui-ink sm:text-[1.75rem]">
              The {headline.orders} {headline.orders === 1 ? 'order' : 'orders'} paid{' '}
              <Figure value={headline.totalUsd} text={formatUsd(headline.totalUsd)} format={USD_FORMAT} className="text-ui-ink" /> in total.
            </h2>
            <p className="mt-2 text-[13px] text-ui-graphite">
              The total is {formatSignedBps(headline.totalBps)} of the value ordered.
              {headline.unmeasuredOrders > 0 ? ` ${unmeasuredNote(headline.unmeasuredOrders)}` : ''}
            </p>
          </div>
          <div className="grid gap-x-10 gap-y-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[13px] text-ui-graphite">{headline.feesNotMeasured ? 'Measured against market prices' : 'Measured'}</p>
              <ValueState state="measured" label="Measured part of the total" value={formatUsd(headline.measuredUsd)} size="lg" n={headline.orders} nLabel="orders">
                <Figure value={headline.measuredUsd} text={formatUsd(headline.measuredUsd)} format={USD_FORMAT} />
              </ValueState>
            </div>
            {headline.feesNotMeasured && headline.feesUsd !== null ? (
              <div>
                <p className="mb-1.5 text-[13px] text-ui-graphite">Fees at the published rate, not independently measured</p>
                <p className="text-[1.75rem] leading-9 font-semibold tracking-[-0.025em] tabular-nums text-ui-ink">
                  <Figure value={headline.feesUsd} text={formatUsd(headline.feesUsd)} format={USD_FORMAT} />
                </p>
              </div>
            ) : null}
          </div>
          {parts.length ? <StackBar parts={parts} height={12} /> : null}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <h2 id="headline" className="text-[1.375rem] font-semibold tracking-[-0.02em] text-ui-ink">What the orders paid in total</h2>
          <ValueState state="not-computed" label="Total cost" reason="The orders were not measured, so there is no dollar total." />
        </div>
      )}
    </Card>
  )
}

const EXCLUDED_WORDS: Array<[string, string]> = [['outsideModel', "outside the model's range"], ['partlyFilled', 'partly filled'], ['noExpectedCost', 'with no usable expected cost']]

function ExpectedCard({ c }: { c: CostVsExpected | undefined }) {
  const sentence = costSentence(c)
  const reason = costInsufficientReason(c)
  const left = c && !c.insufficient && c.excluded ? EXCLUDED_WORDS.filter(([k]) => (c.excluded![k] ?? 0) > 0).map(([k, w]) => `${c.excluded![k]} ${w}`) : []
  return (
    <Card title="Cost against expected" id="cost-vs-expected" className="lg:col-span-6" delay={0.1}
      info={c && !c.insufficient
        ? <>Market orders only. The expected cost is a fitted model, not an observed cost: the modelled cost of a taker event of the same size in the hour before the order (version {c.version}). The interval is a bootstrap over the account&rsquo;s orders; it leaves out the model&rsquo;s own error, which is wider.{left.length ? ` Left out: ${left.join(', ')}.` : ''}</>
        : <>Market orders only, compared with the modelled cost of an order of the same size in the hour before. A figure needs at least 20 market orders with a usable expected cost.</>}>
      {sentence && c && !c.insufficient ? (
        <div className="flex flex-1 flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div><p className="text-[12px] text-ui-graphite">Paid</p><p className="text-lg font-semibold tracking-[-0.015em] tabular-nums text-ui-ink">{formatSignedBps(c.paidBps)}</p></div>
            <div><p className="text-[12px] text-ui-graphite">Expected</p><p className="text-lg font-semibold tracking-[-0.015em] tabular-nums text-ui-ink">{formatSignedBps(c.expectedBps)}</p></div>
            <div><p className="text-[12px] text-ui-graphite">Difference</p>
              <ValueState state="measured" label="Difference" value={formatSignedBps(c.excessBps)} size="md" /></div>
          </div>
          <IntervalPlot diff={c.excessBps} low={c.lowBps} high={c.highBps}
            labels={{ diff: formatSignedBps(c.excessBps), low: formatSignedBps(c.lowBps), high: formatSignedBps(c.highBps), level: `${Math.round(c.level * 100)}%` }} />
          <p data-testid="cost-sentence" className="text-[13px] leading-5 text-ui-graphite">{sentence}</p>
        </div>
      ) : (
        <div data-testid="cost-sentence" className="flex flex-1 flex-col justify-center gap-2">
          <p className="text-[13px] text-ui-graphite">Cost against expected</p>
          <ValueState state="insufficient" label="Cost against expected" reason={reason ?? 'no figure was computed'} size="md" />
        </div>
      )}
    </Card>
  )
}

function OutcomesCard({ ordersBody }: { ordersBody: unknown }) {
  const b = ordersBody as OrdersBody | null
  const v = describeOrders(ordersBody)
  const o = b?.orders
  const parts: StackPart[] = o ? [
    { key: 'filled', label: 'Filled', value: o.filled, valueLabel: String(o.filled) },
    { key: 'partial', label: 'Partly filled', value: o.partial, valueLabel: String(o.partial) },
    { key: 'unfilled', label: 'Unfilled', value: o.unfilled, valueLabel: String(o.unfilled) },
    { key: 'open', label: 'Still open', value: o.open, valueLabel: String(o.open), stated: true },
  ] : []
  return (
    <Card title="Order outcomes" id="outcomes" testId="orders-panel" className="lg:col-span-6" delay={0.15}
      info={<>How each order ended, from the exchange&rsquo;s order records. Resting time is how long a limit order waited before its first fill.</>}>
      {!v || !o ? (
        <ValueState state="not-computed" label="Order outcomes" reason="No orders were recorded for these fills." />
      ) : (
        <div className="flex flex-1 flex-col gap-5">
          <p className="text-[1.375rem] font-semibold tracking-[-0.02em] text-ui-ink"><span className="sr-only">Orders </span>{o.total} <span className="text-[13px] font-normal tracking-normal text-ui-graphite">orders</span></p>
          <StackBar parts={parts} height={12} />
          {v.resting ? (
            <div data-testid="orders-resting" className="flex items-baseline justify-between gap-3 border-t border-ui-rule pt-3 text-[13px]">
              <span className="text-ui-graphite">Limit orders rested, {v.resting.n}</span>
              <span className="tabular-nums text-ui-ink">Median {v.resting.median}<span className="text-ui-graphite">, 90th percentile {v.resting.p90}</span></span>
            </div>
          ) : null}
          {v.unfilledNote ? <p className="text-[13px] text-ui-graphite" data-testid="orders-unfilled">{v.unfilledNote}</p> : null}
        </div>
      )}
    </Card>
  )
}

function MoneyCard({ ordersBody, isDemo }: { ordersBody: unknown; isDemo: boolean }) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const bars = barRows(ordersBody, isDemo)
  const v = describeOrders(ordersBody)
  return (
    <Card title={bars ? bars.title : 'Where the money went'} id="where-money-went" className="lg:col-span-12" delay={0.2}
      info={<>The terms of the implementation shortfall, in dollars and in basis points of the intended value. The medians are per order and do not add up to the median total.</>}
      aside={bars ? (
        <div role="group" aria-label="Show as" className="flex rounded-[8px] bg-ui-overlay p-0.5 text-[12px]">
          {(['chart', 'table'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}
              className={cn('rounded-[6px] px-2.5 py-1 transition-colors', view === k ? 'bg-ui-raised text-ui-ink shadow-ui' : 'text-ui-graphite hover:text-ui-ink')}>{k === 'chart' ? 'Chart' : 'Table'}</button>
          ))}
        </div>
      ) : undefined}>
      {!bars || !v ? (
        <ValueState state="not-computed" label="Cost by term" reason="The orders were not measured, so there is no cost by term." />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="sr-only">{bars.summary}</p>
            <div hidden={view !== 'chart'}><BarList rows={bars.rows} /></div>
            <div hidden={view !== 'table'} data-testid="orders-totals">
              {v.totals ? (
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Totals over the measured orders, in US dollars and basis points of the intended value</caption>
                  <thead className="text-ui-graphite"><tr><th scope="col" className="py-2 text-left font-medium">Term</th><th scope="col" className="text-right font-medium">USD</th><th scope="col" className="text-right font-medium">bps</th><th scope="col" className="hidden text-right font-medium sm:table-cell">Orders</th></tr></thead>
                  <tbody className="tabular-nums">
                    {v.totals.map((r) => (
                      <tr key={r.label} className="border-t border-ui-rule">
                        <th scope="row" className={cn('py-2 text-left', r.label === 'Total' ? 'font-semibold text-ui-ink' : 'font-normal text-ui-ink')}>{r.label}</th>
                        <td className="text-right text-ui-ink">{r.usd}</td><td className="text-right text-ui-graphite">{r.bps}</td><td className="hidden text-right text-ui-graphite sm:table-cell">{r.n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </div>
          {v.shortfall ? (
            <div data-testid="orders-shortfall" className="rounded-[12px] bg-ui-overlay/50 p-4 ring-1 ring-inset ring-ui-rule">
              <p className="mb-2 text-[13px] font-medium text-ui-ink">Median per order</p>
              <dl className="flex flex-col">
                {v.shortfall.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-4 border-t border-ui-rule py-1.5 text-[13px] first:border-t-0">
                    <dt className="text-ui-graphite">{label}</dt><dd className="tabular-nums text-ui-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {v.shortfallNote ? <p className="mt-2 text-[12px] text-ui-graphite">{v.shortfallNote}</p> : null}
            </div>
          ) : null}
        </div>
      )}
    </Card>
  )
}

function ProvenanceStrip({ facts, isDemo, freshness }: { facts: Array<[string, string]>; isDemo: boolean; freshness?: ReactNode }) {
  return (
    <m.section aria-label="What this audit covers" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 0.25 }}
      className="rounded-[14px] border border-dashed border-ui-rule px-5 py-4 lg:col-span-12">
      <dl data-testid="scope-facts" className="grid grid-cols-2 gap-x-8 gap-y-3 text-[13px] sm:grid-cols-3 lg:grid-cols-6">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0"><dt className="text-ui-graphite">{label}</dt><dd className="truncate font-medium tabular-nums text-ui-ink">{value}</dd></div>
        ))}
        <div className="min-w-0"><dt className="text-ui-graphite">Data</dt><dd className="font-medium text-ui-ink">{isDemo ? 'Synthetic trader, real prices' : 'Read with a read-only key'}</dd></div>
      </dl>
      {freshness ? <div className="mt-3 border-t border-ui-rule pt-3">{freshness}</div> : null}
    </m.section>
  )
}

/** The Overview of design v2: a bento of numbers and charts with one-line captions; explanation lives in hover cards. */
export function Overview(p: OverviewProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
      <GradeCard grade={p.grade} v1={p.v1} v1Note={p.v1Note} />
      <TotalCard headline={p.headline} ordersBody={p.ordersBody} isDemo={p.isDemo} />
      <ExpectedCard c={p.costVs} />
      <OutcomesCard ordersBody={p.ordersBody} />
      <MoneyCard ordersBody={p.ordersBody} isDemo={p.isDemo} />
      <ProvenanceStrip facts={p.facts} isDemo={p.isDemo} freshness={p.freshness} />
    </div>
  )
}

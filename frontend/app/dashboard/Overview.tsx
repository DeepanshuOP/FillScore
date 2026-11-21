'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { ValueState } from '../ui/ValueState'
import { GradeBadge } from '../ui/GradeBadge'
import { GradeStamp } from '../ui/GradeStamp'
import { Figure, SplitFigure, USD_FORMAT } from '../ui/Figure'
import { exactTitle, formatScore, formatSignedBps, formatUsd } from '../ui/format'
import { Fig } from '../ui/Fig'
import { CostRuler } from '../ui/charts/CostRuler'
import { costSentence, costInsufficientReason, unmeasuredNote, type GradeView, type Headline } from './headline'
import { describeOrders, describeTotals, hasTypeTotals, otherTypeOrders, totalsFor, type OrderKind, type OrdersBody } from './ordersView'
import { MonthTape } from './MonthTape'
import { fillsLine, orderCountsOf, type OrderRow } from './ordersTable'
import type { CostVsExpected } from './scoreV2'

type Request = (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; body: unknown }>

export interface OverviewProps {
  grade: GradeView | null
  /** The measured grade's band, [low, high], when served. */
  band?: [number, number] | null
  headline: Headline | null
  costVs: CostVsExpected | undefined
  ordersBody: unknown
  isDemo: boolean
  facts: Array<[string, string]>
  v1: { grade: string; score: number; basis?: string } | null
  v1Note: string | null
  freshness?: ReactNode
  period: { start: string; end: string }
  periodLabel: string
  /** For the month tape: the account query and the request helper of the dashboard. */
  query: string
  request: Request
  onOpenOrder: (row: OrderRow) => void
}

/** A printed section label: Departure Mono, small capitals by hand, graphite. */
const Label = ({ children, className }: { children: ReactNode; className?: string }) => (
  <p className={cn('font-mono text-[12px] tracking-[0.04em] text-ui-graphite uppercase', className)}>{children}</p>
)

/** The top of the overview: the period's total as the image, the sentence that states it, and the grade stamp. */
function Top({ headline, grade, band, v1, v1Note, periodLabel, isDemo }: Pick<OverviewProps, 'headline' | 'grade' | 'band' | 'v1' | 'v1Note' | 'periodLabel' | 'isDemo'>) {
  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
      <section data-testid="headline" aria-labelledby="headline" className="min-w-0 [container-type:inline-size]">
        <Label>What the orders paid, {periodLabel}</Label>
        {headline ? (
          <>
            {/* the figure fills its column at most: about 0.6 em per character in Cabinet Black, so a long total shrinks to fit */}
            <p aria-hidden="true" className="mt-3 -ml-[0.04em] leading-[0.8] font-black tracking-[-0.055em] whitespace-nowrap text-ui-ink"
              style={{ fontSize: `min(15rem, calc(100cqi / ${(formatUsd(headline.totalUsd).length * 0.6).toFixed(2)}))` }}>
              <SplitFigure value={headline.totalUsd} text={formatUsd(headline.totalUsd)} format={USD_FORMAT} />
            </p>
            <h2 id="headline" className="mt-7 max-w-[30ch] text-[clamp(1.25rem,1.9vw,1.625rem)] leading-snug font-bold tracking-[-0.02em] text-ui-ink">
              The {headline.orders.toLocaleString('en-US')} {headline.orders === 1 ? 'order' : 'orders'} paid{' '}
              <Figure value={headline.totalUsd} text={formatUsd(headline.totalUsd)} format={USD_FORMAT} /> in total.
            </h2>
            <p className="mt-1.5 max-w-[60ch] text-[15px] text-ui-graphite">
              The total is {formatSignedBps(headline.totalBps)} of the value ordered.
              {headline.unmeasuredOrders > 0 ? ` ${unmeasuredNote(headline.unmeasuredOrders)}` : ''}
            </p>
            <div className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <Label className="mb-1">{headline.feesNotMeasured ? 'Measured against market prices' : 'Measured'}</Label>
                <ValueState state="measured" label="Measured part of the total" value={formatUsd(headline.measuredUsd)} size="md" n={headline.orders} nLabel="orders">
                  <Figure value={headline.measuredUsd} text={formatUsd(headline.measuredUsd)} format={USD_FORMAT} />
                </ValueState>
              </div>
              {headline.feesNotMeasured && headline.feesUsd !== null ? (
                <div>
                  <Label className="mb-1">Fees at the published rate</Label>
                  <p className="text-[1.375rem] leading-7 font-bold tracking-[-0.02em] text-ui-ink">
                    <span className="border-b border-dashed border-ui-edge pb-px"><Figure value={headline.feesUsd} text={formatUsd(headline.feesUsd)} format={USD_FORMAT} /></span>
                  </p>
                  <p className="mt-1 text-[13px] text-ui-graphite">not independently measured{isDemo ? ': generated for the synthetic trader' : ''}</p>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <h2 id="headline" className="text-[1.625rem] font-bold tracking-[-0.02em] text-ui-ink">What the orders paid in total</h2>
            <ValueState state="not-computed" label="Total cost" reason="The orders were not measured, so there is no dollar total." />
          </div>
        )}
      </section>

      <section aria-labelledby="grade-t" className="flex flex-col items-center gap-5 max-lg:items-start max-lg:border-t max-lg:border-ui-ink max-lg:pt-4">
        <h2 id="grade-t" className="sr-only">Measured grade</h2>
        {grade?.kind === 'graded' ? (
          // design v3 fixes A10: below the desktop layout the stamp sits at the left margin, and its -7° turn swings the
          // top-left corner and outline 12 to 15 px left of its box; the inset keeps the whole stamp inside the margin
          <div className="py-4 max-lg:pl-5 lg:py-8"><GradeStamp grade={grade.letter} score={grade.score} period={periodLabel} version={grade.scoringVersion} className="max-sm:origin-left max-sm:scale-[0.72]" /></div>
        ) : grade ? (
          <ValueState state="insufficient" label="Measured grade" reason={grade.text} size="md" />
        ) : <div className="h-[230px] w-[280px]" aria-label="Loading the measured grade" />}
        {grade?.kind === 'graded' && band ? (
          <p className="max-w-[34ch] text-center text-[13px] leading-5 text-ui-graphite max-lg:text-left">
            Measured score, scoring {grade.scoringVersion}; band {formatScore(band[0])} to {formatScore(band[1])}.
          </p>
        ) : null}
        <div className="w-full border-t border-dashed border-ui-edge pt-3">
          {v1 ? (
            <div data-testid="score-v1-label"><GradeBadge grade={v1.grade} score={v1.score} version="v1" v1Basis={v1.basis} size="sm" /></div>
          ) : (
            <p data-testid="score-v1-label" className="text-[13px] text-ui-graphite">Rule-based score (v1): not computed for this data.</p>
          )}
          {v1Note ? <p data-testid="score-v1-demo-note" className="mt-1.5 text-[12px] leading-4 text-ui-graphite">{v1Note}</p> : null}
        </div>
      </section>
    </div>
  )
}

/** Where the money went, as receipt lines: each term with its dollars, basis points and orders, then the heavy total. */
function CostReceipt({ ordersBody, isDemo, headline }: { ordersBody: unknown; isDemo: boolean; headline: Headline | null }) {
  const v = describeOrders(ordersBody)
  // design v3 fixes B2: All / Market / Limit, each read from the server's totals (byType); nothing is added up here
  const [kind, setKind] = useState<OrderKind>('all')
  const typed = hasTypeTotals(ordersBody)
  const sel = totalsFor(ordersBody, typed ? kind : 'all')
  const t = describeTotals(sel)
  const shownTotal = kind === 'all' ? headline?.totalUsd : sel?.total?.usd
  return (
    <section aria-labelledby="where-money-went-t" id="where-money-went" className="grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="fs-receipt shadow-ui">
          <h2 id="where-money-went-t" className="fs-r-title !text-[1.5rem]">Where {typeof shownTotal === 'number' ? `the ${formatUsd(shownTotal)}` : 'the money'} went</h2>
          <p className="c g mt-1">{kind === 'all' ? 'COST BY TERM' : `${kind.toUpperCase()} ORDERS, COST BY TERM`}, IN USD AND BPS OF THE VALUE ORDERED</p>
          {typed ? (
            <div role="group" aria-label="Orders shown" className="mx-auto mt-3 flex w-fit gap-0.5 rounded-full border border-ui-edge p-[3px] font-ui text-[13px]">
              {([['all', 'All'], ['market', 'Market'], ['limit', 'Limit']] as const).map(([k, label]) => (
                <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                  className={cn('h-7 rounded-full px-3 font-medium', kind === k ? 'bg-ui-ink text-ui-surface' : 'text-ui-graphite hover:text-ui-ink')}>{label}</button>
              ))}
            </div>
          ) : null}
          {typed && otherTypeOrders(ordersBody) > 0 ? (
            <p className="c g mt-2 text-[11px]">{`${otherTypeOrders(ordersBody)} measured ${otherTypeOrders(ordersBody) === 1 ? 'order of another type is' : 'orders of other types are'} in All only.`}</p>
          ) : null}
          <hr />
          {kind !== 'all' && !t ? (
            <ValueState state="not-computed" label={`Cost by term, ${kind} orders`} reason={`no ${kind} order was measured`} />
          ) : t ? (
            // on a narrow phone with very large figures the lines scroll sideways inside the receipt rather than widen the page
            <div className="relative overflow-x-auto" role="region" aria-label="Cost by term" tabIndex={0}>
            <table data-testid="orders-totals" className="w-full border-collapse max-sm:text-[11.5px]">
              <caption className="sr-only">Totals over the measured orders, in US dollars and basis points of the intended value</caption>
              <thead><tr className="g text-[11px]"><th scope="col" className="pb-1 text-left font-normal">TERM</th><th scope="col" className="text-right font-normal">BPS</th><th scope="col" className="pl-3 text-right font-normal">USD</th><th scope="col" className="hidden pl-3 text-right font-normal sm:table-cell">ORDERS</th></tr></thead>
              <tbody>
                {t.rows.map((r, ri) => {
                  const ex = t.exact[ri]
                  const total = r.label === 'Total'
                  const stated = isDemo && r.label === 'Fees'
                  return (
                    <tr key={r.label} className={cn(total && 'border-t border-dashed border-ui-ink')}>
                      <th scope="row" className={cn('py-0.5 pr-2 text-left font-normal sm:w-full sm:max-w-0 sm:overflow-hidden sm:whitespace-nowrap', total ? 'pt-2 font-ui text-[18px] font-black' : '')}>
                        {r.label}{stated ? <span className="g">*</span> : null}
                        {total ? null : <span aria-hidden="true" className="text-ui-rule max-sm:hidden"> ..................................................</span>}
                      </th>
                      <td className={cn('pl-2 text-right whitespace-nowrap', total ? 'pt-2 font-ui text-[18px] font-bold text-ui-graphite' : 'text-ui-graphite')}><Fig text={r.bps} exact={ex?.bps} /></td>
                      <td className={cn('pl-3 text-right whitespace-nowrap', total ? 'pt-2 font-ui text-[2rem] leading-none font-black tracking-[-0.04em] max-sm:text-[1.5rem]' : '')}><Fig text={r.usd} exact={ex?.usd} /></td>
                      <td className="hidden pl-3 text-right whitespace-nowrap text-ui-graphite sm:table-cell">{total ? '' : r.n.split(' ')[0]}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          ) : <ValueState state="not-computed" label="Cost by term" reason="The orders were not measured, so there is no cost by term." />}
          {isDemo && t ? <p className="g mt-3 text-[11px]">* FEES AT THE PUBLISHED RATE, NOT INDEPENDENTLY MEASURED</p> : null}
        </div>
        <div aria-hidden="true" className="fs-torn-bottom" />
      </div>
      {v?.shortfall ? (
        <div data-testid="orders-shortfall" className="min-w-0 self-start">
          <h3 className="text-[1.125rem] font-bold tracking-[-0.02em] text-ui-ink">Median per order</h3>
          <dl className="mt-2 border-t border-ui-ink font-mono text-[13px]">
            {v.shortfall.map(([label, value], si) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-ui-rule py-1.5">
                <dt className="text-ui-graphite">{label}</dt><dd className="text-ui-ink"><Fig text={value} exact={v.shortfallExact?.[si]} /></dd>
              </div>
            ))}
          </dl>
          {v.shortfallNote ? <p className="mt-2 text-[13px] text-ui-graphite">{v.shortfallNote} The medians are per order and do not add up to the median total.</p> : null}
        </div>
      ) : null}
    </section>
  )
}

const EXCLUDED_WORDS: Array<[string, string]> = [['outsideModel', "outside the model's range"], ['partlyFilled', 'partly filled'], ['noExpectedCost', 'with no usable expected cost']]

/** Cost against expected: the paid dot, the expected point and the pen's bracket on one ruler; "insufficient data" otherwise. */
function Expected({ c }: { c: CostVsExpected | undefined }) {
  const sentence = costSentence(c)
  const reason = costInsufficientReason(c)
  const left = c && !c.insufficient && c.excluded ? EXCLUDED_WORDS.filter(([k]) => (c.excluded![k] ?? 0) > 0).map(([k, w]) => `${c.excluded![k]} ${w}`) : []
  return (
    <section aria-labelledby="cost-vs-expected-t" id="cost-vs-expected" className="panel min-w-0 pt-4">
      <h2 id="cost-vs-expected-t" className="text-[1.25rem] font-bold tracking-[-0.02em] text-ui-ink">Cost against expected</h2>
      <p className="mt-0.5 text-sm text-ui-graphite">Market orders against the modelled cost of an order of the same size in the hour before.</p>
      {sentence && c && !c.insufficient ? (
        <div className="mt-4 flex flex-col gap-3">
          <dl className="grid grid-cols-3 gap-3 font-mono text-[13px]">
            <div><dt className="text-ui-graphite">PAID</dt><dd className="font-ui text-[1.375rem] font-bold tracking-[-0.02em] text-ui-ink"><Fig text={formatSignedBps(c.paidBps)} exact={exactTitle(c.paidBps, 'bps')} /></dd></div>
            <div><dt className="text-ui-graphite">EXPECTED</dt><dd className="font-ui text-[1.375rem] font-bold tracking-[-0.02em] text-ui-ink"><Fig text={formatSignedBps(c.expectedBps)} exact={exactTitle(c.expectedBps, 'bps')} /></dd></div>
            <div><dt className="text-ui-graphite">DIFFERENCE</dt><dd className="font-ui"><ValueState state="measured" label="Difference" value={formatSignedBps(c.excessBps)} size="md" /></dd></div>
          </dl>
          <CostRuler diff={c.excessBps} low={c.lowBps} high={c.highBps} n={c.n}
            labels={{ diff: formatSignedBps(c.excessBps), low: formatSignedBps(c.lowBps), high: formatSignedBps(c.highBps), level: `${Math.round(c.level * 100)}%` }} />
          <p data-testid="cost-sentence" className="text-sm leading-5 text-ui-graphite">{sentence}</p>
          <p className="text-[13px] leading-5 text-ui-graphite">The expected cost is a fitted model (version {c.version}), not an observed cost; the interval leaves out the model&rsquo;s own error.{left.length ? ` Left out: ${left.join(', ')}.` : ''}</p>
        </div>
      ) : (
        <div data-testid="cost-sentence" className="mt-4 flex flex-col gap-2">
          <ValueState state="insufficient" label="Cost against expected" reason={reason ?? 'no figure was computed'} size="md" />
          <p className="text-[13px] text-ui-graphite">A figure needs at least 20 market orders with a usable expected cost.</p>
        </div>
      )}
    </section>
  )
}

const TALLY_CAP = 400

/** Order outcomes as a printed tally: one stroke per order (or per group of orders past 400), grouped by outcome. */
function Outcomes({ ordersBody }: { ordersBody: unknown }) {
  const b = ordersBody as OrdersBody | null
  const v = describeOrders(ordersBody)
  const o = b?.orders
  const counts = orderCountsOf(ordersBody)
  const groups = o ? ([['Filled', o.filled, 'solid'], ['Partly filled', o.partial, 'solid'], ['Unfilled', o.unfilled, 'pen'], ['Still open', o.open, 'dashed']] as const) : []
  const per = o ? Math.max(1, Math.ceil(o.total / TALLY_CAP)) : 1
  return (
    <section aria-labelledby="outcomes-t" id="outcomes" data-testid="orders-panel" className="panel min-w-0 pt-4">
      <h2 id="outcomes-t" className="text-[1.25rem] font-bold tracking-[-0.02em] text-ui-ink">Order outcomes</h2>
      <p className="mt-0.5 text-sm text-ui-graphite">How each order ended, from the exchange&rsquo;s order records.</p>
      {!v || !o ? (
        <div className="mt-4"><ValueState state="not-computed" label="Order outcomes" reason="No orders were recorded for these fills." /></div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-[2rem] leading-none font-black tracking-[-0.04em] text-ui-ink"><span className="sr-only">Orders </span>{(counts?.orders ?? o.total).toLocaleString('en-US')} <span className="text-sm font-normal tracking-normal text-ui-graphite">orders</span></p>
          {/* the same server counts the Orders ledger prints (backend orderCounts) */}
          {counts ? <p data-testid="orders-counts" className="-mt-2 text-[13px] text-ui-graphite">{fillsLine(counts)}</p> : null}
          <div aria-hidden="true" className="flex flex-wrap items-end gap-x-3 gap-y-2">
            {groups.filter(([, n]) => n > 0).map(([label, n, kind]) => (
              <span key={label} className="flex flex-wrap items-end gap-x-[2px] gap-y-1.5 [&>span]:h-6">
                {Array.from({ length: Math.ceil(n / per) }, (_, i) => (
                  <span key={i} className={cn('block w-[1.5px]', kind === 'pen' ? 'bg-ui-pen' : kind === 'dashed' ? 'border-l border-dashed border-ui-ink' : 'bg-ui-ink', (i + 1) % 5 === 0 && 'mr-[3px]')} />
                ))}
              </span>
            ))}
          </div>
          {per > 1 ? <p className="font-mono text-[11px] text-ui-graphite">ONE STROKE = {per} ORDERS</p> : null}
          <dl className="border-t border-ui-ink font-mono text-[13px]">
            {groups.map(([label, n, kind]) => (
              <div key={label} className="flex items-baseline justify-between gap-4 border-b border-dashed border-ui-rule py-1.5">
                <dt className="text-ui-graphite">{label}</dt>
                <dd className={kind === 'pen' && n > 0 ? 'text-ui-pen-ink' : 'text-ui-ink'}>{n}</dd>
              </div>
            ))}
          </dl>
          {v.resting ? (
            <p data-testid="orders-resting" className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
              <span className="text-ui-graphite">Limit orders rested, {v.resting.n}</span>
              <span className="font-mono text-ui-ink">Median {v.resting.median}<span className="text-ui-graphite">, 90th percentile {v.resting.p90}</span></span>
            </p>
          ) : null}
          {v.unfilledNote ? <p className="text-[13px] text-ui-graphite" data-testid="orders-unfilled">{v.unfilledNote}</p> : null}
        </div>
      )}
    </section>
  )
}

/** Data freshness and provenance, printed as one footer line. */
function FooterLine({ facts, isDemo, freshness }: { facts: Array<[string, string]>; isDemo: boolean; freshness?: ReactNode }) {
  return (
    <section aria-label="What this audit covers" className="border-t border-ui-ink pt-3">
      <dl data-testid="scope-facts" className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[12px]">
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-2"><dt className="font-mono text-ui-graphite uppercase">{label}</dt><dd className="text-ui-ink">{value}</dd></div>
        ))}
        <div className="flex gap-2"><dt className="text-ui-graphite">DATA</dt><dd className="text-ui-ink">{isDemo ? 'Synthetic trader, real prices' : 'Read with a read-only key'}</dd></div>
      </dl>
      {freshness ? <div className="mt-3 border-t border-dashed border-ui-rule pt-3">{freshness}</div> : null}
    </section>
  )
}

/** The Overview of design v3 "Tape & Receipt": the total as the image, the stamp, the month tape, the receipt, then the ruler and the tally. */
export function Overview(p: OverviewProps) {
  return (
    <div className="flex flex-col gap-12 lg:gap-14">
      <Top headline={p.headline} grade={p.grade} band={p.band} v1={p.v1} v1Note={p.v1Note} periodLabel={p.periodLabel} isDemo={p.isDemo} />
      <MonthTape query={p.query} request={p.request} period={p.period} periodLabel={p.periodLabel} onOpen={p.onOpenOrder} />
      <CostReceipt ordersBody={p.ordersBody} isDemo={p.isDemo} headline={p.headline} />
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-10">
        <Expected c={p.costVs} />
        <Outcomes ordersBody={p.ordersBody} />
      </div>
      <FooterLine facts={p.facts} isDemo={p.isDemo} freshness={p.freshness} />
    </div>
  )
}

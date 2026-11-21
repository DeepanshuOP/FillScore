'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { cn } from '../../lib/utils'
import { ValueState } from '../ui/ValueState'
import { GradeStamp } from '../ui/GradeStamp'
import { MarginNote } from '../ui/MarginNote'
import { Figure, SplitFigure, USD_FORMAT } from '../ui/Figure'
import { exactTitle, formatScore, formatSignedBps, formatUsd } from '../ui/format'
import { Fig } from '../ui/Fig'
import { CostRuler } from '../ui/charts/CostRuler'
import { costSentence, costInsufficientReason, unmeasuredNote, type GradeView, type Headline } from './headline'
import { describeOrders, describeTotals, hasTypeTotals, otherTypeOrders, totalsFor, type OrderKind, type OrdersBody } from './ordersView'
import { describeStrip } from './costStrip'
import { MonthTape } from './MonthTape'
import { fillsLine, orderCountsOf, type OrderRow } from './ordersTable'
import { Chapter, useEntry } from './chapter'
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
  /** A demo account's sample-data note (DESIGN.md invariant 4): printed as one slim line, the note behind a pen mark. */
  sampleNote?: string | null
  facts: Array<[string, string]>
  v1: { grade: string; score: number; basis?: string } | null
  v1Note: string | null
  freshness?: ReactNode
  period: { start: string; end: string }
  periodLabel: string
  /** For the month tape: the account query and the request helper of the dashboard. */
  query: string
  request: Request
  /** A bar of the month tape was chosen: open its receipt; `origin` is the bar's rectangle (the shared-element transition). */
  onOpenOrder: (row: OrderRow, origin: DOMRect | null) => void
}

/** Chapter 1: the period's total as the image, one sentence, and the sample-data line (always visible on a demo). */
function Total({ headline, periodLabel, sampleNote }: Pick<OverviewProps, 'headline' | 'periodLabel' | 'sampleNote'>) {
  return (
    <Chapter n={1} label="Total" title={`What the orders paid, ${periodLabel}`} id="total" testId="headline" className="border-t-0 pt-0">
      {sampleNote ? (
        <p data-testid="sample-line" className="mb-8 font-mono text-[13px] tracking-[0.04em] text-ui-ink uppercase">
          <span>Sample data: synthetic trader, real prices</span>
          <MarginNote label="sample data">
            <p>{sampleNote}</p>
            <p><Link href="/signup" className="text-ui-ink underline underline-offset-2">Connect your exchange</Link> to audit your own orders.</p>
          </MarginNote>
        </p>
      ) : null}
      {headline ? (
        <div className="[container-type:inline-size]">
          {/* the figure fills its column at most: about 0.6 em per character in Cabinet Black, so a long total shrinks to fit */}
          <p aria-hidden="true" className="-ml-[0.04em] leading-[0.8] font-black tracking-[-0.055em] whitespace-nowrap text-ui-ink"
            style={{ fontSize: `min(15rem, calc(100cqi / ${(formatUsd(headline.totalUsd).length * 0.6).toFixed(2)}))` }}>
            <SplitFigure value={headline.totalUsd} text={formatUsd(headline.totalUsd)} format={USD_FORMAT} />
          </p>
          <p className="mt-7 text-[clamp(1.25rem,1.9vw,1.625rem)] leading-snug font-bold tracking-[-0.02em] text-ui-ink">
            <span>The {headline.orders.toLocaleString('en-US')} {headline.orders === 1 ? 'order' : 'orders'} paid{' '}
              <Figure value={headline.totalUsd} text={formatUsd(headline.totalUsd)} format={USD_FORMAT} /> in total.</span>
            <MarginNote label="the total in basis points">
              <p data-testid="total-bps">The total is {formatSignedBps(headline.totalBps)} of the value ordered.</p>
              <p>Implementation shortfall: spread, impact and timing, unfilled orders and fees, against the market at each order&rsquo;s arrival.</p>
            </MarginNote>
          </p>
          {headline.unmeasuredOrders > 0 ? <p data-testid="unmeasured-line" className="mt-1.5 text-[16px] text-ui-graphite">{unmeasuredNote(headline.unmeasuredOrders)}</p> : null}
        </div>
      ) : (
        <ValueState state="not-computed" label="Total cost" reason="The orders were not measured, so there is no dollar total." />
      )}
    </Chapter>
  )
}

/** The stamp's two outlines (border and outer ring) as strokes, for the first-entry draw. Geometry follows paper.css. */
function StampInk({ big }: { big: boolean }) {
  const b = big ? 4 : 3, r = big ? 18 : 12, o = big ? 4 : 3
  return (
    <svg className="fs-stamp-ink" aria-hidden="true">
      <rect data-ink="" x={b / 2} y={b / 2} rx={r - b / 2} strokeWidth={b} style={{ width: `calc(100% - ${b}px)`, height: `calc(100% - ${b}px)` }} />
      <rect data-ink="" x={-(o + 0.75)} y={-(o + 0.75)} rx={r + o} strokeWidth={1.5} style={{ width: `calc(100% + ${2 * o + 1.5}px)`, height: `calc(100% + ${2 * o + 1.5}px)` }} />
    </svg>
  )
}

/** Chapter 2: the stamp, pressed once on the chapter's first entry, its border drawn by the pen (DrawSVG). */
function Grade({ grade, band, v1, v1Note, periodLabel, account }: Pick<OverviewProps, 'grade' | 'band' | 'v1' | 'v1Note' | 'periodLabel'> & { account: string }) {
  const [ref, play] = useEntry<HTMLDivElement>(`${account}:grade`)
  const [drawing, setDrawing] = useState(false)
  useEffect(() => {
    if (!play) return
    const root = ref.current
    if (!root) return
    let dead = false, kill = () => {}
    setDrawing(true)
    void Promise.all([import('gsap'), import('gsap/DrawSVGPlugin')]).then(([{ gsap }, { DrawSVGPlugin }]) => {
      if (dead) return
      gsap.registerPlugin(DrawSVGPlugin)
      const tw = gsap.fromTo(root.querySelectorAll('[data-ink]'), { drawSVG: '0%' }, {
        drawSVG: '100%', duration: 0.36, delay: 0.12, stagger: 0.08, ease: 'power3.out', onComplete: () => { if (!dead) setDrawing(false) },
      })
      kill = () => tw.kill()
    }).catch(() => setDrawing(false))
    return () => { dead = true; kill(); setDrawing(false) }
  }, [play, ref])
  return (
    <Chapter n={2} label="Grade" title="Measured grade" id="grade">
      <div ref={ref} className="flex flex-col items-start gap-6 pt-6 sm:flex-row sm:items-center sm:gap-12">
        {grade?.kind === 'graded' ? (
          // below the desktop layout the stamp's -7° turn swings its top-left corner past its box (design v3 fixes A10)
          <div className="py-4 pl-5 sm:pl-2">
            <GradeStamp grade={grade.letter} score={grade.score} period={periodLabel} version={grade.scoringVersion} press={play} drawing={drawing}
              // scaled to 72% from its left edge on a phone; the negative margin gives back the 28% its box would still take
              className="max-sm:origin-left max-sm:scale-[0.72] max-sm:-mr-20"><StampInk big /></GradeStamp>
          </div>
        ) : grade ? (
          <ValueState state="insufficient" label="Measured grade" reason={grade.text} size="md" />
        ) : <div className="h-[230px] w-[280px]" aria-label="Loading the measured grade" />}
        <div className="flex max-w-[34ch] flex-col gap-3">
          {grade?.kind === 'graded' ? (
            <p className="text-[20px] leading-snug font-bold tracking-[-0.02em] text-ui-ink">
              <span>Graded {grade.letter}, {formatScore(grade.score)} of 100.</span>
              <MarginNote label="the measured score">
                <p>Measured score, scoring {grade.scoringVersion}{band ? `; band ${formatScore(band[0])} to ${formatScore(band[1])}` : ''}.</p>
                <p>Each order&rsquo;s execution cost, fees and unfilled orders, scored under the committed version file.</p>
              </MarginNote>
            </p>
          ) : null}
          <p data-testid="score-v1-label" className="text-[16px] text-ui-graphite">
            {/* design v3.1 review: the visible line says it is the frozen v1 grade, so A beside B reads as two scorings */}
            {v1 ? <span>Rule-based score, grade {v1.grade} (v1, frozen)</span> : <span>Rule-based score (v1): not computed for this data.</span>}
            {v1 ? (
              <MarginNote label="the rule-based score">
                <p data-testid="score-v1-detail">{formatScore(v1.score)} of 100, {v1.basis ?? 'published grade of the earlier demo data, scoring v1'}.</p>
                {v1Note ? <p data-testid="score-v1-demo-note">{v1Note}</p> : null}
                <p>Scoring v1 is frozen: its weights and its published grades do not change.</p>
              </MarginNote>
            ) : null}
          </p>
        </div>
      </div>
    </Chapter>
  )
}

/** The full receipt of terms, the All / Market / Limit switch and the medians (design v3 fixes B2), unchanged, inside the fold. */
function CostLines({ ordersBody, isDemo, headline }: { ordersBody: unknown; isDemo: boolean; headline: Headline | null }) {
  const v = describeOrders(ordersBody)
  const [kind, setKind] = useState<OrderKind>('all')
  const typed = hasTypeTotals(ordersBody)
  const sel = totalsFor(ordersBody, typed ? kind : 'all')
  const t = describeTotals(sel)
  const shownTotal = kind === 'all' ? headline?.totalUsd : sel?.total?.usd
  return (
    <div className="grid gap-x-10 gap-y-8 pt-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <div className="fs-receipt shadow-ui">
          <p className="fs-r-title !text-[1.5rem]">Where {typeof shownTotal === 'number' ? `the ${formatUsd(shownTotal)}` : 'the money'} went</p>
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
          <p className="text-[1.125rem] font-bold tracking-[-0.02em] text-ui-ink">Median per order</p>
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
    </div>
  )
}

/**
 * A printed fold: a mono label button with aria-expanded; the content stays in the document (hidden while closed), so
 * nothing is computed on open. No open/close animation: a fold is used often (Emil's frequency rule).
 */
export function Fold({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-2 border-b border-dashed border-ui-edge pb-0.5 font-mono text-[13px] tracking-[0.04em] text-ui-ink uppercase">
        <span aria-hidden="true" className="inline-block w-3 text-center">{open ? '−' : '+'}</span>{label}
      </button>
      <div hidden={!open}>{children}</div>
    </div>
  )
}

/** Chapter 3: one torn receipt strip; each part's width is the server's share; fees at the published rate are dashed. */
function WhereItWent({ ordersBody, isDemo, headline, account }: { ordersBody: unknown; isDemo: boolean; headline: Headline | null; account: string }) {
  const strip = describeStrip(ordersBody, !!headline?.feesNotMeasured)
  const [ref, play] = useEntry<HTMLDivElement>(`${account}:strip`)
  return (
    <Chapter n={3} label="Where it went" title="Where the money went" id="where-money-went">
      {strip ? (
        <div ref={ref}>
          <p className="text-[20px] leading-snug font-bold tracking-[-0.02em] text-ui-ink">{strip.sentence}</p>
          <div className="fs-cost-strip mt-5" data-play={play} data-testid="cost-strip">
            <div className="fs-cost-strip-paper" role="img"
              aria-label={strip.parts.map((p) => `${p.label} ${p.amount}${p.dashed ? ', not independently measured' : ''}`).join('; ')}>
              {strip.parts.filter((p) => p.drawn).map((p) => (
                <span key={p.key} className="fs-seg" data-key={p.key} data-dashed={p.dashed} style={{ width: p.width }} />
              ))}
            </div>
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-12 gap-y-3">
            {strip.parts.map((p) => (
              <li key={p.key} className="flex items-start gap-2.5">
                <span aria-hidden="true" className="fs-seg-key mt-1.5" data-key={p.key} data-dashed={p.dashed} />
                <div>
                  <p className="text-[16px] text-ui-ink">{p.label}{p.drawn ? '' : p.usd < 0 ? ' (a price improvement)' : ''}</p>
                  <p className="flex items-center gap-1.5 font-mono text-[22px] text-ui-ink">
                    {p.amount}
                    {p.dashed ? (
                      <MarginNote label="fees at the published rate">
                        <p>Not independently measured: the synthetic trader&rsquo;s fees were generated at the exchange&rsquo;s published rate, which no market data checks.</p>
                      </MarginNote>
                    ) : null}
                  </p>
                  {p.dashed ? <p className="text-[13px] text-ui-graphite">not independently measured</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : <ValueState state="not-computed" label="Where the money went" reason="The orders were not measured, so there is no cost to split." />}
      <div className="mt-8">
        <Fold label="Lines" testId="cost-lines"><CostLines ordersBody={ordersBody} isDemo={isDemo} headline={headline} /></Fold>
      </div>
    </Chapter>
  )
}

const EXCLUDED_WORDS: Array<[string, string]> = [['outsideModel', "outside the model's range"], ['partlyFilled', 'partly filled'], ['noExpectedCost', 'with no usable expected cost']]

/** Chapter 5, left: cost against expected on the ruler, one sentence; the interval, the model and the left-out orders in a note. */
function Expected({ c, account }: { c: CostVsExpected | undefined; account: string }) {
  const sentence = costSentence(c)
  const reason = costInsufficientReason(c)
  const left = c && !c.insufficient && c.excluded ? EXCLUDED_WORDS.filter(([k]) => (c.excluded![k] ?? 0) > 0).map(([k, w]) => `${c.excluded![k]} ${w}`) : []
  const [ref, play] = useEntry<HTMLDivElement>(`${account}:ruler`)
  return (
    <section aria-labelledby="cost-vs-expected-t" id="cost-vs-expected" className="min-w-0">
      <h3 id="cost-vs-expected-t" className="sr-only">Cost against expected</h3>
      {sentence && c && !c.insufficient ? (
        <div ref={ref} className="flex flex-col gap-3">
          <p className="text-[20px] leading-snug font-bold tracking-[-0.02em] text-ui-ink">
            <span>Market orders paid <Fig text={formatSignedBps(c.paidBps)} exact={exactTitle(c.paidBps, 'bps')} /> against <Fig text={formatSignedBps(c.expectedBps)} exact={exactTitle(c.expectedBps, 'bps')} /> expected.</span>
            <MarginNote label="cost against expected">
              <p data-testid="cost-sentence">{sentence}</p>
              <p>The expected cost is a fitted model (version {c.version}), not an observed cost; the interval leaves out the model&rsquo;s own error.{left.length ? ` Left out: ${left.join(', ')}.` : ''}</p>
            </MarginNote>
          </p>
          <CostRuler diff={c.excessBps} low={c.lowBps} high={c.highBps} n={c.n} draw={play}
            labels={{ diff: formatSignedBps(c.excessBps), low: formatSignedBps(c.lowBps), high: formatSignedBps(c.highBps), level: `${Math.round(c.level * 100)}%` }} />
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span data-testid="cost-sentence"><ValueState state="insufficient" label="Cost against expected" reason={reason ?? 'no figure was computed'} size="md" /></span>
          <MarginNote label="cost against expected"><p>A figure needs at least 20 market orders with a usable expected cost.</p></MarginNote>
        </div>
      )}
    </section>
  )
}

const TALLY_CAP = 400

/** Chapter 5, right: order outcomes as a printed tally, each group's word and count under its strokes. */
function Outcomes({ ordersBody }: { ordersBody: unknown }) {
  const b = ordersBody as OrdersBody | null
  const v = describeOrders(ordersBody)
  const o = b?.orders
  const counts = orderCountsOf(ordersBody)
  const groups = o ? ([['Filled', o.filled, 'solid'], ['Partly filled', o.partial, 'solid'], ['Unfilled', o.unfilled, 'pen'], ['Still open', o.open, 'dashed']] as const) : []
  const per = o ? Math.max(1, Math.ceil(o.total / TALLY_CAP)) : 1
  return (
    <section aria-labelledby="outcomes-t" id="outcomes" data-testid="orders-panel" className="min-w-0">
      <h3 id="outcomes-t" className="sr-only">Order outcomes</h3>
      {!v || !o ? (
        <ValueState state="not-computed" label="Order outcomes" reason="No orders were recorded for these fills." />
      ) : (
        <div className="flex flex-col gap-4">
          {/* demoted (design v3.1 review): the ruler carries chapter 05; the outcomes are its second, quieter line */}
          <p className="text-[16px] text-ui-graphite">
            <span>How the {(counts?.orders ?? o.total).toLocaleString('en-US')} orders ended</span>
            <MarginNote label="order outcomes">
              {counts ? <p data-testid="orders-counts">{fillsLine(counts)}</p> : null}
              <p>How each order ended, from the exchange&rsquo;s order records.{per > 1 ? ` One stroke stands for ${per} orders.` : ''}</p>
            </MarginNote>
          </p>
          <dl className="flex flex-wrap items-end gap-x-6 gap-y-4">
            {groups.filter(([, n]) => n > 0).map(([label, n, kind]) => (
              <div key={label} className="flex flex-col-reverse gap-1.5">
                <dt className="font-mono text-[13px] text-ui-graphite uppercase">{label} <span className={kind === 'pen' ? 'text-ui-pen-ink' : 'text-ui-ink'}>{n}</span></dt>
                <dd aria-hidden="true" className="flex max-w-[280px] flex-wrap items-end gap-x-[2px] gap-y-1.5 [&>span]:h-6">
                  {Array.from({ length: Math.ceil(n / per) }, (_, i) => (
                    <span key={i} className={cn('block w-[1.5px]', kind === 'pen' ? 'bg-ui-pen' : kind === 'dashed' ? 'border-l border-dashed border-ui-ink' : 'bg-ui-ink', (i + 1) % 5 === 0 && 'mr-[3px]')} />
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <Fold label="Timing and unfilled orders">
            <div className="flex flex-col gap-2 pt-3">
              {v.resting ? (
                <p data-testid="orders-resting" className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                  <span className="text-ui-graphite">Limit orders rested, {v.resting.n}</span>
                  <span className="font-mono text-ui-ink">Median {v.resting.median}<span className="text-ui-graphite">, 90th percentile {v.resting.p90}</span></span>
                </p>
              ) : null}
              {v.unfilledNote ? <p className="text-[13px] text-ui-graphite" data-testid="orders-unfilled">{v.unfilledNote}</p> : null}
            </div>
          </Fold>
        </div>
      )}
    </section>
  )
}

/** The facts of the audit as one printed spec table (A24's DIRECTED BY / YEAR), and the data freshness. */
function Facts({ facts, isDemo, freshness }: { facts: Array<[string, string]>; isDemo: boolean; freshness?: ReactNode }) {
  return (
    <section aria-label="What this audit covers" className="border-t border-ui-ink pt-3">
      <dl data-testid="scope-facts" className="grid max-w-3xl grid-cols-1 font-mono text-[13px] sm:grid-cols-2 sm:gap-x-10">
        {[...facts, ['Data', isDemo ? 'Synthetic trader, real prices' : 'Read with a read-only key'] as [string, string]].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-dashed border-ui-rule py-1.5">
            <dt className="font-mono text-ui-graphite uppercase">{label}</dt><dd className="text-right text-ui-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {freshness ? <div className="mt-3 border-t border-dashed border-ui-rule pt-3">{freshness}</div> : null}
    </section>
  )
}

/**
 * The Overview of design v3.1 "Quiet audit": five chapters, each one visual and one sentence, the explanations behind
 * pen margin notes and printed folds (docs/design/v31-plan.md).
 */
export function Overview(p: OverviewProps) {
  // the shared-element transition into the receipt uses GSAP Flip: fetch it while the reader looks at the chapters
  useEffect(() => { if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) void import('gsap/Flip').catch(() => {}) }, [])
  const account = p.query || 'me'
  return (
    <div className="flex flex-col gap-16 lg:gap-24">
      <Total headline={p.headline} periodLabel={p.periodLabel} sampleNote={p.sampleNote} />
      <Grade grade={p.grade} band={p.band} v1={p.v1} v1Note={p.v1Note} periodLabel={p.periodLabel} account={account} />
      <WhereItWent ordersBody={p.ordersBody} isDemo={p.isDemo} headline={p.headline} account={account} />
      <Chapter n={4} label="The month" title={`${p.periodLabel}, order by order`} id="month">
        <MonthTape query={p.query} request={p.request} period={p.period} periodLabel={p.periodLabel} onOpen={p.onOpenOrder} account={account} />
      </Chapter>
      <Chapter n={5} label="Against expected" title="Cost against expected, and how the orders ended" id="expected">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16">
          <Expected c={p.costVs} account={account} />
          <Outcomes ordersBody={p.ordersBody} />
        </div>
      </Chapter>
      <Facts facts={p.facts} isDemo={p.isDemo} freshness={p.freshness} />
    </div>
  )
}

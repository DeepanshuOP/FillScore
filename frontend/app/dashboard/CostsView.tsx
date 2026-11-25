'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import { Card, GradeRange } from '../ui/blocks'
import { GradeStamp } from '../ui/GradeStamp'
import { EmptyState } from '../ui/EmptyState'
import { ConnectAction } from '../components/ConnectPrompt'
import { bps, count, money } from '../lib/format'
import type { GradeView, Headline } from './headline'
import { describeStrip } from './costStrip'
import { CostBreakdown } from '../ui/blocks'
import { CostliestOrders } from './CostliestOrders'
import { KpiTiles } from './KpiTiles'
import { BPS_GLOSS, costEstimateView } from './costsView'
import type { CostVsExpected } from './scoreV2'
import type { OrderRow } from './ordersTable'

const TypeBars = dynamic(() => import('../ui/charts/AppCharts').then((m) => m.TypeBars), { ssr: false, loading: () => <div className="h-[260px]" aria-hidden="true" /> })

type Json = { status: number; body: unknown }
interface Term { usd: number }
interface ByType { total?: { n?: number } | null; execution?: Term | null; opportunity?: Term | null; fees?: Term | null }

/** The order-type totals the server serves (`byType.market`, `byType.limit`); a type with no orders is left out. */
function typeRows(ordersBody: unknown) {
  const bt = (ordersBody as { byType?: Record<string, ByType | undefined> } | null)?.byType
  if (!bt) return []
  return (['market', 'limit'] as const).flatMap((k) => {
    const t = bt[k]
    const n = t?.total?.n ?? 0
    if (!t || !n || !t.execution || !t.opportunity || !t.fees) return []
    return [{ type: k === 'market' ? 'Market orders' : 'Limit orders', execution: t.execution.usd, unfilled: t.opportunity.usd, fees: t.fees.usd, orders: n }]
  })
}

export interface CostsProps {
  headline: Headline | null
  ordersBody: unknown
  grade: GradeView | null
  band: [number, number] | null
  costVs: CostVsExpected | undefined
  /** The locked rule-based grade (scoring v1), printed beside the measured one so a reader never meets two letters unexplained (I4). */
  v1: { grade: string | null | undefined; score: number | null | undefined }
  isDemo: boolean
  facts: Array<[string, string]>
  freshness?: ReactNode
  periodLabel: string
  query: string
  request: (path: string) => Promise<Json>
  onOpenOrder: (row: OrderRow, origin: DOMRect | null) => void
}

/**
 * Costs (design v5, PROPOSAL §5; was Overview): tiles, where the cost came from, the costliest orders, the cost by order type, the
 * grade, the cost against the model's estimate, and what the page covers. Every figure is a served value formatted by a view model.
 */
export function CostsView(p: CostsProps) {
  const strip = describeStrip(p.ordersBody, p.headline?.feesNotMeasured ?? false)
  const rows = typeRows(p.ordersBody)
  const est = costEstimateView(p.costVs)
  const g = p.grade
  return (
    <div className="flex flex-col gap-4" data-testid="costs-view">
      <KpiTiles headline={p.headline} ordersBody={p.ordersBody} grade={p.grade} band={p.band} />
      {strip ? (
        <Card title="Where the cost came from" sentence="The three parts add up to the total." id="where" testid="where-cost-came-from"
          info="Fees: what the exchange charged. Unfilled orders (modelled): the modelled cost of the market moving away from orders that never filled; nobody paid it. Execution: filled orders against the market price at arrival."
          source={p.isDemo ? 'Your orders, measured against Binance public trades. Fees are at the published rate, not independently measured.' : 'Your orders, measured against Binance public trades.'}>
          <CostBreakdown view={strip} />
        </Card>
      ) : (
        <Card title="Where the cost came from" id="where"><EmptyState title="Not measured yet" action={p.isDemo ? undefined : <ConnectAction />}>The cost of each order appears after the orders are synced and measured against public trades.</EmptyState></Card>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <CostliestOrders request={p.request} query={p.query} onOpenOrder={p.onOpenOrder} />
        <Card title="By order type" sentence="Market and limit orders, each in the same three parts." id="type" source={p.isDemo ? 'Your orders, measured against Binance public trades. Fees are at the published rate, not independently measured.' : 'Your orders, measured against Binance public trades.'}>
          {rows.length ? (
            <>
              <TypeBars rows={rows} />
              <table className="w-full border-collapse text-[13px] text-ui-ink">
                <caption className="sr-only">The same values as the chart</caption>
                <thead><tr className="text-left text-ui-graphite"><th className="py-1.5 pr-2 font-medium">Type</th><th className="py-1.5 pr-2 text-right font-medium">Orders</th><th className="py-1.5 pr-2 text-right font-medium">{p.isDemo ? 'Fees (published rate)' : 'Fees'}</th><th className="py-1.5 pr-2 text-right font-medium">Unfilled (modelled)</th><th className="py-1.5 text-right font-medium">Execution</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.type} className="border-t border-ui-rule"><td className="py-1.5 pr-2">{r.type}</td><td className="py-1.5 pr-2 text-right tabular-nums">{r.orders}</td><td className="py-1.5 pr-2 text-right tabular-nums">{money(r.fees)}</td><td className="py-1.5 pr-2 text-right tabular-nums">{money(r.unfilled)}</td><td className="py-1.5 text-right tabular-nums">{money(r.execution)}</td></tr>)}</tbody>
              </table>
            </>
          ) : <p className="text-[14px] text-ui-graphite">Insufficient data: the server sent no totals by order type for this account.</p>}
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="Execution grade" id="grade" testid="grade-card"
          sentence={g?.kind === 'graded' ? `Graded ${g.letter}, ${g.score.toFixed(1)} of 100.` : (g?.text ?? 'Not computed yet.')}
          source={g?.kind === 'graded' ? `Score version ${g.scoringVersion.replace(/^v/, '')}.` : undefined}>
          {g?.kind === 'graded' ? (
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <GradeStamp grade={g.letter} score={g.score} period={p.periodLabel} version={g.scoringVersion} size="lg" />
              <div className="w-full min-w-0 flex-1">
                {p.band ? <><GradeRange score={g.score} band={p.band} /><p className="mt-2 text-[14px] text-ui-graphite">Range from the measurement: {p.band[0].toFixed(1)} to {p.band[1].toFixed(1)}.</p></> : null}
                {p.v1.grade && typeof p.v1.score === 'number'
                  ? <p className="mt-2 text-[14px] text-ui-graphite" data-testid="v1-grade">Earlier rule-based grade (scoring v1, published and locked): {p.v1.grade}, {p.v1.score.toFixed(1)} of 100. The two scores measure different things; neither replaces the other.</p> : null}
              </div>
            </div>
          ) : <EmptyState title="No grade yet" action={p.isDemo ? undefined : <ConnectAction />}>The measured grade is computed after the orders are synced and measured.</EmptyState>}
        </Card>
        <Card title="Against the cost estimate" id="estimate" testid="cost-estimate"
          info="The estimate is what market orders of that size usually cost in the same hour, from a square-root model fitted to public trades. It is an estimate, not a promise."
          sentence="Market orders, paid against the model's estimate."
          source="Your market orders, measured against Binance public trades.">
          {est.kind === 'state' ? <p className="text-[14px] text-ui-ink" data-testid="cost-estimate-state">{est.text}</p> : (
            <dl className="grid grid-cols-2 gap-3">
              <div><dt className="text-[13px] text-ui-graphite">Paid</dt><dd className="kpi-figure text-[22px]">{est.paid}</dd></div>
              <div><dt className="text-[13px] text-ui-graphite">Cost estimate</dt><dd className="kpi-figure text-[22px]">{est.estimate}</dd></div>
              <div className="col-span-2 text-[14px] text-ui-graphite">Difference {est.difference}, {est.interval}, {est.orders}.</div>
            </dl>
          )}
        </Card>
      </div>
      <Card title="What this covers" id="scope" testid="scope-facts">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[14px] sm:grid-cols-4">
          {p.facts.map(([k, v]) => <div key={k}><dt className="text-[13px] text-ui-graphite">{k}</dt><dd className="text-ui-ink">{v}</dd></div>)}
        </dl>
        {p.headline && bps(p.headline.totalBps) ? <p className="text-[14px] text-ui-graphite">{count(p.headline.orders, 'order')} in the total, {bps(p.headline.totalBps)} of their value.</p> : null}
        <p className="text-[14px] text-ui-graphite">{BPS_GLOSS}</p>
        {p.freshness}
      </Card>
    </div>
  )
}

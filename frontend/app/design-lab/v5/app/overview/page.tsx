import { Download } from 'lucide-react'
import { GradeStamp } from '../../../../ui/GradeStamp'
import { loadAccount } from '../../lib/data'
import { bps, count, money, share } from '../../lib/format'
import { ordersSentence, pageValues } from '../../lib/view'
import { Card, CostBreakdown, GradeRange, Tile } from '../../components/Blocks'
import { OrderCostChart, TypeBars } from '../../components/Charts'
import { DemoBanner, PageHeader, PeriodPicker } from '../../components/PageHeader'

/** Costs (was Overview; PROPOSAL §5). Route kept as /overview so the audit script measures the same address. */
export default async function V5Costs({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const a = loadAccount((await searchParams).userId)
  const v = pageValues(a)
  const points = a.ledger.orders.filter((o) => o.cost.usd !== null).map((o) => ({ t: Date.parse(o.placedAt), usd: o.cost.usd as number, bps: o.cost.bps, symbol: o.symbol, side: o.side, type: o.type })).reverse()   // served newest first; drawn oldest first
  const bt = a.ordersBody.byType
  const typeRows = (['market', 'limit'] as const).map((k) => ({ type: k === 'market' ? 'Market orders' : 'Limit orders', execution: bt[k].execution.usd, unfilled: bt[k].opportunity.usd, fees: bt[k].fees.usd, orders: bt[k].total.n }))
  const ce = a.v2.costVsExpected
  const g = a.v2.result
  return (
    <main id="main">
      <DemoBanner dataSource={a.dataSource} />
      <PageHeader title="Costs" description={ordersSentence(a, v.period)}
        controls={<PeriodPicker period={v.period} />}
        primary={<button type="button" className="v-btn v-btn-primary"><Download size={16} aria-hidden="true" />Download PDF</button>}
        more={['How it’s measured', 'Share', 'Copy link']} />
      <div className="flex flex-col gap-4 px-4 pb-10 lg:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile label="Total cost" value={v.tiles.total.value} sub={v.tiles.total.sub} />
          <Tile label="Fees" value={v.tiles.fees.value} sub={v.tiles.fees.sub} />
          <Tile label="Unfilled orders (modelled)" value={v.tiles.unfilled.value} sub={v.tiles.unfilled.sub} />
          <Tile label="Execution grade" value={v.tiles.grade.value} sub={v.tiles.grade.sub} />
        </div>
        {v.strip ? (
          <Card title="Where the cost came from" sentence="The three parts add up to the total." id="where"
            info="Fees: what the exchange charged (here at the published rate). Unfilled orders: the modelled cost of the market moving away from orders that never filled; nobody paid it. Execution: filled orders against the market price at arrival."
            source="Source: /audit/orders-summary, the server's parts and shares.">
            <CostBreakdown view={v.strip} />
          </Card>
        ) : null}
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Cost per order" sentence="Each bar is one order’s measured cost, by the time it was placed." id="cpo" source="Source: your orders, measured against Binance public trades.">
            <OrderCostChart points={points} label={`Cost of each of ${points.length} orders over ${v.period}`} />
          </Card>
          <Card title="By order type" sentence="Market and limit orders, each total in its three parts." id="type" source="Source: /audit/orders-summary byType.">
            <TypeBars rows={typeRows} />
            <table className="v-table text-[13px]">
              <caption className="sr-only">The same values as the chart</caption>
              <thead><tr><th>Type</th><th className="num">Orders</th><th className="num">Fees</th><th className="num">Unfilled (modelled)</th><th className="num">Execution</th></tr></thead>
              <tbody>{typeRows.map((r) => <tr key={r.type}><td>{r.type}</td><td className="num">{r.orders}</td><td className="num">{money(r.fees)}</td><td className="num">{money(r.unfilled)}</td><td className="num">{money(r.execution)}</td></tr>)}</tbody>
            </table>
          </Card>
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Execution grade" sentence={`Graded ${g.grade}, ${g.composite.toFixed(1)} of 100, from ${count(g.orders, 'order')} and ${count(g.fills, 'fill')}.`} id="grade"
            source={`Score version ${a.v2.scoringVersion.replace(/^v/, '')} · integrity hash ${a.v2.integrityHash.slice(0, 12)}…`}>
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <GradeStamp grade={g.grade} score={g.composite} period={v.month} version={a.v2.scoringVersion} size="lg" />
              <div className="w-full min-w-0 flex-1"><GradeRange score={g.composite} band={g.band} /><p className="mt-2 text-[14px] text-[var(--v-text-2)]">Range from the measurement: {g.band[0].toFixed(1)} to {g.band[1].toFixed(1)}.</p></div>
            </div>
          </Card>
          <Card title="Against the model estimate" sentence={`Market orders, ${count(ce.n, 'order')} inside the model.`} id="model"
            info="The model estimates what a market order of that size usually costs (square-root model, calibration ec1.0.0). It is an estimate, not a promise."
            source={`Source: /audit/v2 costVsExpected, version ${ce.version}.`}>
            {ce.insufficient ? <p className="text-[14px]">Insufficient data: fewer than 20 market orders inside the model.</p> : (
              <dl className="grid grid-cols-2 gap-3">
                <div><dt className="text-[13px] text-[var(--v-text-2)]">Paid</dt><dd className="text-[22px] font-semibold">{bps(ce.paidBps)}</dd><dd className="text-[13px] text-[var(--v-text-2)]">{money(ce.paidUsd)}</dd></div>
                <div><dt className="text-[13px] text-[var(--v-text-2)]">Model estimate</dt><dd className="text-[22px] font-semibold">{bps(ce.expectedBps)}</dd><dd className="text-[13px] text-[var(--v-text-2)]">{money(ce.expectedUsd)}</dd></div>
                <div className="col-span-2 text-[14px] text-[var(--v-text-2)]">Difference {bps(ce.excessBps)}, 90% interval {bps(ce.lowBps)} to {bps(ce.highBps)}.</div>
              </dl>
            )}
          </Card>
        </div>
        <Card title="What this covers" id="scope">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
            <div><dt className="text-[13px] text-[var(--v-text-2)]">Orders</dt><dd>{count(a.ordersBody.counts.orders, 'order')}, {a.ordersBody.counts.withFills} with fills</dd></div>
            <div><dt className="text-[13px] text-[var(--v-text-2)]">Fills</dt><dd>{count(a.current.fills, 'fill')}, {share(a.current.makerRatio)} maker</dd></div>
            <div><dt className="text-[13px] text-[var(--v-text-2)]">Venue</dt><dd>Binance Spot</dd></div>
            <div><dt className="text-[13px] text-[var(--v-text-2)]">Data</dt><dd>{v.demo ? 'Synthetic trader, real prices' : 'Your exchange data'}</dd></div>
          </dl>
        </Card>
      </div>
    </main>
  )
}

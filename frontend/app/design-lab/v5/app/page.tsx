import Link from 'next/link'
import { Download, MessageSquareText } from 'lucide-react'
import { loadAccount } from '../lib/data'
import { bps, money, textTime } from '../lib/format'
import { pageValues } from '../lib/view'
import { Card, Tile } from '../components/Blocks'
import { OrderCostChart } from '../components/Charts'
import { DemoBanner, PageHeader, PeriodPicker } from '../components/PageHeader'

// The questions the production Home offers as recorded answers for demo accounts (frontend/app/lib/ask/ask-recorded-claims.json).
const QUESTIONS = ['Which orders cost the most?', 'What did my orders cost in total?', 'How did my market orders compare with the modelled cost?', 'What score did my execution get?']

export default async function V5Home({ searchParams }: { searchParams: Promise<{ userId?: string }> }) {
  const a = loadAccount((await searchParams).userId)
  const v = pageValues(a)
  const points = a.ledger.orders.filter((o) => o.cost.usd !== null).map((o) => ({ t: Date.parse(o.placedAt), usd: o.cost.usd as number, bps: o.cost.bps, symbol: o.symbol, side: o.side, type: o.type })).reverse()   // served newest first; drawn oldest first
  // the five rows with the highest served cost (an ordering of served values)
  const costliest = [...a.ledger.orders].filter((o) => o.cost.usd !== null).sort((x, y) => (y.cost.usd as number) - (x.cost.usd as number)).slice(0, 5)
  return (
    <main id="main">
      <DemoBanner dataSource={a.dataSource} />
      <PageHeader title="Home" description={`Your account at a glance: what the ${a.ordersBody.counts.orders} orders cost, ${v.period}.`}
        controls={<PeriodPicker period={v.period} />}
        primary={<button type="button" className="v-btn v-btn-primary"><Download size={16} aria-hidden="true" />Download PDF</button>}
        more={['How it’s measured', 'Share', 'Copy link']} />
      <div className="flex flex-col gap-4 px-4 pb-10 lg:px-8">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Tile testid="home-total" label="Total cost" value={v.tiles.total.value} sub={v.tiles.total.sub} />
          <Tile label="Fees" value={v.tiles.fees.value} sub={v.tiles.fees.sub} />
          <Tile label="Unfilled orders (modelled)" value={v.tiles.unfilled.value} sub={v.tiles.unfilled.sub} />
          <Tile label="Execution grade" value={v.tiles.grade.value} sub={v.tiles.grade.sub} />
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card title="Cost per order" sentence="Each bar is one order’s measured cost, by the time it was placed." id="cpo"
            info="An order's cost is its implementation shortfall: execution against the market price when the order arrived, plus fees, plus the modelled cost of what did not fill. Measured by the server; this chart draws the stored values."
            source="Source: your orders, measured against Binance public trades (scoring v2.3.0).">
            <OrderCostChart points={points} label={`Cost of each of ${points.length} orders over ${v.period}`} />
          </Card>
          <Card title="Costliest orders" sentence="The five orders with the highest measured cost." id="top">
            <ul className="flex flex-col divide-y divide-[var(--v-border)]">
              {costliest.map((o) => (
                <li key={o.key}>
                  <Link href={`/design-lab/v5/app/orders?userId=${a.id}&order=${encodeURIComponent(o.orderId)}`} className="flex min-h-[48px] items-center justify-between gap-3 py-2 hover:bg-[var(--v-surface-2)]">
                    <span className="min-w-0"><span className="block font-medium">{o.symbol} · {o.side === 'BUY' ? 'Buy' : 'Sell'} {o.type.toLowerCase()}</span><span className="block text-[13px] text-[var(--v-text-2)]">{textTime(o.placedAt)}</span></span>
                    <span className="shrink-0 text-right"><span className="block font-semibold">{money(o.cost.usd)}</span><span className="block text-[13px] text-[var(--v-text-2)]">{bps(o.cost.bps)}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card title="Ask about your past orders" sentence="Demo accounts play recorded answers; a signed-in account asks live. Figures in answers are placed by code." id="ask">
          <div className="flex items-center gap-2 rounded-lg border border-[var(--v-border-strong)] bg-[var(--v-surface-2)] px-3 py-2.5 text-[var(--v-text-2)]">
            <MessageSquareText size={18} aria-hidden="true" />Ask a question about these orders (sign in to ask your own)
          </div>
          <div className="flex flex-wrap gap-2">
            {QUESTIONS.map((q) => <span key={q} className="rounded-full border border-[var(--v-border-strong)] px-3 py-1.5 text-[14px]">{q}</span>)}
          </div>
          <p className="text-[13px] text-[var(--v-text-2)]">Recorded answers open in the production app; this prototype shows the layout only.</p>
        </Card>
      </div>
    </main>
  )
}

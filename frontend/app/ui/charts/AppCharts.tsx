'use client'

import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { money } from '../../lib/format'
import { clockTick, niceTimeTicks, priceDecimals, timeStep } from './ticks'

/**
 * Design v5 charts (PROPOSAL §6), Recharts, loaded only by the pages that draw them (`next/dynamic`). Every value drawn is a served
 * value passed through; nothing is summed or averaged here. Axis titles are plain HTML under or over the plot, so they can never
 * overlap the ticks; tick labels are 12 px in the secondary ink (AA); marks differ in shape where colour alone would carry identity.
 * Bars grow only on first view and never under reduced motion.
 */
const tick = { fontSize: 12, fill: 'var(--ui-graphite)' }
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-ui-rule bg-ui-raised px-3 py-2 text-[13px] text-ui-ink shadow-ui">{children}</div>
}

/** One type's three cost parts in dollars, as the server served them (`byType.<type>`: execution, unfilled = opportunity, fees). */
export interface TypeRow { type: string; execution: number; unfilled: number; fees: number; orders: number }
const PARTS: Array<{ key: 'fees' | 'unfilled' | 'execution'; label: string; color: string }> = [
  { key: 'fees', label: 'Fees', color: 'var(--ui-series-1)' },
  { key: 'unfilled', label: 'Unfilled orders (modelled)', color: 'var(--ui-series-2)' },
  { key: 'execution', label: 'Execution', color: 'var(--ui-series-3)' },
]

/**
 * "By order type": one labelled stacked horizontal bar per type, in the style of "Where the cost came from". A part that is not
 * positive has no width: it is named beside the bar with its dollars (a price improvement is said so), never drawn as a bar to the
 * left of zero, so the axis starts at $0 and its ticks are round values. The legend is HTML, so it wraps and is never clipped.
 */
export function TypeBars({ rows }: { rows: TypeRow[] }) {
  const data = rows.map((r) => ({ ...r, fees: Math.max(r.fees, 0), unfilled: Math.max(r.unfilled, 0), execution: Math.max(r.execution, 0) }))
  return (
    <figure className="m-0 flex flex-col gap-2" data-testid="type-bars">
      <div className="h-[170px] w-full" role="img" aria-label={`Cost by order type: ${rows.map((r) => `${r.type}, ${money(r.fees)} fees, ${money(r.unfilled)} unfilled, ${money(r.execution)} execution`).join('; ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke="var(--ui-grid)" />
            <XAxis type="number" domain={[0, 'auto']} allowDecimals tick={tick} stroke="var(--ui-axis)" tickFormatter={(v: number) => `$${v}`} />
            <YAxis type="category" dataKey="type" tick={{ ...tick, fontSize: 13, fill: 'var(--ui-ink)' }} stroke="var(--ui-axis)" width={108} />
            <ReferenceLine x={0} stroke="var(--ui-axis)" />
            <Tooltip cursor={{ fill: 'var(--ui-overlay)' }} content={({ active, payload }) => {
              const r = active && (payload?.[0]?.payload as TypeRow | undefined)
              return r ? <Box><strong>{r.type}</strong> ({r.orders} orders)<br />{PARTS.map((p) => <span key={p.key} className="block">{p.label}: {money(rows.find((x) => x.type === r.type)![p.key])}</span>)}</Box> : null
            }} />
            {PARTS.map((p) => <Bar key={p.key} dataKey={p.key} stackId="cost" fill={p.color} isAnimationActive={!reduced()} animationDuration={300} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-[12px] text-ui-graphite">Cost ($), from $0</p>
      <ul className="flex flex-col gap-0.5 text-[13px] text-ui-graphite">
        {rows.flatMap((r) => PARTS.filter((p) => r[p.key] <= 0).map((p) => (
          <li key={`${r.type}-${p.key}`}>{r.type}: {p.label.toLowerCase()} {r[p.key] < 0 ? `${money(r[p.key])}, better than the market, not drawn` : `${money(r[p.key])}, no width`}</li>
        )))}
      </ul>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ui-graphite">
        {PARTS.map((p) => <span key={p.key} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-2.5 rounded-[3px]" style={{ background: p.color }} />{p.label}</span>)}
      </figcaption>
    </figure>
  )
}

export interface TradePoint { t: number; price: number; side: 'buyer' | 'seller'; qty: number }
export interface FillPoint { t: number; price: number; qty: number }
const clockMs = (t: number) => new Date(t).toISOString().slice(11, 23)
const pxWith = (d: number) => (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })

/**
 * Public trades around one order: time (UTC, milliseconds) by price, buyer- and seller-initiated in two shapes, the order's fills as
 * larger diamonds, the order's placement time as a dashed line inside the axis range. Values are the stored public trades and the
 * served fills. The legend lists only the marks that are drawn.
 */
export function PricePrintsChart({ trades, fills, quote, arrivalMs, source }: { trades: TradePoint[]; fills: FillPoint[]; quote: string; arrivalMs: number; source?: string }) {
  const buyer = trades.filter((t) => t.side === 'buyer'), seller = trades.filter((t) => t.side === 'seller')
  // round time ticks and the price decimals of the stored trades (the symbol's tick size): reviewer items of design v5 step 5
  const times = [...trades.map((t) => t.t), ...fills.map((f) => f.t), arrivalMs]
  const lo = Math.min(...times), hi = Math.max(...times)
  const step = timeStep(lo, hi, 3)
  const ticks = niceTimeTicks(lo, hi, 3)
  const px = pxWith(priceDecimals([...trades.map((t) => t.price), ...fills.map((f) => f.price)]))
  return (
    <figure className="m-0 flex flex-col gap-1" aria-label={`Public trades around the order: ${trades.length} trades and ${fills.length} fills`} data-testid="receipt-price-chart">
      <p className="text-[12px] text-ui-graphite">Price ({quote})</p>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--ui-grid)" />
            <XAxis type="number" dataKey="t" tick={tick} stroke="var(--ui-axis)" tickFormatter={(t: number) => clockTick(t, step)} ticks={ticks}
              domain={[lo, hi]} allowDataOverflow />
            <YAxis type="number" dataKey="price" tick={tick} stroke="var(--ui-axis)" domain={['auto', 'auto']} width={74} tickFormatter={px} />
            <ZAxis range={[40, 40]} />
            <ReferenceLine x={arrivalMs} stroke="var(--ui-graphite)" strokeDasharray="4 3" />
            <Tooltip content={({ active, payload }) => {
              const p = active && (payload?.[0]?.payload as (TradePoint & FillPoint) | undefined)
              return p ? <Box>{'side' in p && p.side ? `Public trade, ${p.side}-initiated` : 'Your fill'}<br />{px(p.price)} {quote}, quantity {p.qty}<br />{clockMs(p.t)} UTC</Box> : null
            }} />
            <Scatter name="Buyer-initiated public trade" data={buyer} fill="var(--ui-series-1)" shape="triangle" isAnimationActive={false} />
            <Scatter name="Seller-initiated public trade" data={seller} fill="var(--ui-series-2)" shape="circle" isAnimationActive={false} />
            <Scatter name="Your fill" data={fills} fill="var(--ui-ink)" shape="diamond" isAnimationActive={false}>
              {fills.map((_, i) => <Cell key={i} stroke="var(--ui-raised)" strokeWidth={2} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-center text-[12px] text-ui-graphite">Time (UTC)</p>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ui-graphite">
        {buyer.length ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" style={{ color: 'var(--ui-series-1)' }}>▲</span>Public trade, buyer-initiated</span> : null}
        {seller.length ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" style={{ color: 'var(--ui-series-2)' }}>●</span>Public trade, seller-initiated</span> : null}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 border-l border-dashed border-current" />Order placed</span>
        {fills.length ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-2 rotate-45 bg-ui-ink" />Your fill</span> : null}
      </figcaption>
      {source ? <p className="text-[12px] text-ui-graphite">{source}</p> : null}
    </figure>
  )
}

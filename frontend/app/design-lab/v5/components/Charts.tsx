'use client'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import { money } from '../lib/format'

/**
 * Design v5 charts (PROPOSAL §6). Every value drawn is a server value passed through: one bar per order (`cost.usd` from
 * /audit/orders-ledger), the order-type totals (`byType` from /audit/orders-summary), the stored public trades of one order.
 * Nothing is summed or averaged here. Axis titles carry units; tick labels are 12 px in the secondary ink (AA); marks differ in
 * shape where colour alone would carry identity. Bars grow only on first view and never under reduced motion.
 */
const tick = { fontSize: 12, fill: 'var(--v-text-2)' }
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const dayFmt = (t: number) => new Date(t).toISOString().slice(5, 10).replace('-', '/')

function Box({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-[var(--v-border)] bg-[var(--v-surface)] px-3 py-2 text-[13px] shadow-sm">{children}</div>
}

export interface OrderPoint { t: number; usd: number; symbol: string; side: string; type: string; bps: number | null }
/** One bar per order on a time axis; the y axis is the order's measured cost in dollars. */
export function OrderCostChart({ points, label }: { points: OrderPoint[]; label: string }) {
  return (
    <figure aria-label={label} className="m-0">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 22, left: 8 }} barCategoryGap="12%">
            <CartesianGrid vertical={false} stroke="var(--v-grid)" />
            <XAxis dataKey="t" type="category" tickFormatter={dayFmt} tick={tick} stroke="var(--v-axis)" interval="preserveStartEnd" minTickGap={28}
              label={{ value: 'Orders, oldest to newest (UTC date, month/day; evenly spaced, not to time scale)', position: 'insideBottom', offset: -14, fontSize: 12, fill: 'var(--v-text-2)' }} />
            <YAxis tick={tick} stroke="var(--v-axis)" width={56} tickFormatter={(v: number) => money(v) ?? ''}
              label={{ value: 'Cost ($)', angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--v-text-2)', dy: 30 }} />
            <ReferenceLine y={0} stroke="var(--v-axis)" />
            <Tooltip cursor={{ fill: 'var(--v-surface-2)' }} content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload as OrderPoint | undefined
              return p ? <Box><strong>{p.symbol} {p.side.toLowerCase()} {p.type.toLowerCase()}</strong><br />{new Date(p.t).toISOString().slice(0, 16).replace('T', ' ')} UTC<br />Cost {money(p.usd)}{p.bps !== null ? ` · ${p.bps.toFixed(1)} bps` : ''}</Box> : null
            }} />
            <Bar dataKey="usd" fill="var(--v-s1)" radius={[2, 2, 0, 0]} isAnimationActive={!reduced()} animationDuration={300} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}

export interface TypeRow { type: string; execution: number; unfilled: number; fees: number; orders: number }
const PARTS: Array<[keyof TypeRow, string, string]> = [['fees', 'Fees', 'var(--v-s1)'], ['unfilled', 'Unfilled orders (modelled)', 'var(--v-s2)'], ['execution', 'Execution', 'var(--v-s3)']]
/** Market against limit orders: the three parts of each type's total, side by side (grouped, one axis in dollars). */
export function TypeBars({ rows }: { rows: TypeRow[] }) {
  return (
    <figure className="m-0">
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 22, left: 8 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid horizontal={false} stroke="var(--v-grid)" />
            <XAxis type="number" tick={tick} stroke="var(--v-axis)" tickFormatter={(v: number) => `$${v}`}
              label={{ value: 'Cost ($)', position: 'insideBottom', offset: -14, fontSize: 12, fill: 'var(--v-text-2)' }} />
            <YAxis type="category" dataKey="type" tick={{ ...tick, fontSize: 13, fill: 'var(--v-text)' }} stroke="var(--v-axis)" width={110} />
            <ReferenceLine x={0} stroke="var(--v-axis)" />
            <Tooltip cursor={{ fill: 'var(--v-surface-2)' }} content={({ active, payload }) => {
              const r = active && payload?.[0]?.payload as TypeRow | undefined
              return r ? <Box><strong>{r.type}</strong> ({r.orders} orders)<br />{PARTS.map(([k, l]) => <span key={k} className="block">{l}: {money(r[k] as number)}</span>)}</Box> : null
            }} />
            {PARTS.map(([k, , c]) => <Bar key={k} dataKey={k} fill={c} radius={2} isAnimationActive={!reduced()} animationDuration={300} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--v-text-2)]">
        {PARTS.map(([k, l, c]) => <span key={k} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block size-2.5 rounded-[3px]" style={{ background: c }} />{l}</span>)}
      </figcaption>
    </figure>
  )
}

export interface TradePoint { t: number; price: number; side: 'buyer' | 'seller'; qty: number }
export interface FillPoint { t: number; price: number; qty: number }
const clockMs = (t: number) => new Date(t).toISOString().slice(11, 23)
/**
 * Public trades around one order (time in seconds from the order's arrival × price), buyer- and seller-initiated in two shapes,
 * the order's fills as larger marks, the arrival time as a reference line. Values are the stored prints and the served fills.
 */
export function PricePrintsChart({ trades, fills, quote, arrivalMs }: { trades: TradePoint[]; fills: FillPoint[]; quote: string; arrivalMs: number }) {
  const buyer = trades.filter((t) => t.side === 'buyer'), seller = trades.filter((t) => t.side === 'seller')
  return (
    <figure className="m-0" aria-label={`Public trades around the order, ${trades.length} trades and ${fills.length} fills`}>
      <div className="h-[240px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 22, left: 8 }}>
            <CartesianGrid stroke="var(--v-grid)" />
            <XAxis type="number" dataKey="t" tick={tick} stroke="var(--v-axis)" tickFormatter={clockMs} tickCount={3}
              domain={[(lo: number) => Math.min(lo, arrivalMs), (hi: number) => Math.max(hi, arrivalMs)]}
              label={{ value: 'Time (UTC)', position: 'insideBottom', offset: -14, fontSize: 12, fill: 'var(--v-text-2)' }} />
            <YAxis type="number" dataKey="price" tick={tick} stroke="var(--v-axis)" domain={['auto', 'auto']} width={72}
              label={{ value: `Price (${quote})`, angle: -90, position: 'insideLeft', fontSize: 12, fill: 'var(--v-text-2)', dy: 36 }} />
            <ZAxis range={[36, 36]} />
            <ReferenceLine x={arrivalMs} stroke="var(--v-text-2)" strokeDasharray="4 3" label={{ value: 'order placed', position: 'top', fontSize: 12, fill: 'var(--v-text-2)' }} />
            <Tooltip content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload as (TradePoint & FillPoint) | undefined
              return p ? <Box>{'side' in p && p.side ? `Public trade, ${p.side}-initiated` : 'Your fill'}<br />{p.price} {quote} · {p.qty}<br />{clockMs(p.t)} UTC</Box> : null
            }} />
            <Scatter name="Buyer-initiated public trade" data={buyer} fill="var(--v-s1)" shape="triangle" isAnimationActive={false} />
            <Scatter name="Seller-initiated public trade" data={seller} fill="var(--v-s2)" shape="circle" isAnimationActive={false} />
            <Scatter name="Your fill" data={fills} fill="var(--v-text)" shape="diamond" isAnimationActive={false}>
              {fills.map((_, i) => <Cell key={i} stroke="var(--v-surface)" strokeWidth={2} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--v-text-2)]">
        {buyer.length ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" style={{ color: 'var(--v-s1)' }}>▲</span>Public trade, buyer-initiated</span> : null}
        {seller.length ? <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" style={{ color: 'var(--v-s2)' }}>●</span>Public trade, seller-initiated</span> : null}
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 border-l border-dashed border-current" />Order placed</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true">◆</span>Your fill</span>
      </figcaption>
    </figure>
  )
}

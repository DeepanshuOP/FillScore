'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatSignedBps, formatUsd } from '../ui/format'
import { ValueState } from '../ui/ValueState'
import { MarginNote } from '../ui/MarginNote'
import { circlePath } from '../ui/pen'
import { baselineShare, dayMarks, monthTicks, nearestTick } from './monthTape'
import { formatUtc, ledgerRows, withParams, type OrderRow } from './ordersTable'
import { useFirstEntry } from './chapter'

type ExplainRequest = (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; body: unknown }>

const H = 156
const PAD = 18
/** Below this many pixels per order the tape is printed wider than its box and dragged sideways. */
const MIN_PX = 4
const LENS_W = 120, LENS_SPAN = 40

/**
 * The period as a ticker tape (design v3; v3.1 "Quiet audit", chapter 4). One bar per order on the time axis, height =
 * the order's total cost in dollars from the server's ledger (a price improvement hangs below the line, same scale; an
 * unmeasured order is a short dashed mark). Hover, focus and the arrow keys pick an order: a time loupe magnifies the
 * bars around it and a small printed slip previews it; a click or Enter opens its receipt with the bar as the receipt's
 * origin. When the bars are denser than 4 px each (a phone), the tape is printed wider and dragged sideways (GSAP
 * Draggable with inertia, loaded on demand); the keys still move order by order and bring the order into view.
 * The largest order is circled by the pen with its amount. The rows are the Orders ledger's (GET /audit/orders-ledger).
 */
export function MonthTape({ query, request, period, periodLabel, onOpen, account = 'me' }: {
  query: string
  request: ExplainRequest
  period: { start: string; end: string }
  periodLabel: string
  onOpen: (row: OrderRow, origin: DOMRect | null) => void
  account?: string
}) {
  const [rows, setRows] = useState<OrderRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const [active, setActive] = useState<number | null>(null)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [shift, setShift] = useState(0)
  const dragged = useRef(false)
  const draggable = useRef<{ update: () => void; kill: () => void } | null>(null)
  const [reduced, setReduced] = useState(false)
  const play = useFirstEntry(`${account}:tape`, box)

  useEffect(() => { setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches) }, [])

  useEffect(() => {
    let live = true
    request(withParams('/audit/orders-ledger', query))
      .then((res) => {
        if (!live) return
        if (res.status !== 200) { setFailed(true); return }
        setRows(ledgerRows(res.body) ?? [])
      })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [query, request])

  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [rows])

  const ticks = useMemo(() => (rows ? monthTicks(rows, period.start, period.end) : []), [rows, period.start, period.end])
  const days = useMemo(() => dayMarks(period.start, period.end), [period.start, period.end])
  // the printed width: the box, or wider when the bars would be closer than MIN_PX
  const cw = Math.max(w, ticks.length * MIN_PX + 2 * PAD)
  const wide = w > 0 && cw > w + 1
  const x = useCallback((t: number) => PAD + t * Math.max(0, cw - 2 * PAD), [cw])
  // B1: bars share one dollar scale; the baseline sits where the largest cost ends, improvements hang below it
  const base = H - 30, top = 34, D = base - top
  const zero = top + D * baselineShare(ticks)
  const barEnd = (i: number) => { const t = ticks[i]; return t.measured ? zero - (Math.sign(t.v) || 1) * Math.max(1.5, D * Math.abs(t.v)) : zero + 3 }
  // the order the pen circles: the largest measured cost (the server's dollars, placed here, not computed)
  const biggest = useMemo(() => {
    let best = -1
    ticks.forEach((t, i) => { if (t.measured && t.v > 0 && (best < 0 || t.v > ticks[best].v)) best = i })
    return best
  }, [ticks])

  // a wide tape is dragged sideways; inertia carries a flick (GSAP Draggable + InertiaPlugin, loaded on demand)
  useEffect(() => {
    const el = inner.current
    if (!wide || !el) return
    let dead = false
    void Promise.all([import('gsap'), import('gsap/Draggable'), import('gsap/InertiaPlugin')]).then(([{ gsap }, { Draggable }, { InertiaPlugin }]) => {
      if (dead) return
      gsap.registerPlugin(Draggable, InertiaPlugin)
      const [d] = Draggable.create(el, {
        type: 'x', bounds: { minX: w - cw, maxX: 0 }, inertia: !reduced, edgeResistance: 0.85, allowNativeTouchScrolling: true,
        zIndexBoost: false, cursor: 'grab', activeCursor: 'grabbing',
        onDragStart: () => { dragged.current = true; setActive(null) },
        onDragEnd: function (this: { x: number }) { setShift(this.x) },
        onThrowComplete: function (this: { x: number }) { setShift(this.x) },
      })
      draggable.current = d
    }).catch(() => {})
    return () => { dead = true; draggable.current?.kill(); draggable.current = null }
  }, [wide, w, cw, reduced])

  /** Bring bar i into view (keys): a plain jump, no animation (a keyboard action). */
  const reveal = useCallback((i: number) => {
    const el = inner.current
    if (!wide || !el) return
    const bx = x(ticks[i].t)
    let s = shift
    if (bx + s < 24) s = -(bx - 24)
    else if (bx + s > w - 24) s = -(bx - (w - 24))
    s = Math.max(w - cw, Math.min(0, s))
    if (s !== shift) { el.style.transform = `translate3d(${s}px,0,0)`; setShift(s); draggable.current?.update() }
  }, [wide, x, ticks, shift, w, cw])

  const originOf = (i: number): DOMRect | null => {
    const el = inner.current
    if (!el) return null
    const r = el.getBoundingClientRect()
    const y0 = Math.min(zero, barEnd(i)), y1 = Math.max(zero, barEnd(i))
    return new DOMRect(r.left + x(ticks[i].t) - 3, r.top + y0, 6, Math.max(6, y1 - y0))
  }
  // a click grows the receipt out of the bar; a key opens it plainly (no motion on keyboard actions)
  const open = (i: number, viaKey = false) => { const r = ticks[i]?.row; if (r?.orderId) onOpen(r, viaKey ? null : originOf(i)) }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = ticks.length, cur = active ?? -1
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(n - 1, cur + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, cur < 0 ? 0 : cur - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else if ((e.key === 'Enter' || e.key === ' ') && active !== null) { e.preventDefault(); open(active, true); return }
    if (next !== null) { e.preventDefault(); setHoverX(null); setActive(next); reveal(next) }
  }

  const head = (
    <p className="mb-4 flex flex-wrap items-baseline gap-x-2 text-[20px] leading-snug font-bold tracking-[-0.02em] text-ui-ink">
      <span>Each mark is one order; its height is what it cost.</span>
      <MarginNote label="reading the tape">
        <p>Height: the order&rsquo;s total cost in dollars, on one scale; a price improvement is drawn below the line; a short dashed mark is an order with no measured cost.</p>
        <p>Point at the tape, or focus it and use the arrow keys{wide ? ', or drag it sideways' : ''}; a click or Enter opens the order&rsquo;s receipt.</p>
      </MarginNote>
    </p>
  )
  if (failed) return <div>{head}<ValueState state="not-computed" label="Orders over the period" reason="The orders could not be loaded." /></div>
  if (rows && ticks.length === 0) return <div>{head}<ValueState state="not-computed" label="Orders over the period" reason="No order fell inside the period." /></div>

  const a = active !== null ? ticks[active] : null
  const ax = a ? x(a.t) + shift : 0
  const lensX = hoverX ?? (a ? x(a.t) : null)
  const big = biggest >= 0 ? ticks[biggest] : null
  return (
    <div>
      {head}
      <div ref={box} className="fs-strip fs-sprockets relative overflow-hidden outline-offset-[6px]" style={{ height: H }}
        tabIndex={rows ? 0 : -1} role="listbox" aria-label={`${ticks.length} orders in ${periodLabel}`} aria-busy={!rows}
        aria-activedescendant={active !== null ? `tk-${ticks[active].key}` : undefined} onKeyDown={onKeyDown}
        onPointerDown={() => { dragged.current = false }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'mouse' || !inner.current) return
          const lx = e.clientX - inner.current.getBoundingClientRect().left
          const i = nearestTick(ticks.map((t) => x(t.t)), lx, 12)
          setHoverX(lx)
          if (i !== null) setActive(i)
        }}
        onPointerLeave={() => { setActive(null); setHoverX(null) }}
        onClick={(e) => {
          if (dragged.current) return
          // the order the reader sees picked (orange bar, preview) is the one that opens; bars a fraction of a pixel
          // apart would otherwise resolve differently from the click's whole-pixel position
          if (active !== null) { open(active); return }
          if (e.detail > 0 && inner.current) {
            const i = nearestTick(ticks.map((t) => x(t.t)), e.clientX - inner.current.getBoundingClientRect().left, 14)
            if (i !== null) open(i)
          }
        }}
        onBlur={() => { setActive(null); setHoverX(null) }}>
        <div ref={inner} className="absolute inset-y-0 left-0 touch-pan-y" style={{ width: cw || '100%', transform: `translate3d(${shift}px,0,0)` }}>
          {w > 0 && rows ? (
            <svg className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              <Bars ticks={ticks} days={days} x={x} base={base} zero={zero} D={D} active={active} wideLabels={cw > 500} />
              {big ? (
                <g className="fs-tape-pen" data-play={play} data-x={x(big.t).toFixed(1)}>
                  <path pathLength={1} d={circlePath(x(big.t) - 7, barEnd(biggest) - 4, 14, 16, 7)} fill="none" stroke="var(--ui-pen)" strokeWidth={2} strokeLinecap="round" />
                  <text x={x(big.t) + (x(big.t) > cw - 120 ? -20 : 20)} y={barEnd(biggest) + 6} textAnchor={x(big.t) > cw - 120 ? 'end' : 'start'}
                    className="fill-ui-pen-ink font-mono text-[13px]">{big.row.cost ? formatUsd(big.row.cost.usd) : ''}</text>
                </g>
              ) : null}
            </svg>
          ) : <p className="absolute inset-x-5 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ui-graphite">Feeding the tape</p>}
          {/* the time loupe: the bars around the pointer (or the active order) at three times the width */}
          {lensX !== null && !reduced && w > 0 && rows ? (
            <div aria-hidden="true" className="fs-lens pointer-events-none absolute top-[6px] bottom-[22px]" style={{ left: Math.max(0, Math.min(cw - LENS_W, lensX - LENS_W / 2)), width: LENS_W }}>
              <svg className="size-full" viewBox={`${lensX - LENS_SPAN / 2} ${top - 28} ${LENS_SPAN} ${base - top + 34}`} preserveAspectRatio="none">
                <Bars ticks={ticks} days={[]} x={x} base={base} zero={zero} D={D} active={active} wideLabels={false} lens />
              </svg>
            </div>
          ) : null}
        </div>
        {/* the options, for assistive technology: one per bar, named with what the preview prints */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {ticks.map((t, i) => (
            <span key={t.key} id={`tk-${t.key}`} role="option" aria-selected={active === i} className="sr-only">
              {`${t.row.symbol} ${t.row.side} ${t.row.type}, ${formatUtc(t.row.when)} UTC, ${t.row.cost ? `total cost ${formatUsd(t.row.cost.usd)}, ${formatSignedBps(t.row.cost.bps)}` : 'total cost not measured'}`}
            </span>
          ))}
        </div>
      </div>
      {/* the printed preview, below the tape so the loupe stays clear */}
      <div className="relative h-0">
        {a ? (
          <div aria-hidden="true" className="pointer-events-none absolute top-3 z-10 w-[250px] bg-ui-raised px-3.5 pt-3 pb-4 font-mono text-[12px] leading-normal text-ui-ink shadow-ui-float"
            style={{ left: Math.max(0, Math.min(w - 250, ax - 125)) }}>
            <div className="flex justify-between gap-2"><span>{a.row.symbol} {a.row.side}</span><span>{a.row.type.toUpperCase()}</span></div>
            <div className="text-ui-graphite">{formatUtc(a.row.when)} UTC</div>
            <div className="mt-1.5 flex justify-between"><span>COST</span><span>{a.row.cost ? `${formatUsd(a.row.cost.usd)}, ${formatSignedBps(a.row.cost.bps)}` : 'not measured'}</span></div>
            <div className="flex justify-between"><span>VALUE</span><span>{formatUsd(a.row.notionalUsd)}</span></div>
            <div className="flex justify-between"><span>FILLS</span><span>{a.row.fills}</span></div>
            <div className="flex justify-between"><span>FEES</span><span>{a.row.feesUsd === null ? 'not recorded' : formatUsd(a.row.feesUsd)}</span></div>
            <div aria-hidden="true" className="fs-torn-bottom absolute inset-x-0 -bottom-[11px] h-2.5" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** The bars and day marks, shared by the tape and its loupe (the loupe stretches them; strokes keep their width). */
function Bars({ ticks, days, x, base, zero, D, active, wideLabels, lens = false }: {
  ticks: ReturnType<typeof monthTicks>; days: ReturnType<typeof dayMarks>; x: (t: number) => number
  base: number; zero: number; D: number; active: number | null; wideLabels: boolean; lens?: boolean
}) {
  const ve = lens ? 'non-scaling-stroke' as const : undefined
  return (
    <>
      {days.map((d) => (
        <g key={d.t}>
          <line x1={x(d.t)} x2={x(d.t)} y1={base + 2} y2={base + 7} stroke="var(--ui-rule)" />
          {(d.day % 2 === 1 && wideLabels) || d.day % 5 === 1 ? <text x={x(d.t) + 3} y={base + 18} className="fill-ui-graphite font-mono text-[10px]">{d.day}</text> : null}
        </g>
      ))}
      <line x1={x(0)} x2={x(1)} y1={zero} y2={zero} stroke="var(--ui-rule)" vectorEffect={ve} />
      {ticks.map((t, i) => (
        // a measured cost: a bar from the baseline (up = cost, down = price improvement), at least 1.5 px so a tiny
        // cost is seen; no measured cost: a short dashed mark across the line
        <line key={t.key} x1={x(t.t)} x2={x(t.t)} vectorEffect={ve}
          y1={t.measured ? zero : zero - 3} y2={t.measured ? zero - (Math.sign(t.v) || 1) * Math.max(1.5, D * Math.abs(t.v)) : zero + 3}
          strokeDasharray={t.measured ? undefined : '1.5 1.5'}
          stroke={active === i ? 'var(--ui-pen)' : t.measured ? 'var(--ui-ink)' : 'var(--ui-graphite)'} strokeWidth={active === i ? 3 : lens ? 2.4 : 1.6} />
      ))}
    </>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { Info, RotateCcw, SkipForward } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '../../../lib/utils'
import { formatSignedBps, formatUsd } from '../format'
import { ProvenanceChip } from '../ProvenanceChip'
import { tapeModel, type TapeBox } from './tapeModel'
import { HERO_RULE } from '../../lib/landing/heroOrder'
import inputs from '../../design-lab/fixtures/landing-order.inputs.json'
import replay from '../../design-lab/fixtures/landing-order.replay.json'

/**
 * The signature of design v2: one real order on the exchange's real public prints. The tape (prints, quote band, mid)
 * is drawn from the first frame; only the order's story animates (placement, fills, the spread call-out, the prints
 * after the fill, the cost ledger). It plays once, can be skipped, and ends static. With reduced motion, without
 * script, or once skipped, the final frame shows. Every element is in the DOM from the first paint; the timeline only
 * changes opacity and transform, so nothing shifts. GSAP is loaded on first use (dynamic import).
 * Every figure comes from the replay data (backend buildOrderReplay output) or the public prints in the fixture.
 */
const order = replay.order
const fig = Object.fromEntries(replay.decomposition.map((f) => [f.key, f])) as Record<string, { label: string; bps: number | null; usd: number | null; source: { field: string } }>
const ec = replay.expectedCost
const quoteAtArrival = [...inputs.tape.mid].reverse().find((m) => m.ts <= inputs.tape.arrivalMs)!
const tick = Math.round((quoteAtArrival.ask - quoteAtArrival.bid) * 100) / 100
const base = order.symbol.replace('USDT', '')
const price = (p: number) => p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const utc = (iso: string) => iso.slice(11, 23)
const side = order.side === 'SELL' ? 'sell' : 'buy'

const WIDE: TapeBox = { W: 720, H: 320, L: 58, R: 704, T: 26, B: 280 }
const NARROW: TapeBox = { W: 360, H: 300, L: 50, R: 348, T: 26, B: 262 }

function Chart({ box, narrow }: { box: TapeBox; narrow: boolean }) {
  const m = tapeModel(inputs, replay.fills, box)
  const sm = narrow ? 11 : 11.5
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--ui-raised)', strokeWidth: 4, strokeLinejoin: 'round' as const }
  const f0 = m.fills[0], fLast = m.fills[m.fills.length - 1]
  const xs = narrow ? [-4, -2, 0, 2] : [-4, -3, -2, -1, 0, 1, 2]
  return (
    <svg viewBox={`0 0 ${box.W} ${box.H}`} className={cn('block h-auto w-full', narrow ? 'md:hidden' : 'hidden md:block')} role="img"
      aria-label={`Public prints of ${order.symbol} from 4 seconds before to 1.5 seconds after one market ${side} order, the bid and ask band, the mid price, the order's placement and its ${replay.fills.length} fills at ${price(f0.price)}.`}>
      {m.ticks.map((p) => (
        <g key={p}>
          <line x1={box.L} x2={box.R} y1={m.y(p)} y2={m.y(p)} stroke="var(--ui-rule)" strokeWidth={1} />
          <text x={box.L - 8} y={m.y(p) + 4} textAnchor="end" fontSize={sm} className="fill-ui-graphite tabular-nums">{p.toLocaleString('en-US')}</text>
        </g>
      ))}
      {xs.map((s) => (
        <text key={s} x={m.x(inputs.tape.arrivalMs + s * 1000)} y={box.B + 18} textAnchor="middle" fontSize={sm} className="fill-ui-graphite tabular-nums">
          {s === 0 ? 'placed' : s < 0 ? `−${-s} s` : `+${s} s`}
        </text>
      ))}
      <defs><clipPath id={`tape-plot-${narrow ? 'n' : 'w'}`}><rect x={box.L} y={box.T} width={box.R - box.L} height={box.B - box.T} /></clipPath></defs>
      {/* the tape: visible from frame 0 (clipped to the plot, so a quote outside the price range never draws over the labels) */}
      <g clipPath={`url(#tape-plot-${narrow ? 'n' : 'w'})`}>
        <path d={m.band} fill="color-mix(in srgb, var(--ui-measured) 16%, transparent)" stroke="none" />
        <path d={m.mid} fill="none" stroke="var(--ui-measured)" strokeWidth={2} strokeLinejoin="round" />
      </g>
      {m.prints.map((p) => (
        <circle key={p.id} data-story={p.after ? 'after' : undefined} cx={p.cx} cy={p.cy} r={p.r}
          fill={p.buyer ? 'var(--ui-graphite)' : 'var(--ui-raised)'} stroke="var(--ui-graphite)" strokeWidth={1.25} opacity={p.after ? 1 : 0.9} />
      ))}

      {/* the order's story */}
      <g data-story="placed">
        <line x1={m.arrival.x} x2={m.arrival.x} y1={box.T} y2={box.B} stroke="var(--ui-ink)" strokeWidth={1} strokeDasharray="3 4" opacity={0.7} />
        <circle cx={m.arrival.x} cy={m.arrival.y} r={4.5} fill="var(--ui-measured)" stroke="var(--ui-raised)" strokeWidth={2} />
        <text x={m.arrival.x - 8} y={box.T + 4} textAnchor="end" fontSize={sm} className="fill-ui-ink font-medium" style={halo}>Order placed {utc(order.createdAt)} UTC</text>
      </g>
      <g data-story="fills">
        {m.fills.map((f, i) => (
          <rect key={i} x={f.x - 6} y={f.y - 6} width={12} height={12} rx={2} transform={`rotate(45 ${f.x} ${f.y})`} fill="var(--ui-action)" stroke="var(--ui-raised)" strokeWidth={2} />
        ))}
      </g>
      {/* the call-out sits left of the fills and below the price line, where the plot is empty */}
      <g data-story="callout">
        <path d={`M${f0.x - 8},${f0.y + 6} L${f0.x - 26},${f0.y + 34} H${f0.x - 34}`} fill="none" stroke="var(--ui-edge)" strokeWidth={1} />
        <text x={f0.x - 40} y={f0.y + 38} textAnchor="end" fontSize={narrow ? 11.5 : 12.5} className="fill-ui-ink font-medium" style={halo}>
          {narrow ? `Filled at the bid, ${price(f0.price)}` : `${replay.fills.length} fills at the bid, ${price(f0.price)}`}
        </text>
        <text x={f0.x - 40} y={f0.y + 54} textAnchor="end" fontSize={sm} className="fill-ui-graphite" style={halo}>
          {narrow ? `Spread paid ${formatSignedBps(fig.spread.bps)}` : `Spread paid ${formatSignedBps(fig.spread.bps)}: half of a ${formatUsd(tick)} spread`}
        </text>
      </g>
      <g data-story="after-label">
        <text x={box.R} y={m.y(m.lowAfter) - 12} textAnchor="end" fontSize={sm} className="fill-ui-graphite" style={halo}>
          {`After the last fill, prints reached ${price(m.lowAfter)}`}
        </text>
      </g>
    </svg>
  )
}

const LEDGER = [
  { key: 'spread', label: 'Spread paid' },
  { key: 'impactTiming', label: 'Impact and timing' },
  { key: 'fees', label: 'Fees' },
] as const

function Ledger() {
  const total = fig.total.bps as number
  return (
    <div className="border-t border-ui-rule px-4 pt-4 pb-3 sm:px-5">
      <ul className="flex flex-col gap-2.5">
        {LEDGER.map((r) => {
          const v = fig[r.key].bps ?? 0
          const w = total > 0 ? (v / total) * 100 : 0
          return (
            <li key={r.key} data-story="ledger" className="grid grid-cols-[7.5rem_1fr_4.5rem_3.75rem] items-center gap-3 text-[13px] sm:grid-cols-[9rem_1fr_5rem_4rem]">
              <span className="text-ui-graphite">{r.label}</span>
              <span className="relative h-2 rounded-full bg-ui-overlay">
                {w >= 0.5
                  ? <span data-bar className="absolute inset-y-0 left-0 rounded-full bg-ui-measured" style={{ width: `${w}%` }} />
                  : <span data-bar className="absolute top-1/2 left-0 size-2 -translate-y-1/2 rounded-full border border-ui-measured bg-ui-raised" title="Too small to draw at this scale" />}
              </span>
              <span className="text-right tabular-nums text-ui-ink">{formatSignedBps(fig[r.key].bps)}</span>
              <span className="text-right tabular-nums text-ui-graphite">{formatUsd(fig[r.key].usd)}</span>
            </li>
          )
        })}
        <li data-story="total" className="grid grid-cols-[7.5rem_1fr_4.5rem_3.75rem] items-center gap-3 border-t border-ui-rule pt-2.5 text-[13px] sm:grid-cols-[9rem_1fr_5rem_4rem]">
          <span className="font-medium text-ui-ink">All in</span>
          <span className="text-ui-graphite">fees were {((fig.fees.bps as number) / total * 100).toFixed(2)}% of the cost</span>
          <span className="text-right font-medium tabular-nums text-ui-ink">{formatSignedBps(total)}</span>
          <span className="text-right font-medium tabular-nums text-ui-ink">{formatUsd(fig.total.usd)}</span>
        </li>
      </ul>
    </div>
  )
}

export function FiguresAndSources({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger className={cn('inline-flex items-center gap-1.5 rounded-md text-[13px] text-ui-graphite underline decoration-ui-rule underline-offset-4 hover:text-ui-ink', className)}>
        <Info aria-hidden="true" className="size-3.5" /> Figures and sources
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(92vw,26rem)] text-[13px] leading-5">
        <p className="font-medium text-ui-ink">Why this order</p>
        <p className="mt-1 text-ui-graphite">{HERO_RULE}</p>
        <p className="mt-3 font-medium text-ui-ink">Figures</p>
        <table className="mt-1 w-full tabular-nums">
          <tbody>
            {replay.decomposition.map((f) => (
              <tr key={f.key} className="border-t border-ui-rule">
                <th scope="row" className="py-1 text-left font-normal text-ui-graphite">{f.label}</th>
                <td className="py-1 text-right text-ui-ink">{formatSignedBps(f.bps)}</td>
                <td className="py-1 text-right text-ui-ink">{formatUsd(f.usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ec && ec.expectedBps !== null ? (
          <p className="mt-2 text-ui-graphite">
            Expected execution cost for an order of this size in the hour before: {formatSignedBps(ec.expectedBps)}
            {ec.lowBps !== null && ec.highBps !== null ? ` (${Math.round(ec.level * 100)}% interval ${formatSignedBps(ec.lowBps)} to ${formatSignedBps(ec.highBps)})` : ''}.
          </p>
        ) : null}
        <p className="mt-3 font-medium text-ui-ink">Sources</p>
        <ul className="mt-1 space-y-1 text-ui-graphite">
          {replay.sources.map((s) => (
            <li key={s.sha256}>
              {s.url ? <a href={s.url} className="text-ui-ink" rel="noopener noreferrer" target="_blank">{s.label}</a> : s.label}, SHA-256{' '}
              <code className="font-ui-mono text-[11px] break-all text-ui-ink">{s.sha256}</code>
            </li>
          ))}
          <li>The trader is synthetic (demo-moderate); the prices are Binance&rsquo;s public prints. Order <code className="font-ui-mono text-[11px] text-ui-ink">{order.orderId}</code>.</li>
          {replay.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

type Phase = 'idle' | 'playing' | 'done'

export function HeroTape({ autoPlay = true, className }: { autoPlay?: boolean; className?: string }) {
  const root = useRef<HTMLDivElement>(null)
  const tl = useRef<{ progress: (v: number) => void; restart: () => void; kill: () => void } | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')

  useEffect(() => {
    const el = root.current
    if (!el || !autoPlay) { el?.removeAttribute('data-armed'); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { el.removeAttribute('data-armed'); return }
    let dead = false
    void import('gsap').then(({ gsap }) => {
      if (dead) return
      const q = (s: string) => el.querySelectorAll<Element>(`[data-story="${s}"]`)
      const ease = 'expo.out'
      const t = gsap.timeline({ delay: 0.5, onComplete: () => setPhase('done') })
      t.set(el.querySelectorAll('[data-story]'), { opacity: 0 })
      el.removeAttribute('data-armed')
      t.fromTo(q('placed'), { opacity: 0 }, { opacity: 1, duration: 0.5, ease })
        .fromTo(q('fills'), { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, '+=0.35')
        .fromTo(q('callout'), { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.6, ease }, '+=0.15')
        .fromTo(q('after'), { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.02, ease }, '+=0.2')
        .fromTo(q('after-label'), { opacity: 0 }, { opacity: 1, duration: 0.4, ease }, '<0.2')
        .fromTo(q('ledger'), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.12, ease }, '+=0.2')
        .fromTo(el.querySelectorAll('[data-story="ledger"] [data-bar]'), { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.8, stagger: 0.12, ease }, '<')
        .fromTo(q('total'), { opacity: 0 }, { opacity: 1, duration: 0.5, ease }, '-=0.3')
      tl.current = t
      setPhase('playing')
    }).catch(() => { el.removeAttribute('data-armed') })   // GSAP failed to load: show the final frame
    return () => { dead = true; tl.current?.kill(); tl.current = null }
  }, [autoPlay])

  return (
    <div ref={root} data-armed="" className={cn('tape panel relative overflow-hidden', className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ui-rule px-4 py-3 sm:px-5">
        <span className="rounded-md bg-ui-overlay px-2 py-0.5 text-[12px] font-medium text-ui-ink">{order.symbol}</span>
        <span className="text-[13px] text-ui-ink">Market {side}, {order.quantity.toFixed(6)} {base}</span>
        <span className="text-[13px] tabular-nums text-ui-graphite">{order.createdAt.slice(0, 10)}</span>
        <ProvenanceChip dataSource="synthetic-demo" className="ml-auto" />
      </div>
      <div className="px-2 pt-3 sm:px-3">
        <Chart box={WIDE} narrow={false} />
        <Chart box={NARROW} narrow />
        <ul aria-label="Legend" className="flex flex-wrap gap-x-4 gap-y-1 px-3 pb-3 text-[11.5px] text-ui-graphite">
          <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-2.5 w-4 rounded-[2px] bg-[color-mix(in_srgb,var(--ui-measured)_16%,transparent)]" />Bid to ask</li>
          <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 rounded bg-ui-measured" />Mid</li>
          <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full bg-ui-graphite" />Print, buyer was the aggressor</li>
          <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-full border border-ui-graphite" />Print, seller was the aggressor</li>
          <li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rotate-45 rounded-[1px] bg-ui-action" />This order&rsquo;s fills</li>
        </ul>
      </div>
      <Ledger />
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-t border-ui-rule px-4 py-2 sm:px-5">
        <FiguresAndSources />
        <div className="flex items-center gap-1">
          {phase === 'playing' ? (
            <button type="button" onClick={() => tl.current?.progress(1)} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink">
              <SkipForward aria-hidden="true" className="size-3.5" /> Skip
            </button>
          ) : null}
          {phase === 'done' ? (
            <button type="button" onClick={() => { setPhase('playing'); tl.current?.restart() }} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink">
              <RotateCcw aria-hidden="true" className="size-3.5" /> Replay
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

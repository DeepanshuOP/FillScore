'use client'

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Button } from '../../ui/Button'
import { Disclosure } from '../../ui/Disclosure'
import { ProvenanceChip } from '../../ui/ProvenanceChip'
import { formatUsd, formatSignedBps } from '../../ui/format'
import { useGSAP, withMotion } from '../../lib/motion'
import { formatBps } from '../../utils/formatBps'
import { hueCss, RULER_SHARES } from '../../ui/hue'
import { bracketPriceSpan, linearScale, printRadius, rulerSegments, stepPath, sweepSeconds } from './geometry'
import { buildHeroTimeline, SWEEP_SECONDS } from './heroTimeline'
import inputs from '../fixtures/hero-order.inputs.json'
import replay from '../fixtures/hero-order.replay.json'

const tape = inputs.tape
const fig = Object.fromEntries(replay.decomposition.map((f) => [f.key, f])) as Record<string, { bps: number | null; usd: number | null; source: { field: string } }>
const ec = replay.expectedCost
const arrivalMid = inputs.measurement.arrivalMid as number
const fill = replay.fills[0]
const BPS_MAX = 16   // the ruler's scale; the total of this order is 14.8 bps

type Cfg = { W: number; H: number; plotL: number; plotR: number; plotT: number; plotB: number; bx: number[]; labelX: number; font: number; small: number
  rulerX0: number; rulerX1: number; totalY: number; expY: number; rulerY: number; rulerH: number; axisY: number; rows: number[]; narrow: boolean }

// rows: the y of the label of fees, impact and timing, spread (top to bottom), so no leader line crosses another label.
const WIDE: Cfg = { W: 960, H: 504, plotL: 64, plotR: 690, plotT: 40, plotB: 232, bx: [728, 758], labelX: 776, font: 14, small: 12.5,
  rulerX0: 64, rulerX1: 896, totalY: 316, expY: 344, rulerY: 362, rulerH: 22, axisY: 406, rows: [434, 458, 482], narrow: false }
// The phone layout is drawn in a 360 px box and shown at about 350 px, so 12 and 13 px type stays near 12 and 13 px.
const NARROW: Cfg = { W: 360, H: 540, plotL: 54, plotR: 226, plotT: 36, plotB: 224, bx: [248, 266], labelX: 276, font: 13, small: 12,
  rulerX0: 20, rulerX1: 340, totalY: 330, expY: 384, rulerY: 398, rulerH: 20, axisY: 438, rows: [464, 488, 512], narrow: true }
const ROW_OF: Record<string, number> = { fees: 0, impactTiming: 1, spread: 2 }

const prices = [...tape.prints.map((p) => p.price), ...tape.mid.map((m) => m.mid)]
const P_LO = Math.floor((Math.min(...prices) - 0.02) * 10) / 10
const P_HI = Math.ceil((Math.max(...prices) + 0.02) * 10) / 10
const TICKS = Array.from({ length: Math.round((P_HI - P_LO) * 10) + 1 }, (_, i) => Math.round((P_LO + i / 10) * 10) / 10)
const UTC = (iso: string) => iso.slice(11, 23)
const minus = (s: string) => s.replace('-', '−')
const val = (k: string) => `${formatBps(fig[k].bps)}, ${formatUsd(fig[k].usd)}`

function Chart({ c }: { c: Cfg }) {
  const t0 = Date.parse(tape.windowStart), t1 = Date.parse(tape.windowEnd)
  const x = linearScale(t0, t1, c.plotL, c.plotR)
  const y = linearScale(P_LO, P_HI, c.plotB, c.plotT)
  const at = (ts: number) => sweepSeconds(ts, t0, t1, SWEEP_SECONDS)
  const spreadSpan = bracketPriceSpan(fig.spread.bps as number, arrivalMid)
  const impactSpan = bracketPriceSpan(fig.impactTiming.bps as number, arrivalMid)
  const yMid = y(arrivalMid), ySpread = y(arrivalMid + spreadSpan), yFill = y(arrivalMid + spreadSpan + impactSpan)
  const [bx1, bx2] = c.bx
  const xFill = x(tape.fillMs)
  const delayS = ((tape.fillMs - tape.arrivalMs) / 1000).toFixed(1)
  const mids = tape.mid.map((m) => ({ t: m.ts, v: m.mid }))
  const segs = rulerSegments([{ key: 'spread', bps: fig.spread.bps }, { key: 'impactTiming', bps: fig.impactTiming.bps }, { key: 'fees', bps: fig.fees.bps }], c.rulerX0, c.rulerX1, BPS_MAX)
  const rx = linearScale(0, BPS_MAX, c.rulerX0, c.rulerX1)
  const total = fig.total.bps as number
  const names: Record<string, string> = { spread: 'Spread paid', impactTiming: 'Impact and timing', fees: 'Fees' }
  const bracket = (px: number, y1: number, y2: number) => `M${px - 6},${y1} H${px} V${y2} H${px - 6}`
  // A halo in the ground colour behind every label, so a line, a gridline or a dot never runs through its letters.
  const halo = { paintOrder: 'stroke', stroke: 'var(--ui-surface)', strokeWidth: 4, strokeLinejoin: 'round' } as const
  const tx = { fontSize: c.font, ...halo } as const
  const sm = { fontSize: c.small, ...halo } as const
  const expLo = ec && ec.lowBps !== null ? Math.max(0, ec.lowBps) : 0

  return (
    <svg viewBox={`0 0 ${c.W} ${c.H}`} role="img" aria-labelledby={`hero-t-${c.narrow ? 'n' : 'w'}`} className={c.narrow ? 'block h-auto w-full md:hidden' : 'hidden h-auto w-full md:block'} fontFamily="inherit">
      <title id={`hero-t-${c.narrow ? 'n' : 'w'}`}>{`Prices printed before and after one ${replay.order.type?.toLowerCase()} ${replay.order.side.toLowerCase()} order of ${replay.order.symbol}, the mid line, the fill at ${fill.price.toFixed(2)}, and the cost of the order split into spread, impact and timing, and fees.`}</title>
      {/* axes */}
      {TICKS.map((p) => (
        <g key={p}>
          <line x1={c.plotL} x2={c.plotR} y1={y(p)} y2={y(p)} className="stroke-ui-rule" strokeWidth={1} />
          <text x={c.plotL - 8} y={y(p) + 4} textAnchor="end" className="fill-ui-graphite" style={sm}>{p.toFixed(2)}</text>
        </g>
      ))}
      {[-4, -2, 0, 2].map((s) => (
        <text key={s} x={x(tape.arrivalMs + s * 1000)} y={c.plotB + 22} textAnchor="middle" className="fill-ui-graphite" style={sm}>{s === 0 ? 'placed' : s < 0 ? `−${-s} s` : `+${s} s`}</text>
      ))}
      {c.narrow ? null : <text x={c.plotL} y={c.plotT - 14} className="fill-ui-graphite" style={sm}>{`${replay.order.symbol} price`}</text>}

      {/* mid line, drawn with the sweep */}
      <path data-h="mid" data-draw d={stepPath(mids, t1, x, y)} pathLength={1} fill="none" className="stroke-ui-measured" strokeWidth={2.25} strokeLinejoin="round" />
      {/* prints: filled = the buyer was the aggressor, hollow = the seller was */}
      {tape.prints.map((p) => (
        <circle key={p.id} data-h="print" data-at={at(p.ts)} cx={x(p.ts)} cy={y(p.price)} r={printRadius(p.qty)}
          className={p.buyerInitiated ? 'fill-ui-graphite stroke-ui-graphite' : 'fill-ui-surface stroke-ui-graphite'} strokeWidth={1.5} />
      ))}
      {/* the sweep exists only while the animation plays: hidden in the static frame (no script, reduced motion) */}
      <line data-h="sweep" data-travel={c.plotR - c.plotL} x1={c.plotL} x2={c.plotL} y1={c.plotT} y2={c.plotB} className="stroke-ui-ink" strokeWidth={1} style={{ opacity: 0 }} />
      <text data-h="mid-label" data-at={0.4} x={c.plotL + 6} y={y(mids[0].v) - 13} className="fill-ui-measured" style={{ ...sm, fontWeight: 600 }}>Mid price</text>

      {/* what the marks mean */}
      <g aria-hidden="true" style={sm} className="fill-ui-graphite">
        {(c.narrow
          ? [[20, c.plotB + 44, 'dot'], [190, c.plotB + 44, 'ring'], [20, c.plotB + 66, 'line'], [190, c.plotB + 66, 'fill']]
          : [[c.plotL, c.plotB + 46, 'dot'], [c.plotL + 196, c.plotB + 46, 'ring'], [c.plotL + 392, c.plotB + 46, 'line'], [c.plotL + 508, c.plotB + 46, 'fill']]
        ).map(([lx, ly, kind]) => {
          const label = (c.narrow
            ? { dot: 'Buyer-initiated', ring: 'Seller-initiated', line: 'Mid price', fill: 'Fill' }
            : { dot: 'Buyer was the aggressor', ring: 'Seller was the aggressor', line: 'Mid price', fill: 'Fill' })[kind as string]
          return (
            <g key={kind as string}>
              {kind === 'dot' ? <circle cx={(lx as number) + 5} cy={(ly as number) - 4} r={4} className="fill-ui-graphite stroke-ui-graphite" /> : null}
              {kind === 'ring' ? <circle cx={(lx as number) + 5} cy={(ly as number) - 4} r={4} className="fill-ui-surface stroke-ui-graphite" strokeWidth={1.5} /> : null}
              {kind === 'line' ? <line x1={lx as number} x2={(lx as number) + 14} y1={(ly as number) - 4} y2={(ly as number) - 4} className="stroke-ui-measured" strokeWidth={2.25} /> : null}
              {kind === 'fill' ? <rect x={(lx as number) + 1} y={(ly as number) - 9} width={8} height={8} transform={`rotate(45 ${(lx as number) + 5} ${(ly as number) - 5})`} className="fill-ui-ink" stroke="none" /> : null}
              <text x={(lx as number) + 18} y={ly as number} className="fill-ui-graphite">{label}</text>
            </g>
          )
        })}
      </g>

      {/* arrival */}
      <g data-h="arrival" data-at={at(tape.arrivalMs)}>
        <line x1={x(tape.arrivalMs)} x2={x(tape.arrivalMs)} y1={c.plotT} y2={c.plotB} className="stroke-ui-ink" strokeWidth={1} strokeDasharray="4 4" />
        <circle cx={x(tape.arrivalMs)} cy={yMid} r={4.5} className="fill-ui-measured stroke-ui-surface" strokeWidth={1.5} />
        <text x={c.narrow ? 20 : x(tape.arrivalMs) - 8} y={c.plotT - 14} textAnchor={c.narrow ? 'start' : 'end'} className="fill-ui-ink" style={sm}>{`Order placed ${UTC(replay.order.createdAt)} UTC`}</text>
        {c.narrow ? (
          <>
            <text x={x(tape.arrivalMs) + 8} y={yMid + 34} className="fill-ui-ink" style={sm}>Mid then</text>
            <text x={x(tape.arrivalMs) + 8} y={yMid + 48} className="fill-ui-ink" style={sm}>{arrivalMid.toFixed(2)}</text>
          </>
        ) : <text x={x(tape.arrivalMs) + 10} y={yMid + 22} className="fill-ui-ink" style={sm}>{`Mid when placed ${arrivalMid.toFixed(2)}`}</text>}
      </g>
      {/* fill */}
      <g data-h="fill" data-at={at(tape.fillMs)}>
        <rect x={xFill - 6} y={yFill - 6} width={12} height={12} transform={`rotate(45 ${xFill} ${yFill})`} className="fill-ui-ink stroke-ui-surface" strokeWidth={1.5} />
        <text x={xFill} y={yFill - 14} textAnchor={c.narrow ? 'end' : 'middle'} className="fill-ui-ink" style={{ ...sm, fontWeight: 600 }}>{`Filled at ${fill.price.toFixed(2)}, ${delayS} s later`}</text>
      </g>

      {/* guides and brackets */}
      <g data-h="guide">
        {[yMid, ySpread, yFill].map((gy, i) => <line key={i} data-draw x1={xFill + 8} x2={bx2 + 4} y1={gy} y2={gy} pathLength={1} className="stroke-ui-edge" strokeWidth={1} />)}
      </g>
      <g data-h="bracket-spread">
        <path data-draw d={bracket(bx1, yMid, ySpread)} pathLength={1} fill="none" className="stroke-ui-measured" strokeWidth={2} />
        {(c.narrow
          ? [['Spread', 'ink'], [formatBps(fig.spread.bps), 'g'], [formatUsd(fig.spread.usd), 'g']]
          : [[names.spread, 'ink'], [val('spread'), 'g'], [`${arrivalMid.toFixed(2)} to ${(arrivalMid + spreadSpan).toFixed(2)}`, 'g']]
        ).map(([t, tone], i) => <text key={i} x={bx1 + 12} y={yMid + 18 + i * (c.small + 3)} className={tone === 'ink' ? 'fill-ui-ink' : 'fill-ui-graphite'} style={sm}>{t}</text>)}
      </g>
      <g data-h="bracket-impact">
        <path data-draw d={bracket(bx2, ySpread, yFill)} pathLength={1} fill="none" className="stroke-ui-measured" strokeWidth={2} />
        {(c.narrow
          ? [['Impact', 'ink'], [formatBps(fig.impactTiming.bps), 'g'], [formatUsd(fig.impactTiming.usd), 'g']]
          : [[names.impactTiming, 'ink'], [val('impactTiming'), 'g'], [`${(arrivalMid + spreadSpan).toFixed(2)} to ${(arrivalMid + spreadSpan + impactSpan).toFixed(2)}`, 'g']]
        ).map(([t, tone], i) => <text key={i} x={bx2 + 12} y={(ySpread + yFill) / 2 - 10 + i * (c.small + 3)} className={tone === 'ink' ? 'fill-ui-ink' : 'fill-ui-graphite'} style={sm}>{t}</text>)}
      </g>

      {/* cost ruler: terms end to end on one bps scale */}
      <g data-h="ruler-axis">
        {[0, 15].map((b) => (   // only the two labelled ends: an unlabelled tick reads as a measurement
          <line key={b} x1={rx(b)} x2={rx(b)} y1={c.rulerY + c.rulerH} y2={c.rulerY + c.rulerH + 5} className="stroke-ui-edge" />
        ))}
        <text x={rx(0)} y={c.rulerY + c.rulerH + 20} className="fill-ui-graphite" style={sm}>0</text>
        <text x={rx(15)} y={c.rulerY + c.rulerH + 20} textAnchor="middle" className="fill-ui-graphite" style={sm}>15 bps</text>
      </g>
      {segs.map((s, i) => {
        const key = s.key === 'impactTiming' ? 'ruler-impact' : s.key === 'spread' ? 'ruler-spread' : 'ruler-fees'
        const row = c.rows[ROW_OF[s.key]]
        const midX = s.x + s.width / 2
        const label = `${names[s.key]} ${val(s.key)}`
        const labelX = Math.min(midX - 3, c.W - 12 - label.length * (c.font * 0.56))
        return (
          <g key={s.key} data-h={key}>
            <rect data-grow x={s.x} y={c.rulerY} width={s.width} height={c.rulerH} className="stroke-ui-surface" strokeWidth={1}
              style={{ fill: hueCss(RULER_SHARES[i]) }} />
            <line x1={midX} x2={midX} y1={c.rulerY + c.rulerH + 8} y2={row - 12} className="stroke-ui-edge" strokeWidth={1} />
            <text x={labelX} y={row} className="fill-ui-ink" style={tx}>{label}</text>
          </g>
        )
      })}
      <g data-h="total">
        <path data-draw d={`M${rx(0)},${c.totalY + 6} V${c.totalY} H${rx(total)} V${c.totalY + 6}`} pathLength={1} fill="none" className="stroke-ui-ink" strokeWidth={1.5} />
        <text x={rx(total)} y={c.totalY - 8} textAnchor="end" className="fill-ui-ink" style={{ ...tx, fontWeight: 600 }}>{`All in ${val('total')}`}</text>
      </g>
      {ec && ec.expectedBps !== null && ec.lowBps !== null && ec.highBps !== null ? (
        <g data-h="expected">
          <path data-draw d={`M${rx(expLo)},${c.expY - 5} V${c.expY + 5} M${rx(expLo)},${c.expY} H${rx(ec.highBps)} M${rx(ec.highBps)},${c.expY - 5} V${c.expY + 5}`} pathLength={1} fill="none" className="stroke-ui-ink" strokeWidth={1.5} />
          <circle cx={rx(ec.expectedBps)} cy={c.expY} r={3.5} className="fill-ui-ink" />
          {c.narrow ? (
            <>
              <text x={c.rulerX0} y={c.expY - 28} className="fill-ui-ink" style={sm}>{`Expected execution cost ${formatBps(ec.expectedBps)},`}</text>
              <text x={c.rulerX0} y={c.expY - 14} className="fill-ui-ink" style={sm}>{`${Math.round((ec.level ?? 0.9) * 100)}% interval ${formatSignedBps(ec.lowBps)} to ${formatBps(ec.highBps)}`}</text>
            </>
          ) : (
            <text x={rx(ec.highBps) + 14} y={c.expY + 5} className="fill-ui-ink" style={sm}>{`Expected execution cost ${formatBps(ec.expectedBps)}, ${Math.round((ec.level ?? 0.9) * 100)}% interval ${formatSignedBps(ec.lowBps)} to ${formatBps(ec.highBps)}`}</text>
          )}
        </g>
      ) : null}
    </svg>
  )
}

function compare(exec: number, lo: number, hi: number) {
  return exec > hi ? 'above' : exec < lo ? 'below' : 'inside'
}

/**
 * The hero prototype for the landing page: one real demo order, measured. Prints, the mid line, the fill, then the
 * spread and impact brackets and the cost ruler, each value written from the replay data (the output of
 * buildOrderReplay for this order). At most 8 s, skippable, ends on a static readable frame; with reduced motion the
 * final frame is shown and nothing moves. `freezeAt` (0 to 1) stops the timeline at that progress: used for the
 * screenshots of the lab, never in a product page.
 */
export function Hero({ freezeAt }: { freezeAt?: number }) {
  const root = useRef<HTMLDivElement>(null)
  const tl = useRef<gsap.core.Timeline | null>(null)
  const [state, setState] = useState<'static' | 'playing' | 'done'>('static')

  useGSAP(() => withMotion(root.current, () => {
    const t = buildHeroTimeline(root.current!, () => setState('done'))
    tl.current = t
    if (freezeAt !== undefined) { t.pause(); t.progress(freezeAt); setState(freezeAt >= 1 ? 'done' : 'playing'); return }   // the controls show in the frozen stills too
    setState('playing')
    return () => { t.kill() }
  }), { scope: root, dependencies: [freezeAt] })

  const exec = fig.execution.bps as number
  const rel = ec && ec.lowBps !== null && ec.highBps !== null ? compare(exec, ec.lowBps, ec.highBps) : null

  return (
    <section ref={root} aria-labelledby="hero-title" className="border-t border-ui-rule pt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <h2 id="hero-title" className="max-w-[18ch] text-[1.75rem] leading-9 font-semibold text-balance text-ui-ink sm:text-[2.5rem] sm:leading-[1.15]">One order, measured</h2>
        <ProvenanceChip dataSource="synthetic-demo" />
      </div>
      <p className="mt-3 max-w-[68ch] text-ui-graphite">
        {`A ${replay.order.side.toLowerCase()} of ${replay.order.quantity.toFixed(3)} ${replay.order.symbol.replace('USDT', '')} at market, placed ${UTC(replay.order.createdAt)} UTC on ${replay.order.createdAt.slice(0, 10)} and filled at ${fill.price.toFixed(2)}. `}
        The prices are the exchange&rsquo;s own public prints; the trader is synthetic.
      </p>
      <div className="mt-6"><Chart c={WIDE} /><Chart c={NARROW} /></div>
      <p data-h="closing" className="mt-4 max-w-[68ch] text-ui-ink">
        {`In all the order cost ${formatBps(fig.total.bps)} (${formatUsd(fig.total.usd)}): ${formatBps(fig.spread.bps)} for the spread, ${formatBps(fig.impactTiming.bps)} for impact and timing, and ${formatBps(fig.fees.bps)} in fees.`}
        {rel && ec && ec.expectedBps !== null && ec.lowBps !== null && ec.highBps !== null
          ? ` Its execution cost, ${formatBps(exec)}, was ${rel} the interval of ${formatSignedBps(ec.lowBps)} to ${formatBps(ec.highBps)} around the expected ${formatBps(ec.expectedBps)}.` : ''}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        {state === 'playing' ? <Button variant="secondary" onClick={() => tl.current?.progress(1)}>Skip the animation</Button> : null}
        {state === 'done' ? <Button variant="secondary" onClick={() => { setState('playing'); tl.current?.restart() }}>Play again</Button> : null}
        <Link href="/methodology" className="text-sm text-ui-ink underline">How this was measured</Link>
      </div>
      <Disclosure summary="Figures and sources behind this drawing" className="mt-6">
        <table className="w-full max-w-xl text-sm">
          <caption className="sr-only">Cost terms of the order</caption>
          <thead><tr><th scope="col" className="py-1 text-left font-medium text-ui-graphite">Term</th><th scope="col" className="py-1 text-right font-medium text-ui-graphite">bps</th><th scope="col" className="py-1 text-right font-medium text-ui-graphite">USD</th></tr></thead>
          <tbody>{replay.decomposition.map((f) => (
            <tr key={f.key} className="border-t border-ui-rule"><th scope="row" className="py-1 text-left font-normal text-ui-ink">{f.label}</th>
              <td className="py-1 text-right tabular-nums text-ui-ink">{f.bps === null ? 'not computed' : minus(f.bps.toFixed(3))}</td>
              <td className="py-1 text-right tabular-nums text-ui-ink">{formatUsd(f.usd)}</td></tr>
          ))}</tbody>
        </table>
        <ul className="mt-3 list-none space-y-1">
          {replay.notes.map((n) => <li key={n}>{n}</li>)}
          {replay.sources.map((s) => <li key={s.sha256}>{`${s.label}; SHA-256 `}<code className="font-[family-name:var(--ui-mono)] text-[0.8125rem] break-all text-ui-ink">{s.sha256}</code></li>)}
        </ul>
      </Disclosure>
    </section>
  )
}

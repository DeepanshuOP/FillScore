'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { startPinnedStory } from '../../../components/marketing/v3/pinnedStory'
import { formatPct, formatSignedBps, formatUsd, heroCosts, heroEntries, heroTape, utcTime } from '../data'
import { Cols, GridBar } from './GridBar'

const ROWS = [
  { k: 'spread', label: 'Spread paid', t: heroCosts.spread, src: 'quote at arrival' },
  { k: 'impact', label: 'Impact and timing', t: heroCosts.impactTiming, src: 'arrival to last fill' },
  { k: 'unfilled', label: 'Unfilled part', t: heroCosts.unfilled, src: 'all filled' },
  { k: 'fees', label: 'Fees', t: heroCosts.fees, src: 'the account’s taker rate' },
] as const

/**
 * Landing hero, direction 2. The order's cost set as the image ($0.25, cropped by the top edge), the 38 real prints as
 * a tick field on the twelve-column sheet, and a ledger whose lines the highlighter marks as the scroll story measures
 * each part: the quote at arrival (spread), arrival to the last fill (impact and timing), the fills (fees), the total.
 */
export function GridHero() {
  const root = useRef<HTMLElement>(null)
  const field = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const entries = useMemo(() => heroEntries(), [])
  useEffect(() => {
    const el = field.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const H = 170
  const t0 = entries[0].ts, t1 = entries[entries.length - 1].ts
  const prices = entries.flatMap((e) => (e.kind === 'quote' ? [e.bid, e.ask] : [e.price]))
  const lo = Math.min(...prices), hi = Math.max(...prices)
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w
  const y = (p: number) => 18 + (1 - (p - lo) / (hi - lo)) * (H - 50)
  const quote = entries.find((e) => e.kind === 'quote')!
  const fills = entries.filter((e) => e.kind === 'fill')
  const xa = x(quote.ts), xf = x(fills[fills.length - 1].ts)

  useEffect(() => {
    if (!w || !root.current) return
    return startPinnedStory({
      root: root.current,
      distance: 1500,
      build: (tl) => {
        const q = (s: string) => root.current!.querySelectorAll(s)
        tl.from(q('.g-field .tk'), { y: 40, opacity: 0, duration: 0.22, stagger: { each: 0.004, from: 'start' } }, 0)
        tl.from(q('[data-sweep="spread"]'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.1 }, 0.3)
        tl.fromTo(q('[data-row="spread"] .hl'), { '--hl': '0%' }, { '--hl': '100%', duration:0.08 }, 0.34)
        tl.from(q('[data-sweep="impact"]'), { scaleX: 0, transformOrigin: '0% 50%', duration: 0.14 }, 0.44)
        tl.fromTo(q('[data-row="impact"] .hl'), { '--hl': '0%' }, { '--hl': '100%', duration:0.08 }, 0.52)
        tl.fromTo(q('[data-row="unfilled"] .hl'), { '--hl': '0%' }, { '--hl': '100%', duration:0.08 }, 0.6)
        tl.from(q('.g-field .fillbar'), { scaleY: 0, transformOrigin: '50% 100%', duration: 0.08, stagger: 0.03 }, 0.66)
        tl.fromTo(q('[data-row="fees"] .hl'), { '--hl': '0%' }, { '--hl': '100%', duration:0.08 }, 0.72)
        tl.fromTo(q('[data-row="total"] .hl'), { '--hl': '0%' }, { '--hl': '100%', duration:0.1 }, 0.84)
        tl.to({}, { duration: 0.04 }, 0.96)
      },
    })
  }, [w])

  return (
    <section ref={root} className="g-hero" aria-label="FillScore">
      <Cols />
      <div className="g-wrap g-topbar"><GridBar /></div>
      <p className="g-giant" aria-hidden>{formatUsd(heroCosts.total.usd)}</p>
      <p className="g-cap">
        One {heroTape.side.toLowerCase()} order, {heroTape.symbol}, 28 January 2024, {utcTime(quote.ts)} UTC. It paid {formatUsd(heroCosts.total.usd)}; fees were {formatPct(heroCosts.feeShare)} of it.
        Synthetic demo trader, real Binance prints (sha256 {heroTape.sourceSha256.slice(0, 12)}).
      </p>
      <div ref={field} className="g-field">
        {w > 0 && (
          <svg role="img" aria-label={`${entries.filter((e) => e.kind === 'print').length} public prints from ${utcTime(t0)} to ${utcTime(t1)} UTC, with the order's arrival and its fills`}>
            <rect data-sweep="impact" className="g-sweep" x={xa} y={H - 40} width={Math.max(2, xf - xa)} height={7} style={{ opacity: 1 }} />
            <rect data-sweep="spread" className="g-sweep" x={xa - 5} y={y(quote.ask) - 9} width={10} height={y(quote.bid) - y(quote.ask) + 18} style={{ opacity: 1 }} />
            {entries.map((e, i) => e.kind === 'print'
              ? <line key={i} className={`tk${e.buyerInitiated ? ' buy' : ''}`} x1={x(e.ts)} x2={x(e.ts)} y1={y(e.price) - 7} y2={y(e.price) + 7} />
              : null)}
            {fills.map((f, i) => f.kind === 'fill' && <rect key={i} className="fillbar" x={x(f.ts) - 3} y={y(f.price) - 14} width={6} height={28} />)}
            <line className="midl" x1={xa} x2={xa} y1={0} y2={H - 30} />
            <text className="lbl hi" x={xa + 6} y={H - 14}>arrival {utcTime(quote.ts)}</text>
            <text className="lbl" x={0} y={H - 14}>{utcTime(t0)}</text>
            <text className="lbl" x={w} y={H - 14} textAnchor="end">{utcTime(t1)}</text>
          </svg>
        )}
      </div>
      <div className="g-ledger">
        {ROWS.map((r, i) => (
          <div key={r.k} className="g-row" data-row={r.k}>
            <span className="ix">{String(i + 1).padStart(2, '0')}</span>
            <span className={`lab${i % 2 ? ' ind' : ''}`}>{r.label}</span>
            <span className="src">{r.src}</span>
            <span className="bps">{formatSignedBps(r.t.bps)}</span>
            <span className="usd"><span className="hl">{formatUsd(r.t.usd)}</span></span>
          </div>
        ))}
        <div className="g-row total" data-row="total">
          <span className="ix">=</span><span className="lab">Total</span><span className="src">measured, order basis</span>
          <span className="bps">{formatSignedBps(heroCosts.total.bps)}</span>
          <span className="usd"><span className="hl">{formatUsd(heroCosts.total.usd)}</span></span>
        </div>
      </div>
      <div className="g-lede">
        <h1 style={{ fontSize: 30, fontWeight: 800, fontStretch: '112%', letterSpacing: '-0.025em', lineHeight: 1.02, margin: '0 0 14px' }}>Every fill, held against the public tape.</h1>
        <p>FillScore reads your exchange history with a read-only key, measures each fill against the exchange&apos;s own public prints, and writes down what it cost. It grades the past; it does not predict or advise.</p>
        <div className="g-actions">
          <a className="g-btn" href="/design-lab/v3/grid/overview">Open the demo audit</a>
          <a className="g-btn quiet" href="#verify">Check a signed pack</a>
        </div>
      </div>
    </section>
  )
}

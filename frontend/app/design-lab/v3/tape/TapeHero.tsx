'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { startPinnedStory } from '../../../components/marketing/v3/pinnedStory'
import { formatPct, formatPrice, formatQty, formatSignedBps, formatUsd, heroCosts, heroEntries, heroTape, utcTime } from '../data'
import { bracketPath, circlePath, underlinePath } from '../../../ui/pen'
import { ThemeToggle } from '../ThemeScope'

interface Geo {
  H: number
  stopX: number
  startX: number
  paths: { spread: string; impact: string; fee: string[]; total: string }
  notes: { spread: [number, number]; impact: [number, number]; fee: [number, number]; total: [number, number] }
}

const MARGIN_NOTES = [
  { k: 'spread', title: 'Spread', usd: heroCosts.spread.usd, bps: heroCosts.spread.bps },
  { k: 'impact', title: 'Impact and timing', usd: heroCosts.impactTiming.usd, bps: heroCosts.impactTiming.bps },
  { k: 'fee', title: 'Fees', usd: heroCosts.fees.usd, bps: heroCosts.fees.bps },
] as const

/**
 * Landing hero, direction 1. A ticker tape of the 38 real BTCUSDT prints of 28 January 2024 (20:41:36 to 20:41:43 UTC)
 * with the quote at the order's arrival and the order's two fills printed into it. The tape feeds on load and, scrubbed
 * by scroll, slows and stops on the order; the orange pen then brackets the spread and the impact, circles the fills
 * (the fees) and writes the measured amounts in the margin. Every amount is the production replay's.
 */
export function TapeHero() {
  const entries = useMemo(() => heroEntries(), [])
  const root = useRef<HTMLElement>(null)
  const strip = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Geo | null>(null)

  // Measure the printed entries once fonts have loaded, then place the pen strokes and notes in tape coordinates.
  useLayoutEffect(() => {
    let live = true
    const measure = () => {
      const s = strip.current
      if (!s || !live) return
      const box = (sel: string) => {
        const el = s.querySelector<HTMLElement>(sel)
        return el ? { l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth } : { l: 0, r: 0 }
      }
      const H = s.offsetHeight
      const q = box('[data-kind="quote"]')
      const fills = [...s.querySelectorAll<HTMLElement>('[data-kind="fill"]')].map((el) => ({ l: el.offsetLeft, r: el.offsetLeft + el.offsetWidth }))
      const last = fills[fills.length - 1]
      const vw = s.parentElement?.parentElement?.clientWidth ?? window.innerWidth
      const phone = vw < 768
      // Stop with the span quote..last fill a little left of centre, so the total note fits on the right; on a phone,
      // with the two circled fills centred (the notes are listed under the tape there).
      const stopX = phone ? -((fills[0].l + last.r) / 2 - vw * 0.5) : -((q.l + last.r) / 2 - vw * 0.42)
      setGeo({
        H, stopX, startX: phone ? 40 : vw * 0.35,
        paths: {
          spread: bracketPath(q.l + 10, q.r - 10, H + 12, 8, 11),
          impact: bracketPath(q.l + 4, last.r - 4, H + 74, 9, 23),
          fee: fills.map((f, i) => circlePath(f.l + 2, 8, f.r - f.l - 4, H - 16, 31 + i)),
          total: underlinePath(last.r + 34, last.r + 214, H + 64, 47),
        },
        notes: {
          spread: [q.l + 10, H + 24],
          impact: [(q.l + last.r) / 2 - 80, H + 88],
          fee: [fills[0].l - 6, -64],
          total: [last.r + 34, H + 4],
        },
      })
    }
    void document.fonts.ready.then(measure)
    window.addEventListener('resize', measure)
    return () => { live = false; window.removeEventListener('resize', measure) }
  }, [])

  // The scroll story. Default DOM = final frame; this only rewinds it when motion is allowed.
  useEffect(() => {
    if (!geo || !root.current || !strip.current) return
    const s = strip.current
    s.style.transform = `translate3d(${geo.stopX}px,0,0)`
    let x0 = geo.startX
    return startPinnedStory({
      root: root.current,
      distance: 1700,
      build: (tl, gsap) => {
        const g = (sel: string) => root.current!.querySelectorAll(sel)
        tl.addLabel('stop', 0.45)
        tl.fromTo(g('[data-kind="print"]'), { opacity: 1 }, { opacity: 0.38, duration: 0.08 }, 0.42)
        tl.from(g('[data-pen="spread"]'), { drawSVG: 0, duration: 0.1 }, 0.5)
        tl.from(g('[data-note="spread"]'), { clipPath: 'inset(0 100% 0 0)', duration: 0.08 }, 0.55)
        tl.from(g('[data-pen="impact"]'), { drawSVG: 0, duration: 0.12 }, 0.62)
        tl.from(g('[data-note="impact"]'), { clipPath: 'inset(0 100% 0 0)', duration: 0.08 }, 0.68)
        tl.from(g('[data-pen="fee"]'), { drawSVG: 0, duration: 0.1, stagger: 0.03 }, 0.74)
        tl.from(g('[data-note="fee"]'), { clipPath: 'inset(0 100% 0 0)', duration: 0.08 }, 0.8)
        tl.from(g('[data-note="total"]'), { clipPath: 'inset(0 100% 0 0)', duration: 0.08 }, 0.87)
        tl.from(g('[data-pen="total"]'), { drawSVG: 0, duration: 0.08 }, 0.92)
        tl.to({}, { duration: 0.04 }, 0.96)
        void gsap
      },
      // The tape's free feed: it reads right to left at a ticker's pace and eases to rest on the order by itself; the
      // scroll (first 45%) pulls it to the stop faster. x = lerp(free(t), stop, ease(scroll)).
      tick: (p, t) => {
        const span = geo.startX - geo.stopX
        const free = geo.startX - span * (1 - Math.pow(1 - Math.min(1, t / 26), 2.2))
        const k = Math.min(1, p / 0.45)
        const e = 1 - Math.pow(1 - k, 3)
        x0 = free + (geo.stopX - free) * e
        s.style.transform = `translate3d(${x0.toFixed(1)}px,0,0)`
      },
    })
  }, [geo])

  const total = heroCosts.total
  return (
    <section ref={root} className="t-hero" aria-label="FillScore">
      <header className="t-bar">
        <Link href="/design-lab/v3/tape/hero" className="t-mark" aria-label="FillScore home">FillScore<i aria-hidden /></Link>
        <nav className="t-nav" aria-label="Main">
          <a href="#method">Method</a>
          <a href="#verify">Verify a pack</a>
          <a href="#demo">Demo audit</a>
        </nav>
        <div className="t-bar-r">
          <ThemeToggle className="t-toggle" />
          <a className="t-btn quiet" href="#signin">Sign in</a>
        </div>
      </header>

      <div className="t-stage">
        <div className="t-strip-viewport">
          <div ref={strip} className="t-strip" role="img"
            aria-label={`Ticker tape: ${entries.filter((e) => e.kind === 'print').length} public BTCUSDT prints from Binance, 28 January 2024, with the order's arrival quote and its two fills.`}
            style={{ width: 'max-content', transform: geo ? `translate3d(${geo.stopX}px,0,0)` : undefined }}>
            {entries.map((e, i) => (
              <div key={i} className="t-e" data-kind={e.kind} data-dim={e.kind === 'print'} aria-hidden>
                {e.kind === 'print' && (<><div className="p">{formatPrice(e.price)}</div><div className="q">{formatQty(e.qty)} {e.buyerInitiated ? 'B' : 'S'}</div><div className="t">{utcTime(e.ts)}</div></>)}
                {e.kind === 'quote' && (<><span className="tag">ARRIVAL</span><div className="p">{formatPrice(e.bid)} / {formatPrice(e.ask)}</div><div className="t">{utcTime(e.ts)}</div></>)}
                {e.kind === 'fill' && (<><span className="tag">FILL {e.n} OF {e.of}</span><div className="p">{formatPrice(e.price)}</div><div className="q">{formatQty(e.qty)} SELL</div><div className="t">{utcTime(e.ts)}</div></>)}
              </div>
            ))}
            {geo && (
              <svg className="t-pen" width="10" height="10" aria-hidden>
                <path data-pen="spread" d={geo.paths.spread} />
                <path data-pen="impact" d={geo.paths.impact} />
                {geo.paths.fee.map((d, i) => <path key={i} data-pen="fee" d={d} />)}
                <path data-pen="total" d={geo.paths.total} />
              </svg>
            )}
            {geo && MARGIN_NOTES.map((n) => (
              <div key={n.k} className="t-note" data-note={n.k} style={{ left: geo.notes[n.k][0], top: geo.notes[n.k][1] }}>
                {n.title} {formatUsd(n.usd)}<small>{formatSignedBps(n.bps)}</small>
              </div>
            ))}
            {geo && (
              <div className="t-note total" data-note="total" style={{ left: geo.notes.total[0], top: geo.notes.total[1] }}>
                Total {formatUsd(total.usd)}
                <small>{formatSignedBps(total.bps)}; fees were {formatPct(heroCosts.feeShare)} of it</small>
              </div>
            )}
          </div>
        </div>
        <dl className="t-notes-list" aria-label="What the order cost">
          <dt>Spread</dt><dd>{formatUsd(heroCosts.spread.usd)}</dd>
          <dt>Impact and timing</dt><dd>{formatUsd(heroCosts.impactTiming.usd)}</dd>
          <dt>Fees</dt><dd>{formatUsd(heroCosts.fees.usd)}</dd>
          <dt className="tot">Total</dt><dd className="tot">{formatUsd(total.usd)}, {formatSignedBps(total.bps)}</dd>
        </dl>
        <p className="t-proof">
          {heroTape.symbol} on Binance, 28 January 2024, {utcTime(entries[0].ts)} to {utcTime(entries[entries.length - 1].ts)} UTC.
          {' '}{entries.filter((e) => e.kind === 'print').length} public prints from the daily trades file (sha256 {heroTape.sourceSha256.slice(0, 12)}).
          {' '}The {heroTape.side.toLowerCase()} order is a synthetic demo trader&apos;s; the prices are real.
        </p>
      </div>

      <div className="t-copy">
        <h1 className="t-h1">Every fill, held to the tape.</h1>
        <div>
          <p className="t-lede">FillScore reads your exchange history with a read-only key, holds each fill against the exchange&apos;s own public prints, and writes down what it cost. It grades the past. It does not predict or advise.</p>
          <div className="t-actions">
            <a className="t-btn" href="/design-lab/v3/tape/overview">Open the demo audit</a>
            <a className="t-btn quiet" href="#verify">Check a signed pack</a>
          </div>
        </div>
      </div>
    </section>
  )
}

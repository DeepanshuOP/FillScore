'use client'

import { useEffect, useRef, type CSSProperties } from 'react'
import Link from 'next/link'
import { buttonClass } from '../../ui/buttonClass'
import { MarginNote } from '../../ui/MarginNote'
import { formatPct, formatPrice, formatQty, formatSignedBps, formatUsd, heroCosts, heroEntries, heroTape, utcTime } from '../../lib/landing/heroData'
import { heroGeometry, type HeroGeo, type LayoutName } from './heroGeometry'
import { startPinnedStory } from './v3/pinnedStory'
import { DEMO_ENTRY } from './siteItems'
import { PenNib } from './PenNib'

/** The order's day, from the fixture the tape is cut from (the day of its prints and of the order itself, UTC): "Jan 28, 2024". */
const TAPE_DAY = new Date(`${heroTape.date}T00:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

const ENTRIES = heroEntries()
const GEO: Record<LayoutName, HeroGeo> = { desk: heroGeometry(ENTRIES, 'desk'), phone: heroGeometry(ENTRIES, 'phone') }
const PRINTS = ENTRIES.filter((e) => e.kind === 'print').length
const NOTES = [
  { k: 'spread', title: 'Spread', usd: heroCosts.spread.usd, bps: heroCosts.spread.bps },
  { k: 'impact', title: 'Impact and timing', usd: heroCosts.impactTiming.usd, bps: heroCosts.impactTiming.bps },
  { k: 'fee', title: 'Fees', usd: heroCosts.fees.usd, bps: heroCosts.fees.bps },
] as const

/** The pen's marks, leaders and notes for one layout, in tape coordinates (they travel with the tape). */
function Annotations({ g, name }: { g: HeroGeo; name: LayoutName }) {
  return (
    <div className={name === 'desk' ? 'max-md:hidden' : 'md:hidden'}>
      <svg className="fs-hero-pen" width="10" height="10" aria-hidden="true">
        {name === 'desk' ? <path data-story data-pen="spread" d={g.marks.spread} /> : null}
        {name === 'desk' ? <path data-story data-pen="impact" d={g.marks.impact} /> : null}
        {g.marks.fee.map((d, i) => <path key={i} data-story data-pen="fee" d={d} />)}
        {name === 'desk' ? <path data-story data-leader="spread" d={g.leaders.spread} /> : null}
        {name === 'desk' ? <path data-story data-leader="impact" d={g.leaders.impact} /> : null}
        <path data-story data-leader="fee" d={g.leaders.fee} />
      </svg>
      {NOTES.filter((n) => name === 'desk' || n.k === 'fee').map((n) => (
        <div key={n.k} className="fs-hero-note" data-story data-note={n.k} aria-hidden="true" style={{ left: g.notes[n.k][0], top: g.notes[n.k][1] }}>
          {n.title} {formatUsd(n.usd)}<small>{formatSignedBps(n.bps)}</small>
        </div>
      ))}
    </div>
  )
}

/**
 * The landing hero (design v3). The first viewport holds the headline (bottom-left, editorial scale), the ticker tape of
 * the 38 real BTCUSDT prints running full-bleed and feeding from frame 0, and the call to action. Scrolled (pinned,
 * GSAP ScrollTrigger; Lenis from LandingMotion), the tape slows and stops on the order; the pen brackets the arrival
 * quote (spread), brackets arrival to last fill (impact and timing) and circles the two fills (fees), and writes each
 * measured amount beside its mark, tied to it by a hand-drawn leader. Every amount is the production replay's.
 * The server renders the finished frame (heroGeometry.ts); motion only rewinds it.
 */
export function TapeHero() {
  const root = useRef<HTMLElement>(null)
  const strip = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = root.current, s = strip.current
    if (!el || !s || !document.documentElement.classList.contains('fs-js')) return
    const phone = () => el.clientWidth < 768
    const startX = () => -40   // full-bleed from frame 0: the tape already covers the width and feeds right to left (landing.css)
    const stopX = () => { const g = GEO[phone() ? 'phone' : 'desk']; return el.clientWidth * g.stopShare - g.centre }
    return startPinnedStory({
      root: el,
      distance: phone() ? 1100 : 1500,
      build: (tl) => {
        const g = (sel: string) => el.querySelectorAll(sel)
        const draw = (sel: string, at: number, d = 0.08) => tl.fromTo(g(sel), { opacity: 1, drawSVG: '0%' }, { opacity: 1, drawSVG: '100%', duration: d, stagger: 0.02 }, at)
        const write = (sel: string, at: number) => tl.fromTo(g(sel), { opacity: 1, clipPath: 'inset(-20% 100% -20% -5%)' }, { opacity: 1, clipPath: 'inset(-20% -5% -20% -5%)', duration: 0.07 }, at)
        tl.fromTo(g('[data-kind="print"]'), { opacity: 1 }, { opacity: 0.38, duration: 0.08 }, 0.42)
        if (phone()) {
          // a phone shows only the fee circles and their note: they draw right after the tape stops, no dead stretch
          draw('[data-pen="fee"]', 0.5, 0.14); draw('[data-leader="fee"]', 0.66, 0.06); write('[data-note="fee"]', 0.72)
        } else {
          // every mark, leader and note is written by 0.86 of the pin, so the last stretch holds the finished frame
          draw('[data-pen="spread"]', 0.47); draw('[data-leader="spread"]', 0.53, 0.03); write('[data-note="spread"]', 0.55)
          draw('[data-pen="impact"]', 0.6, 0.08); draw('[data-leader="impact"]', 0.67, 0.03); write('[data-note="impact"]', 0.69)
          draw('[data-pen="fee"]', 0.74); draw('[data-leader="fee"]', 0.81, 0.03); write('[data-note="fee"]', 0.83)
        }
        tl.to({}, { duration: 0.03 }, 0.99)
      },
      // The tape's free feed: it reads right to left at a ticker's pace and eases to rest on the order by itself; the scroll
      // (first 45%) pulls it to the stop faster. x = lerp(free(t), stop, ease(scroll)).
      tick: (p, t) => {
        const a = startX(), b = stopX()
        const free = a - (a - b) * (1 - Math.pow(1 - Math.min(1, t / 24), 2.2))
        const k = Math.min(1, p / 0.45)
        const x = free + (b - free) * (1 - Math.pow(1 - k, 3))
        s.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`
      },
    })
  }, [])

  const vars = { '--stop-d': `${GEO.desk.centre}px`, '--stop-p': `${GEO.phone.centre}px` } as CSSProperties
  return (
    <section ref={root} className="fs-hero" aria-labelledby="hero-title">
      <div aria-hidden="true" />
      <div className="fs-hero-stage">
        {/* printed on the tape's paper: which order this is and where it comes from; the dots are drawn by CSS (landing.css) */}
        <PenNib />
        <p className="fs-tape-label" data-testid="tape-label"><span>One demo order</span><span>{TAPE_DAY}</span><span>synthetic trader, real prices</span></p>
        <div className="fs-hero-viewport">
          <div ref={strip} className="fs-hero-strip fs-strip fs-sprockets" role="img" style={vars}
            aria-label={`Ticker tape: ${PRINTS} public ${heroTape.symbol} prints from Binance, 28 January 2024, with the order's arrival quote and its two fills. Spread ${formatUsd(heroCosts.spread.usd)}, impact and timing ${formatUsd(heroCosts.impactTiming.usd)}, fees ${formatUsd(heroCosts.fees.usd)}. The order is a synthetic trader's; the prices are real.`}>
            {ENTRIES.map((e, i) => (
              <div key={i} className="fs-e" data-kind={e.kind} data-dim={e.kind === 'print'} aria-hidden="true">
                {e.kind === 'print' && (<><div className="p">{formatPrice(e.price)}</div><div className="q">{formatQty(e.qty)} <span className="fs-side" data-buy={e.buyerInitiated} /></div><div className="t">{utcTime(e.ts)}</div></>)}
                {e.kind === 'quote' && (<><span className="tag">ARRIVAL</span><div className="p">{formatPrice(e.bid)} / {formatPrice(e.ask)}</div><div className="t">{utcTime(e.ts)}</div></>)}
                {e.kind === 'fill' && (<><span className="tag">FILL {e.n}</span><div className="p">{formatPrice(e.price)}</div><div className="q">{formatQty(e.qty)} {heroTape.side}</div><div className="t">{utcTime(e.ts)}</div></>)}
              </div>
            ))}
            <Annotations g={GEO.desk} name="desk" />
            <Annotations g={GEO.phone} name="phone" />
          </div>
        </div>
        <dl className="fs-hero-list" aria-hidden="true">
          <dt>SPREAD</dt><dd>{formatUsd(heroCosts.spread.usd)}</dd>
          <dt>IMPACT AND TIMING</dt><dd>{formatUsd(heroCosts.impactTiming.usd)}</dd>
          <dt>FEES</dt><dd>{formatUsd(heroCosts.fees.usd)}</dd>
          <dt className="col-span-2 mt-1">SYNTHETIC TRADER, REAL PRICES</dt>
        </dl>
      </div>
      <div className="fs-hero-copy">
        <h1 id="hero-title" className="fs-hero-h1">Every fill, held to the tape.</h1>
        <div>
          {/* design v3.1: one sentence; where the prints come from is in the pen margin note */}
          <p className="mb-5 max-w-[42ch] text-[17px] leading-normal text-ui-ink max-sm:text-[15px]">
            FillScore writes down what each fill cost against the exchange&apos;s public prints.
            <MarginNote label="the prints on this tape">
              <p>{heroTape.symbol} on Binance, 28 January 2024, {utcTime(ENTRIES[0].ts).slice(0, 8)} to {utcTime(ENTRIES[ENTRIES.length - 1].ts).slice(0, 8)} UTC: {PRINTS} public prints from the daily trades file.</p>
              <p className="fs-note-field">sha256 {heroTape.sourceSha256}</p>
              <p>A filled triangle marks a buyer-initiated print, a hollow one a seller-initiated print.</p>
              <p>The {heroTape.side.toLowerCase()} order is a synthetic trader&apos;s; the prices are real.</p>
            </MarginNote>
            {' '}It never advises.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link href={DEMO_ENTRY} className={buttonClass('primary', 'lg', 'no-underline')}>Open the demo</Link>
            <Link href="/how-it-works" className={buttonClass('secondary', 'lg', 'no-underline')}>How it works</Link>
          </div>
          {/* the tape's order is a synthetic trader's (DESIGN.md invariant 4); a phone prints it under the tape */}
          <p className="mt-4 font-mono text-[13px] tracking-[0.04em] text-ui-graphite max-md:hidden">SYNTHETIC TRADER, REAL PRICES</p>
        </div>
      </div>
    </section>
  )
}

/**
 * The end of the scroll story: the order's total written by the pen as one giant figure in pen-ink, with the line that
 * says what it was made of, double-underlined. With motion the figure is written left to right as it scrolls in.
 */
export function StoryEnd() {
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = root.current
    if (!el || !document.documentElement.classList.contains('fs-js')) return
    return startPinnedStory({
      root: el,
      distance: 0,
      trigger: { start: 'top 80%', end: 'top 20%', pin: false },
      build: (tl) => {
        const g = (sel: string) => el.querySelectorAll(sel)
        // the glyphs overhang the tight line box, so the reveal window is wider than the box on every side but the left
        tl.fromTo(g('[data-end="figure"]'), { opacity: 1, clipPath: 'inset(-20% 100% -20% -5%)' }, { opacity: 1, clipPath: 'inset(-20% -5% -20% -5%)', duration: 0.6 }, 0)
        tl.fromTo(g('[data-end="line"]'), { opacity: 0 }, { opacity: 1, duration: 0.15 }, 0.55)
        tl.fromTo(g('[data-end="underline"]'), { opacity: 1, drawSVG: '0%' }, { opacity: 1, drawSVG: '100%', duration: 0.3 }, 0.7)
      },
    })
  }, [])
  const total = heroCosts.total
  return (
    <section ref={root} className="fs-end" aria-labelledby="end-title">
      <h2 id="end-title" className="sr-only">What the order cost</h2>
      <p className="font-mono text-[13px] tracking-[0.04em] text-ui-graphite uppercase">Total</p>
      <p className="fs-end-figure" data-story data-end="figure">{formatUsd(total.usd)}</p>
      <p className="fs-end-line" data-story data-end="line">
        {formatSignedBps(total.bps)}; fees were {formatPct(heroCosts.feeShare)} of it
        <svg viewBox="0 0 400 22" preserveAspectRatio="none" aria-hidden="true">
          <path data-story data-end="underline" d="M2 6 C 90 4, 220 9, 398 6 M10 15 C 120 13, 260 17, 390 14" vectorEffect="non-scaling-stroke" />
        </svg>
      </p>
      {/* design v3.1: the three amounts are on the tape above; one slim printed line keeps the provenance */}
      <p className="mt-12 font-mono text-[13px] tracking-[0.04em] text-ui-graphite">SYNTHETIC TRADER, REAL PRICES</p>
    </section>
  )
}

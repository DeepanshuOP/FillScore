'use client'

import { useEffect, useRef, useState } from 'react'
import { GradeStamp } from '../../ui/GradeStamp'
import { apiBase } from '../../lib/apiBase'
import { FEE_LINE } from '../../dashboard/receiptCopy'
import { gradeView, type GradeView } from '../../dashboard/headline'
import { formatPrice, formatQty, formatUsd, heroCosts, heroEntries, heroTape, utcTime } from '../../lib/landing/heroData'

const PRINTS = heroEntries().filter((e) => e.kind === 'print').slice(0, 7)

/**
 * Design v3.1 landing chapter: three printed objects, one sentence each (Factura's numbered steps, Osmo's masked line
 * reveal). The tape (what we read: the hero's real prints), the receipt (what it cost: the hero order's real terms) and
 * the stamp (the grade: demo-moderate's served grade, read live like the demo receipts; while it loads the stamp prints
 * no letter). On a desktop with motion allowed the chapter pins and the row moves sideways as the page scrolls (GSAP
 * ScrollTrigger, one `ease: "none"` tween, loaded on demand); each title rises out of a line mask as it arrives
 * (SplitText). Without script, with reduced motion or on a phone, the three stand stacked and still.
 */
export function HowItReads() {
  const root = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const [grade, setGrade] = useState<GradeView | null>(null)
  const [at, setAt] = useState(1)

  useEffect(() => {
    let live = true
    fetch(`${apiBase()}/audit/v2?userId=demo-moderate`)
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
      .then((v) => { if (live) setGrade(gradeView(v.status, v.body)) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  useEffect(() => {
    const el = root.current, row = track.current
    if (!el || !row || !document.documentElement.classList.contains('fs-js')) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(min-width: 1024px)').matches) return
    let dead = false, cleanup = () => {}
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/SplitText')]).then(([{ gsap }, { ScrollTrigger }, { SplitText }]) => {
      if (dead) return
      gsap.registerPlugin(ScrollTrigger, SplitText)
      el.dataset.row = 'on'
      const ctx = gsap.context(() => {
        const distance = () => Math.max(0, row.scrollWidth - window.innerWidth)
        const slide = gsap.to(row, {
          x: () => -distance(), ease: 'none',
          scrollTrigger: {
            trigger: el, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true,
            onUpdate: (st) => setAt(Math.min(3, 1 + Math.floor(st.progress * 2.999))),
          },
        })
        row.querySelectorAll<HTMLElement>('[data-panel-title]').forEach((t, i) => {
          SplitText.create(t, {
            type: 'lines', mask: 'lines', autoSplit: true, aria: 'auto',
            onSplit: (self) => gsap.from(self.lines, {
              yPercent: 105, duration: 0.7, ease: 'expo.out', stagger: 0.06,
              scrollTrigger: i === 0 ? { trigger: el, start: 'top 70%', once: true } : { trigger: t, containerAnimation: slide, start: 'left 78%', once: true },
            }),
          })
        })
      }, el)
      cleanup = () => { ctx.revert(); delete el.dataset.row }
    }).catch(() => {})
    return () => { dead = true; cleanup() }
  }, [])

  return (
    <section ref={root} aria-labelledby="reads-title" className="fs-reads">
      <h2 id="reads-title" className="sr-only">How FillScore reads an order</h2>
      <p aria-hidden="true" className="fs-reads-count font-mono text-[13px] tracking-[0.04em] text-ui-graphite">{at} / 3</p>
      {/* one printed provenance line for the chapter: the receipt is the hero order's, the stamp demo-moderate's */}
      <p className="fs-reads-prov font-mono text-[13px] tracking-[0.04em] text-ui-graphite">SYNTHETIC TRADER, REAL PRICES</p>
      <div ref={track} className="fs-reads-row">
        <article className="fs-reads-panel">
          <p className="fs-reads-num font-mono text-[13px] tracking-[0.04em] text-ui-graphite">01</p>
          <h3 data-panel-title className="display-md text-ui-ink">What we read.</h3>
          <p className="max-w-[30ch] text-[18px] leading-snug text-ui-ink">Every public trade, to the second.</p>
          <div className="fs-strip fs-sprockets fs-reads-tape" role="img" aria-label={`Seven public ${heroTape.symbol} trades from the order above, Binance, 28 January 2024`}>
            {PRINTS.map((e, i) => e.kind === 'print' ? (
              <div key={i} className="fs-e" aria-hidden="true"><div className="p">{formatPrice(e.price)}</div><div className="q">{formatQty(e.qty)}</div><div className="t">{utcTime(e.ts).slice(0, 8)}</div></div>
            ) : null)}
          </div>
        </article>
        <article className="fs-reads-panel">
          <p className="fs-reads-num font-mono text-[13px] tracking-[0.04em] text-ui-graphite">02</p>
          <h3 data-panel-title className="display-md text-ui-ink">What it cost.</h3>
          <p className="max-w-[30ch] text-[18px] leading-snug text-ui-ink">Each order, in dollars.</p>
          <div className="fs-receipt fs-reads-receipt shadow-ui">
            {/* invariant 4: a demo receipt carries its own provenance line (design v3.1 review) */}
            <p className="c g">SYNTHETIC TRADER, REAL PRICES</p>
            <hr />
            <div className="fs-lines">
              <span className="g">01</span><span className="lab">Spread</span><span className="num" /><span className="num">{formatUsd(heroCosts.spread.usd)}</span>
              <span className="g">02</span><span className="lab">Impact and timing</span><span className="num" /><span className="num">{formatUsd(heroCosts.impactTiming.usd)}</span>
              <span className="g">03</span><span className="lab">{FEE_LINE}</span><span className="num" /><span className="num">{formatUsd(heroCosts.fees.usd)}</span>
            </div>
            <div className="fs-perf" aria-hidden="true" />
            <div className="fs-totalline"><span className="k">TOTAL</span><span className="b" /><span className="u">{formatUsd(heroCosts.total.usd)}</span></div>
          </div>
        </article>
        <article className="fs-reads-panel">
          <p className="fs-reads-num font-mono text-[13px] tracking-[0.04em] text-ui-graphite">03</p>
          <h3 data-panel-title className="display-md text-ui-ink">The grade.</h3>
          <p className="max-w-[30ch] text-[18px] leading-snug text-ui-ink">One letter, stamped once.</p>
          <div className="flex min-h-[220px] items-center pl-4">
            {grade?.kind === 'graded'
              ? <GradeStamp grade={grade.letter} score={grade.score} period="January 2024" version={grade.scoringVersion} />
              : <span className="fs-word-stamp" data-tone="dashed">GRADED<small>the demo&rsquo;s letter prints here</small></span>}
          </div>        </article>
      </div>
    </section>
  )
}

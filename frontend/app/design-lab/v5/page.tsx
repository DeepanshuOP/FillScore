import Link from 'next/link'
import { ArrowRight, KeyRound, ReceiptText, ScanLine } from 'lucide-react'
import { heroCosts, heroEntries, heroTape } from '../../lib/landing/heroData'
import { bps, money, qty } from './lib/format'
import { HeroHalo } from './HeroHalo'

/**
 * Landing hero prototype (PROPOSAL §5, marketing). The receipt is the landing's real demo order (lib/landing/heroData.ts, committed
 * fixtures cut from the offline demo build); its lines print in once (CSS, 60 ms apart), and stand still under reduced motion. On
 * a phone the receipt follows the buttons in the page flow, so nothing can sit over the headline (AUDIT #1).
 */
const NAV = ['How it works', 'Demo', 'Verify a report', 'Docs']
const fills = heroEntries().filter((e) => e.kind === 'fill')
const day = new Date(`${heroTape.date}T00:00:00Z`).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function V5Landing() {
  const lines: Array<[string, number | null, number | null, boolean?]> = [
    ['Spread paid', heroCosts.spread.bps, heroCosts.spread.usd, true],
    ['Impact and timing', heroCosts.impactTiming.bps, heroCosts.impactTiming.usd, true],
    ['Fees (published rate)', heroCosts.fees.bps, heroCosts.fees.usd],
  ]
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-[1200px] items-center gap-6 px-5 py-4">
        <Link href="/design-lab/v5" className="v-wordmark text-[19px] font-bold tracking-[-0.02em]">FillScore<span className="text-[var(--v-accent)]">.</span></Link>
        <nav aria-label="Site" className="hidden gap-1 md:flex">{NAV.map((n) => <span key={n} className="v-nav-item">{n}</span>)}</nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="v-nav-item hidden sm:flex">Log in</span>
          <Link href="/design-lab/v5/app?userId=demo-moderate" className="v-btn v-btn-primary">Try the demo</Link>
        </div>
      </header>
      <main id="main">
        <HeroHalo>
          <section className="mx-auto grid max-w-[1200px] items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-16">
            <div>
              <p className="mb-4 inline-flex rounded-full border border-[var(--v-border-strong)] bg-[var(--v-surface)] px-3 py-1 text-[13px] text-[var(--v-text-2)]">Trade cost audit for crypto traders · read-only keys</p>
              <h1 className="text-[44px] font-black leading-[1.02] tracking-[-0.045em] sm:text-[64px]">See what each of your trades cost.</h1>
              <p className="mt-5 max-w-[46ch] text-[18px] leading-relaxed text-[var(--v-text-2)]">FillScore checks each of your fills against the exchange’s public trades and writes down what it cost: spread, impact, fees. It audits the past and never tells you how to trade.</p>
              <div className="mt-7 flex flex-wrap gap-3">
                <Link href="/design-lab/v5/app?userId=demo-moderate" className="v-btn v-btn-primary !min-h-[48px] !px-5 text-[16px]">Try the demo<ArrowRight size={18} aria-hidden="true" /></Link>
                <span className="v-btn !min-h-[48px] !px-5 text-[16px]">How it works</span>
              </div>
            </div>
            <figure className="m-0">
              <article className="v-receipt v-print relative mx-auto max-w-[420px] rounded-md px-6 py-6 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.35)] ring-1 ring-black/5" aria-label="Receipt of one demo order">
                <p className="text-center text-[20px] font-bold" style={{ fontFamily: 'var(--f-cabinet)' }}>FillScore</p>
                <p className="lab text-center">Order receipt · {heroTape.symbol} {heroTape.side} {heroTape.type}</p>
                <p className="lab text-center">{day} · synthetic trader, real prices</p>
                <div className="mt-4 border-t border-dashed border-current/30 pt-3">
                  <p className="lab">Fills</p>
                  {fills.map((f) => f.kind === 'fill' ? <p key={f.n} className="v-line">{new Date(f.ts).toISOString().slice(11, 19)} · {qty(f.qty)} @ {f.price.toLocaleString('en-US')}</p> : null)}
                </div>
                <div className="mt-3 border-t border-dashed border-current/30 pt-3">
                  <p className="lab">Costs</p>
                  {lines.map(([l, b, u, sub]) => <p key={l} className={`v-line flex justify-between gap-3 ${sub ? 'pl-3' : ''}`}><span>{l}</span><span>{bps(b) ?? 'NOT COMPUTED'} · {money(u) ?? ''}</span></p>)}
                </div>
                <div className="v-line mt-3 flex items-baseline justify-between border-t border-dashed border-current/30 pt-3">
                  <span className="lab">Total</span>
                  <span className="text-[28px] font-bold" style={{ fontFamily: 'var(--f-cabinet)' }}>{money(heroCosts.total.usd)} <span className="text-[14px] font-normal">{bps(heroCosts.total.bps)}</span></span>
                </div>
                <p className="v-line mt-2 text-[14px]" style={{ fontFamily: 'var(--f-cabinet)' }}>Fees at the published rate: not independently measured. Demo receipt: NOT SIGNED.</p>
              </article>
              <figcaption className="mt-3 text-center text-[13px] text-[var(--v-text-2)]">One demo order from a synthetic trader, measured against real Binance public trades of {day}.</figcaption>
            </figure>
          </section>
        </HeroHalo>
        <section className="mx-auto grid max-w-[1200px] gap-4 px-5 pb-20 md:grid-cols-3" aria-label="How it works">
          {[[KeyRound, 'Connect a read-only key', 'Keys that can trade or withdraw are refused before anything is stored.'],
            [ScanLine, 'Each fill is measured', 'Against the public trades and the price when the order arrived, by code you can read.'],
            [ReceiptText, 'You get receipts and a grade', 'A receipt per order, a grade per account, and a signed report anyone can verify.']].map(([Icon, t, s]) => {
            const I = Icon as typeof KeyRound
            return <div key={t as string} className="v-card p-5"><I size={22} aria-hidden="true" className="text-[var(--v-accent)]" /><h2 className="mt-3 text-[17px] font-semibold">{t as string}</h2><p className="mt-1 text-[15px] text-[var(--v-text-2)]">{s as string}</p></div>
          })}
        </section>
      </main>
    </div>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { buttonClass } from '../ui/buttonClass'
import { MarketingNav } from '../components/marketing/MarketingNav'
import { LandingMotion } from '../components/marketing/LandingMotion'
import { HowItReads } from '../components/marketing/HowItReads'
import SiteFooter from '../components/SiteFooter'

export const metadata: Metadata = { title: 'How it works — FillScore', description: 'How FillScore reads one order: the public prints, what the order cost, and the grade.' }

/**
 * How it works (IA v4): the landing's three printed objects (the tape, the receipt, the stamp) as a page of their own, so the landing
 * stays short. The landing keeps a link to it. The pinned sideways story is the landing's motion; without script, with reduced
 * motion or on a phone the three objects stand stacked and still.
 */
export default function HowItWorksPage() {
  return (
    <LandingMotion>
      {/* Arms the pinned story before paint (landing.css). Without script this never runs and the finished frame shows. */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('fs-js')" }} />
      <MarketingNav />
      <main id="main" className="pt-16">
        <section aria-labelledby="hiw-title" className="px-[var(--ui-gutter)] pt-16 pb-10">
          <h1 id="hiw-title" className="display-md max-w-[18ch] text-ui-ink">How it works</h1>
          <ol className="mt-8 grid max-w-[1100px] gap-6 sm:grid-cols-3">
            {[['Connect read-only', 'You give FillScore a key that can only read. A key that can trade or withdraw is refused.'],
              ['We measure each fill', 'Each fill is compared with the public trades on Binance at that second.'],
              ['You get a receipt and a grade', 'Each order gets a receipt with its cost, and the account gets one grade.']].map(([t, s], i) => (
              <li key={t} className="flex flex-col gap-1">
                <span className="text-[14px] font-medium text-ui-graphite">Step {i + 1}</span>
                <span className="text-[18px] font-semibold text-ui-ink">{t}</span>
                <span className="text-[16px] leading-snug text-ui-graphite">{s}</span>
              </li>
            ))}
          </ol>
        </section>
        <HowItReads />
        <section aria-labelledby="hiw-next" className="border-t border-ui-ink px-[var(--ui-gutter)] py-20">
          <h2 id="hiw-next" className="display-md max-w-[22ch] text-ui-ink">See it on a finished audit.</h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/demo" className={buttonClass('primary', 'lg', 'no-underline')}>Try the demo</Link>
            <Link href="/methodology" className={buttonClass('secondary', 'lg', 'no-underline')}>Read the methodology</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </LandingMotion>
  )
}

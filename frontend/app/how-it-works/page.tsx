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
        <h1 className="sr-only">How it works</h1>
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

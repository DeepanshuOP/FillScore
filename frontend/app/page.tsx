import Link from 'next/link'
import { buttonClass } from './ui/buttonClass'
import { MarketingNav } from './components/marketing/MarketingNav'
import { LandingMotion } from './components/marketing/LandingMotion'
import { StoryEnd, TapeHero } from './components/marketing/TapeHero'
import { DemoCards } from './components/marketing/DemoCards'
import { CheckIt } from './components/marketing/CheckIt'
import SiteFooter from './components/SiteFooter'

/**
 * The landing page of design v3 "Tape & Receipt". The hero: the headline, the ticker tape of one real order on the
 * exchange's real prints, and the call to action; scrolled, the pen annotates the order and the story ends on its total.
 * Then the demo accounts as pinned receipts, "check it yourself", what it never does, and the close.
 */
export default function Home() {
  return (
    <LandingMotion>
      {/* Arms the hero's first frame before paint (landing.css). Without script this never runs and the finished frame shows. */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('fs-js')" }} />
      <MarketingNav />
      <main id="main">
        <TapeHero />
        <StoryEnd />
        <DemoCards />
        <CheckIt />

        <section aria-labelledby="never-title" className="px-[var(--ui-gutter)] py-28 lg:py-40">
          <h2 id="never-title" className="sr-only">What FillScore never does</h2>
          <p data-split className="max-w-[22ch] text-[clamp(2rem,4.6vw,4rem)] leading-[1.02] font-black tracking-[-0.04em] text-ui-ink">
            No trade calls. No predictions. No language-model numbers.
          </p>
        </section>

        <section aria-labelledby="cta-title" className="border-t border-ui-ink px-[var(--ui-gutter)] py-24 lg:py-32">
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h2 id="cta-title" data-split className="display-lg text-ui-ink">Audit your own orders.</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className={buttonClass('primary', 'lg', 'no-underline')}>Connect a read-only key</Link>            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </LandingMotion>
  )
}

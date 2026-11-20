import Link from 'next/link'
import { DotPattern } from '@/components/ui/dot-pattern'
import { buttonClass } from './ui/buttonClass'
import { HeroTape } from './ui/tape/HeroTape'
import { MarketingNav } from './components/marketing/MarketingNav'
import { LandingMotion } from './components/marketing/LandingMotion'
import { ScrollStory } from './components/marketing/ScrollStory'
import { DemoCards } from './components/marketing/DemoCards'
import { CheckIt } from './components/marketing/CheckIt'
import SiteFooter from './components/SiteFooter'

/**
 * The landing page of design v2. Hero: what FillScore does in one line, and the market tape of one real order on the
 * exchange's real prints (the order is chosen by a stated rule; see "Figures and sources" on the tape). Then the scroll
 * story, the demo accounts, "check it yourself", what it never does, and the close.
 */
export default function Home() {
  return (
    <LandingMotion>
      {/* Without script the hero tape's story marks would stay hidden: show the final frame. */}
      <noscript><style>{'.tape[data-armed] [data-story]{opacity:1 !important}'}</style></noscript>
      <MarketingNav />
      <main id="main">
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="aurora pointer-events-none absolute inset-0 -z-10" />
          <DotPattern width={22} height={22} cr={0.9} className="-z-10 text-ui-edge/35 [mask-image:radial-gradient(70%_60%_at_60%_30%,black,transparent)]" />
          <div className="mx-auto grid max-w-[1240px] items-center gap-12 px-5 pt-32 pb-20 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] lg:gap-14 lg:pt-40 lg:pb-28">
            <div className="max-w-xl">
              <h1 id="hero-title" className="display-xl text-ui-ink">Every past fill, held against the tape.</h1>
              <p className="mt-6 max-w-[48ch] text-[17px] leading-7 text-ui-graphite sm:text-lg sm:leading-8">
                FillScore replays each order you placed against the exchange&rsquo;s public prints of the same seconds, and writes down what it cost: the spread, the impact and timing, the orders that never filled, and the fees against your real rates.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/dashboard?userId=demo-moderate" className={buttonClass('primary', 'lg', 'no-underline')}>
                  Open the demo audit
                </Link>
                <Link href="/signup" className={buttonClass('secondary', 'lg', 'no-underline')}>Connect a read-only key</Link>
              </div>
              <p className="mt-6 text-[13px] text-ui-graphite">Read-only keys only. Every number comes from code, never from a language model.</p>
            </div>
            <HeroTape className="w-full" />
          </div>
        </section>

        <ScrollStory />
        <DemoCards />
        <CheckIt />

        <section aria-labelledby="never-title" className="mx-auto max-w-[1240px] px-5 py-28 sm:px-8 lg:py-40">
          <h2 id="never-title" className="sr-only">What FillScore never does</h2>
          <p data-split className="max-w-[24ch] text-[clamp(1.875rem,4.2vw,3.5rem)] leading-[1.08] font-semibold tracking-[-0.035em] text-ui-ink">
            FillScore never tells you what to trade, never predicts a price, and never lets a language model write a number.
          </p>
          <p className="mt-6 max-w-[56ch] text-[15px] leading-6 text-ui-graphite">
            It audits what already happened. Explanations may be written by a model, but every figure in them is checked against the audit first, and copy that reads as advice is refused.
          </p>
        </section>

        <section aria-labelledby="cta-title" className="relative isolate overflow-hidden border-t border-ui-rule">
          <div className="mx-auto flex max-w-[1240px] flex-col items-start gap-8 px-5 py-24 sm:px-8 lg:flex-row lg:items-end lg:justify-between lg:py-32">
            <div className="max-w-2xl">
              <h2 id="cta-title" data-split className="display-lg text-ui-ink">See what your own orders cost.</h2>
              <p className="mt-4 text-[17px] leading-7 text-ui-graphite">Connect a key that can only read. FillScore refuses anything more.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/signup" className={buttonClass('primary', 'lg', 'no-underline')}>Connect a read-only key</Link>
              <Link href="/dashboard?userId=demo-moderate" className={buttonClass('secondary', 'lg', 'no-underline')}>Open a demo</Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </LandingMotion>
  )
}

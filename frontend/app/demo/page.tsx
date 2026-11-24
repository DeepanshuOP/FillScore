import type { Metadata } from 'next'
import { MarketingNav } from '../components/marketing/MarketingNav'
import { DemoChoice } from '../components/marketing/DemoChoice'
import SiteFooter from '../components/SiteFooter'

export const metadata: Metadata = { title: 'Demo — FillScore', description: 'Three synthetic traders on real public prices. Pick one to open its audit.' }

/** The demo entry: both "Demo" and "Open the demo" in the top bar lead here, so the choice of trader is never skipped. */
export default function DemoPage() {
  return (
    <>
      <MarketingNav />
      <main id="main" className="min-h-screen bg-ui-surface px-[var(--ui-gutter)] pt-28 pb-24">
        <h1 className="display-md text-ui-ink">Pick a trader to open.</h1>
        <p className="mt-3 max-w-[60ch] text-[16px] text-ui-graphite">
          Three synthetic traders. Their trading behaviour is generated; every fill price comes from real public trades. Each card opens that trader&rsquo;s audit.
        </p>
        <div className="mt-14"><DemoChoice /></div>
      </main>
      <SiteFooter />
    </>
  )
}

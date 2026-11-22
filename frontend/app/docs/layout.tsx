import Link from 'next/link'
import { MarketingNav } from '../components/marketing/MarketingNav'
import SiteFooter from '../components/SiteFooter'
import { DOCS } from './docsList'

/** The docs shell (IA v4): the site bar, a quiet list of the documents on the left, the text, the footer. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      <div className="min-h-screen bg-ui-surface px-[var(--ui-gutter)] pt-24 pb-24">
        <div className="mx-auto grid max-w-[1240px] gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
          <nav aria-label="Docs" className="lg:sticky lg:top-24 lg:self-start">
            <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite uppercase">Docs</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[15px] lg:flex-col">
              <li><Link href="/docs" className="text-ui-ink no-underline hover:underline">Overview</Link></li>
              {DOCS.map((d) => <li key={d.href}><Link href={d.href} className="text-ui-ink no-underline hover:underline">{d.title}</Link></li>)}
            </ul>
          </nav>
          <main id="main" className="min-w-0 max-w-[820px]">{children}</main>
        </div>
      </div>
      <SiteFooter />
    </>
  )
}

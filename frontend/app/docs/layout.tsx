import { MarketingNav } from '../components/marketing/MarketingNav'
import SiteFooter from '../components/SiteFooter'
import { DocsNav } from './DocsNav'

/** The docs shell (design v5): the site bar, a list of the documents on the left, the text at 16 px, the footer. */
export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MarketingNav />
      <div className="min-h-screen bg-ui-surface px-[var(--ui-gutter)] pt-24 pb-24">
        <div className="mx-auto grid max-w-[1240px] gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          <DocsNav />
          <main id="main" className="min-w-0 max-w-[820px]">{children}</main>
        </div>
      </div>
      <SiteFooter />
    </>
  )
}

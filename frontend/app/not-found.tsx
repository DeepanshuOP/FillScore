import Link from 'next/link';
import { MarketingNav } from './components/marketing/MarketingNav';
import SiteFooter from './components/SiteFooter';
import { buttonClass } from './ui/buttonClass';

export default function NotFound() {
  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="mx-auto max-w-[1240px] px-5 pt-40 sm:px-8">
          <h1 className="display-md text-ui-ink">This page does not exist.</h1>
          <p className="mt-3 max-w-[68ch] text-[15px] text-ui-graphite">The address may be mistyped, or the page may have been removed.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/" className={buttonClass('primary', 'md', 'no-underline')}>Go to the home page</Link>
            <Link href="/dashboard?userId=demo-moderate" className={buttonClass('secondary', 'md', 'no-underline')}>Open the demo audit</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

import Link from 'next/link';
import { MarketingNav } from './components/marketing/MarketingNav';
import SiteFooter from './components/SiteFooter';
import { buttonClass } from './ui/buttonClass';

export default function NotFound() {
  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="px-[var(--ui-gutter)] pt-32">
          <p aria-hidden="true" className="text-[clamp(8rem,26vw,22rem)] leading-[0.8] font-black tracking-[-0.06em] text-ui-ink">404<span className="text-ui-graphite">.</span></p>
          <span aria-hidden="true" className="fs-word-stamp mt-6" data-tone="dashed">NOT ON FILE<small>no such address</small></span>
          <h1 className="display-md mt-8 text-ui-ink">This page does not exist.</h1>
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

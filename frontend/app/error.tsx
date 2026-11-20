'use client';

import Link from 'next/link';
import { MarketingNav } from './components/marketing/MarketingNav';
import SiteFooter from './components/SiteFooter';
import { buttonClass } from './ui/buttonClass';

/** Error boundary of the app. It shows no message from the error and no stack trace. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="mx-auto max-w-[1240px] px-5 pt-40 sm:px-8">
          <h1 className="display-md text-ui-ink">Something went wrong on this page.</h1>
          <p className="mt-3 max-w-[68ch] text-[15px] text-ui-graphite">Nothing on your account was changed. Trying again reloads the page.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={() => reset()} className={buttonClass('primary', 'md')}>Try again</button>
            <Link href="/" className={buttonClass('secondary', 'md', 'no-underline')}>Go to the home page</Link>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

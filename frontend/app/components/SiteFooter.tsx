import React from 'react';
import Link from 'next/link';
import { frontendCommit } from '../lib/buildInfo';

export default function SiteFooter() {
  return (
    <footer className="border-t border-ui-rule bg-ui-surface py-5 text-sm text-ui-graphite">
      {/* the same column as the navbar and the page: max-w-6xl with px-4 and sm:px-5 */}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-1 px-4 sm:justify-between sm:px-5">
        <span title={`build ${frontendCommit().slice(0, 7)}`}>FillScore audits past execution. It is not financial advice.</span>
        <nav aria-label="Footer" className="flex flex-wrap items-center gap-x-5">
          <Link href="/methodology" className="inline-block py-2 text-ui-ink">Methodology</Link>
          <Link href="/verify" className="inline-block py-2 text-ui-ink">Check a pack</Link>
          <Link href="/terms" className="inline-block py-2 text-ui-ink">Terms</Link>
          <Link href="/privacy" className="inline-block py-2 text-ui-ink">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

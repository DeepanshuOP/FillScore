import Link from 'next/link';
import { frontendCommit } from '../lib/buildInfo';
import { Logo } from './shell/Logo';

/** Site footer of the marketing and reading pages (design v2). The app shell has its own line in the sidebar. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-ui-rule bg-ui-surface">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-[13px] leading-5 text-ui-graphite" title={`build ${frontendCommit().slice(0, 7)}`}>
            FillScore audits past execution. It is not financial advice, and it never predicts or signals.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-2 text-[13px] sm:grid-cols-3">
          <Link href="/methodology" className="text-ui-graphite no-underline hover:text-ui-ink">Methodology</Link>
          <Link href="/verify" className="text-ui-graphite no-underline hover:text-ui-ink">Check a pack</Link>
          <Link href="/check" className="text-ui-graphite no-underline hover:text-ui-ink">Check a broker file</Link>
          <Link href="/dashboard?userId=demo-moderate" className="text-ui-graphite no-underline hover:text-ui-ink">Demo audit</Link>
          <Link href="/terms" className="text-ui-graphite no-underline hover:text-ui-ink">Terms</Link>
          <Link href="/privacy" className="text-ui-graphite no-underline hover:text-ui-ink">Privacy</Link>
        </nav>
      </div>
    </footer>
  );
}

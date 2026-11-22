import Link from 'next/link';
import { frontendCommit } from '../lib/buildInfo';
import { Logo } from './shell/Logo';
import { ThemeToggle } from './shell/ThemeToggle';

/** The footer's four columns (IA v4): Product, Docs, Trust, Legal. Every link leads to a page that exists. */
export const FOOTER_COLUMNS: ReadonlyArray<{ title: string; links: ReadonlyArray<readonly [string, string]> }> = [
  { title: 'Product', links: [['/how-it-works', 'How it works'], ['/demo', 'Demo'], ['/app/check', 'Check a broker file'], ['/login', 'Log in']] },
  { title: 'Docs', links: [['/docs', 'Docs'], ['/methodology', 'Methodology'], ['/docs/mcp', 'MCP client'], ['/docs/package', 'Metrics package']] },
  { title: 'Trust', links: [['/verify', 'Verify an evidence pack'], ['/share/demo-moderate', 'Public score card']] },
  { title: 'Legal', links: [['/terms', 'Terms'], ['/privacy', 'Privacy']] },
];

/** Site footer of the marketing and reading pages. The app has its own line under its sidebar. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-ui-rule bg-ui-surface" data-testid="site-footer">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-10 px-5 py-12 sm:px-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-[13px] leading-5 text-ui-graphite" title={`build ${frontendCommit().slice(0, 7)}`}>
            FillScore audits past execution. It is not financial advice, and it never predicts or signals.
          </p>
          <ThemeToggle className="-ml-1 mt-2 min-w-0 justify-start" />
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-12 gap-y-8 sm:grid-cols-4">
          {FOOTER_COLUMNS.map((c) => (
            <div key={c.title}>
              <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite uppercase">{c.title}</p>
              <ul className="mt-3 flex flex-col gap-2 text-[14px]">
                {c.links.map(([href, label]) => (
                  <li key={`${c.title}-${label}`}><Link href={href} className="text-ui-graphite no-underline hover:text-ui-ink">{label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </footer>
  );
}

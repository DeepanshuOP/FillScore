import Link from 'next/link'
import '../ia4.css'
import { SiteTopBar } from '../SiteTopBar'
import { TapeHero } from '../../../components/marketing/TapeHero'
import { demoTraders, PROVENANCE } from '../data'

/**
 * IA v4 prototype: the marketing site's header, its first two viewports and the footer (design lab only, 404 in production).
 * Viewport 1 is today's hero (TapeHero, unchanged: the real order on real prints). Viewport 2 is the demo entry: the three
 * synthetic traders as printed slips, counts read from the committed fixtures (data.ts), each opening the app home.
 */
export default function Ia4Site() {
  const traders = demoTraders()
  return (
    <>
      <SiteTopBar />
      <main id="main">
        <TapeHero />
        <section id="demo" aria-labelledby="demo-title" className="border-t border-ui-ink px-[var(--ui-gutter)] py-20 lg:py-28" data-testid="ia4-demo-entry">
          <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">THE DEMO</p>
          <h2 id="demo-title" className="display-md mt-2 max-w-[20ch] text-ui-ink">Open a demo trader&rsquo;s audit.</h2>
          <p className="mt-3 max-w-[56ch] text-[17px] text-ui-graphite">Three generated traders, priced against real Binance prints from January 2024. Read-only.</p>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {traders.map((t) => (
              <li key={t.id} className="min-w-0">
                <Link href={`/design-lab/ia4/app?userId=${t.id}`} className="block no-underline">
                  <div className="fs-receipt">
                    <p className="font-mono text-[11.5px] tracking-[0.06em] text-ui-graphite uppercase">{PROVENANCE}</p>
                    <p className="mt-2 font-sans text-[22px] leading-tight font-black tracking-[-0.03em] text-ui-ink">{t.name}</p>
                    <p className="mt-1 font-sans text-[15px] text-ui-graphite">{t.tagline}</p>
                    <hr />
                    <p className="flex justify-between font-mono text-[13px] text-ui-ink"><span>ORDERS</span><span>{t.orders.toLocaleString('en-US')}</span></p>
                    <p className="flex justify-between font-mono text-[13px] text-ui-ink"><span>FILLS</span><span>{t.fills.toLocaleString('en-US')}</span></p>
                    <p className="flex justify-between font-mono text-[13px] text-ui-ink"><span>PERIOD</span><span>JAN 2024</span></p>
                    <p className="mt-3 font-sans text-[15px] font-bold text-ui-ink underline underline-offset-4">Open this audit</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="border-t border-ui-ink px-[var(--ui-gutter)] pt-12 pb-10" data-testid="ia4-footer">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Product', [['/', 'How it works'], ['#demo', 'Demo'], ['/verify', 'Verify a pack']]],
            ['Docs', [['/methodology', 'Methodology'], ['/methodology#mcp', 'MCP client'], ['/methodology#package', 'The open package']]],
            ['Trust', [['/verify', 'Check it yourself'], ['https://github.com/DeepanshuOP/FillScore', 'Source code']]],
            ['Legal', [['/terms', 'Terms'], ['/privacy', 'Privacy']]],
          ].map(([head, links]) => (
            <div key={head as string}>
              <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite uppercase">{head as string}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {(links as string[][]).map(([href, label]) => <li key={label}><Link href={href} className="text-[15px] text-ui-ink no-underline hover:underline">{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-12 max-w-[60ch] text-[15px] text-ui-graphite">FillScore grades past execution against public market prints. No trade calls, no predictions, no language-model numbers.</p>
      </footer>
    </>
  )
}

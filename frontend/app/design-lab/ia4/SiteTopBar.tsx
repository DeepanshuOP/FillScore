'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { Logo } from '../../components/shell/Logo'
import { buttonClass } from '../../ui/buttonClass'

/** The proposed marketing top bar: five items and two actions (PROPOSAL.md section 1). Lab links point at today's pages. */
export const SITE_ITEMS: Array<[string, string]> = [
  // "How it works" is the landing's HowItReads section today (proposed: its own page, /how-it-works)
  ['/', 'How it works'], ['#demo', 'Demo'], ['/verify', 'Verify'], ['/methodology', 'Docs'],
]
const DEMO = '/design-lab/ia4/app'

export function SiteTopBar() {
  const menu = useRef<HTMLDialogElement>(null)
  return (
    <header className="sticky top-0 z-40 border-b border-ui-ink bg-ui-surface" data-testid="ia4-site-bar">
      <div className="flex h-16 items-center gap-6 px-[var(--ui-gutter)] max-sm:h-14 max-sm:gap-3">
        <Link href="/design-lab/ia4/site" className="no-underline" aria-label="FillScore home"><Logo /></Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {SITE_ITEMS.map(([href, label]) => (
            <Link key={label} href={href} className="px-3 py-1.5 text-[15px] font-medium text-ui-graphite no-underline hover:text-ui-ink">{label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="hidden px-3 py-1.5 text-[14px] text-ui-graphite no-underline hover:text-ui-ink md:inline-block">Log in</Link>
          <Link href={DEMO} className={buttonClass('primary', 'sm', 'no-underline')}>Open the demo</Link>
          <button type="button" aria-haspopup="dialog" onClick={() => menu.current?.showModal()} className="min-h-11 px-2 text-[14px] text-ui-ink underline underline-offset-2 md:hidden">Menu</button>
        </div>
      </div>
      <dialog ref={menu} className="ia4-sheet" aria-label="Site menu" onClick={(e) => { if (e.target === menu.current) menu.current?.close() }}>
        <div className="fs-torn-top" aria-hidden="true" />
        <div className="flex min-h-[50dvh] flex-col px-[var(--ui-gutter)] pt-3 pb-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">MENU</p>
            <button type="button" className="min-h-11 px-2 text-[14px] text-ui-ink underline underline-offset-2" onClick={() => menu.current?.close()}>Close</button>
          </div>
          <ul className="mt-2 flex flex-col">
            {SITE_ITEMS.map(([href, label]) => (
              <li key={label}><Link href={href} onClick={() => menu.current?.close()} className="block py-2.5 text-[20px] font-bold text-ui-ink no-underline">{label}</Link></li>
            ))}
          </ul>
          {/* account actions pinned at the bottom of the sheet (cal.com's pattern, REFERENCES section 1) */}
          <div className="mt-auto flex flex-col gap-2 pt-6">
            <Link href={DEMO} className={buttonClass('primary', 'md', 'no-underline justify-center')}>Open the demo</Link>
            <Link href="/login" className={buttonClass('secondary', 'md', 'no-underline justify-center')}>Log in</Link>
            <Link href="/signup" className="py-2 text-center text-[15px] text-ui-ink">Sign up</Link>
          </div>
        </div>
      </dialog>
    </header>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { cn } from '../../../lib/utils'
import dynamic from 'next/dynamic'

const MarketingMenu = dynamic(() => import('./MarketingMenu'), { ssr: false })
import { useAuth } from '../../context/AuthContext'
import { buttonClass } from '../../ui/Button'
import { Logo } from '../shell/Logo'

import { DEMO_ENTRY, SITE_ITEMS } from './siteItems'

/**
 * The marketing top bar (IA v4): four items, then Log in and "Open the demo". Transparent over the landing hero, an inked rule
 * once the page scrolls. A phone shows the wordmark, "Open the demo" and Menu (a receipt sheet). Signed in, "Open the app" takes
 * the place of the two account actions.
 */
export function MarketingNav() {
  const { accessToken } = useAuth()
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuEver, setMenuEver] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={cn('fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-300',
      scrolled ? 'border-b border-ui-ink bg-ui-surface' : 'border-b border-transparent')} data-testid="site-bar">
      <div className="flex h-16 items-center gap-6 px-[var(--ui-gutter)] max-sm:h-14 max-sm:gap-3">
        <Link href="/" className="no-underline" aria-label="FillScore home"><Logo /></Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {SITE_ITEMS.map(([href, label]) => (
            <Link key={href} href={href} aria-current={pathname === href || pathname.startsWith(`${href}/`) ? 'page' : undefined}
              className="px-3 py-1.5 text-[15px] font-medium text-ui-graphite no-underline transition-colors hover:text-ui-ink aria-[current=page]:font-bold aria-[current=page]:text-ui-ink">{label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {accessToken ? (
            <Link href="/app" className={buttonClass('primary', 'sm', 'no-underline')}>Open the app</Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-md px-3 py-1.5 text-[14px] text-ui-graphite no-underline hover:text-ui-ink md:inline-block">Log in</Link>
              <Link href={DEMO_ENTRY} className={buttonClass('primary', 'sm', 'no-underline max-sm:min-h-11')}>Try the demo</Link>
            </>
          )}
          <button type="button" onClick={() => { setMenuEver(true); setMenuOpen(true) }} aria-haspopup="dialog"
            className="min-h-11 px-2 text-[14px] text-ui-ink underline underline-offset-2 md:hidden">Menu</button>
        </div>
      </div>
      {menuEver ? <MarketingMenu open={menuOpen} onOpenChange={setMenuOpen} signedIn={!!accessToken} /> : null}
    </header>
  )
}

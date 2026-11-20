'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Menu } from 'lucide-react'
import { cn } from '../../../lib/utils'
import dynamic from 'next/dynamic'

const MarketingMenu = dynamic(() => import('./MarketingMenu'), { ssr: false })
import { useAuth } from '../../context/AuthContext'
import { buttonClass } from '../../ui/Button'
import { Logo } from '../shell/Logo'
import { ThemeToggle } from '../shell/ThemeToggle'

/** The marketing top bar: transparent over the hero, a blurred surface once the page scrolls. */
export function MarketingNav() {
  const { accessToken } = useAuth()
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
      scrolled ? 'border-b border-ui-ink bg-ui-surface' : 'border-b border-transparent')}>
      <div className="flex h-16 items-center gap-6 px-[var(--ui-gutter)] max-sm:h-14 max-sm:gap-3">
        <Link href="/" className="no-underline" aria-label="FillScore home"><Logo /></Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {[['/methodology', 'Methodology'], ['/verify', 'Verify a pack'], ['/check', 'Check a broker file']].map(([href, label]) => (
            <Link key={href} href={href} className="px-3 py-1.5 text-[15px] font-medium text-ui-graphite no-underline transition-colors hover:text-ui-ink">{label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => { setMenuEver(true); setMenuOpen(true) }} aria-label="Open menu" className="grid size-9 place-items-center rounded-[9px] text-ui-graphite hover:bg-ui-overlay md:hidden">
            <Menu aria-hidden="true" className="size-4" />
          </button>
          <ThemeToggle className="max-sm:hidden" />
          {accessToken ? (
            <Link href="/dashboard" className={buttonClass('primary', 'sm', 'no-underline')}>Your audit</Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-md px-3 py-1.5 text-[13.5px] text-ui-graphite no-underline hover:text-ui-ink sm:inline-block">Log in</Link>
              <Link href="/signup" className={buttonClass('primary', 'sm', 'no-underline')}>Connect a key</Link>
            </>
          )}
        </div>
      </div>
      {menuEver ? <MarketingMenu open={menuOpen} onOpenChange={setMenuOpen} signedIn={!!accessToken} /> : null}
    </header>
  )
}

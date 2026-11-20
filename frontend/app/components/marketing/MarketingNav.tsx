'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { buttonClass } from '../../ui/Button'
import { Logo } from '../shell/Logo'
import { ThemeToggle } from '../shell/ThemeToggle'

/** The marketing top bar: transparent over the hero, a blurred surface once the page scrolls. */
export function MarketingNav() {
  const { accessToken } = useAuth()
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  return (
    <header className={cn('fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-300',
      scrolled ? 'border-b border-ui-rule bg-ui-surface/75 backdrop-blur-md' : 'border-b border-transparent')}>
      <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-6 px-5 sm:px-8">
        <Link href="/" className="no-underline" aria-label="FillScore home"><Logo /></Link>
        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {[['/methodology', 'Methodology'], ['/verify', 'Verify a pack'], ['/check', 'Check a broker file']].map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-[13.5px] text-ui-graphite no-underline transition-colors hover:text-ui-ink">{label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
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
    </header>
  )
}

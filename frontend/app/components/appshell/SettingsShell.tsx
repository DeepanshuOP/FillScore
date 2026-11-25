import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '../shell/Logo'
import { cn } from '../../../lib/utils'

export interface SettingsNavItem { id: string; label: string; href: string }

/**
 * Settings has its own shell (IA v4, design v5 §3.4): "Back" replaces the app's sidebar, as cal.com does, and a list of sections
 * stands on the left (a row of links that scrolls sideways on phones). The active section is marked with `aria-current`.
 */
export function SettingsShell({ title, nav, active, children }: { title: string; nav: SettingsNavItem[]; active: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ui-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ui-raised focus:px-3 focus:py-2">Skip to content</a>
      <header className="flex items-center gap-4 border-b border-ui-rule px-[var(--ui-gutter)] py-3">
        <Link href="/app" className="inline-flex min-h-11 items-center gap-1 pr-2 text-[15px] font-semibold text-ui-ink no-underline"><ChevronLeft aria-hidden="true" className="size-4" />Back</Link>
        <Link href="/" aria-label="FillScore home" className="ml-auto inline-flex items-center no-underline pointer-coarse:min-h-11"><Logo /></Link>
      </header>
      <main id="main" className="w-full max-w-[1440px] flex-1 px-[var(--ui-gutter)] pt-8 pb-16">
        <h1 className="page-title mb-1 text-ui-ink">{title}</h1>
        <p className="mb-6 max-w-[68ch] text-[14px] text-ui-graphite">Your account, connected exchanges, keys and data.</p>
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto lg:sticky lg:top-6 lg:mx-0 lg:self-start lg:overflow-visible">
            <ul className="flex gap-1 px-1 lg:flex-col lg:px-0">
              {nav.map((n) => (
                <li key={n.id} className="shrink-0">
                  <Link href={n.href} aria-current={n.id === active ? 'page' : undefined}
                    className={cn('flex min-h-10 items-center rounded-lg px-3 text-[14px] font-medium no-underline transition-colors pointer-coarse:min-h-11',
                      n.id === active ? 'bg-ui-overlay text-ui-ink' : 'text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink')}>{n.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="min-w-0 max-w-3xl">{children}</div>
        </div>
      </main>
      <footer className="border-t border-ui-rule px-[var(--ui-gutter)] py-4 text-[13px] text-ui-graphite">
        FillScore audits past execution. It is not financial advice.
      </footer>
    </div>
  )
}

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Logo } from '../shell/Logo'

/** Settings has its own shell (IA v4): "Back" replaces the app's sidebar, as cal.com does. Back leads to Home. */
export function SettingsShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-ui-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ui-raised focus:px-3 focus:py-2">Skip to content</a>
      <header className="flex items-center gap-4 border-b border-ui-rule px-[var(--ui-gutter)] py-3">
        <Link href="/app" className="inline-flex min-h-11 items-center gap-1 pr-2 text-[15px] font-semibold text-ui-ink no-underline"><ChevronLeft aria-hidden="true" className="size-4" />Back</Link>
        <Link href="/" aria-label="FillScore home" className="ml-auto no-underline"><Logo /></Link>
      </header>
      <main id="main" className="w-full max-w-[1440px] flex-1 px-[var(--ui-gutter)] pt-8 pb-16">
        <h1 className="page-title mb-1 text-ui-ink">{title}</h1>
        <p className="mb-6 max-w-[68ch] text-[14px] text-ui-graphite">Your account, connected exchanges, keys and data.</p>
        {children}
      </main>
      <footer className="border-t border-ui-rule px-[var(--ui-gutter)] py-4 text-[13px] text-ui-graphite">
        FillScore audits past execution. It is not financial advice.
      </footer>
    </div>
  )
}

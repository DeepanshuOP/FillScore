import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'
import { ToastProvider } from '../ui/Toast'
import { labHref, type Font, type LabParams, type Theme } from './params'

const PAGES = [
  { path: '/design-lab', label: 'Components' },
  { path: '/design-lab/dashboard', label: 'Dashboard mock' },
  { path: '/design-lab/hero', label: 'Landing hero' },
  { path: '/design-lab/fonts', label: 'Type specimens' },
] as const

const THEMES: Array<{ id: Theme; label: string }> = [{ id: 'a', label: 'A, Audit report (light)' }, { id: 'b', label: 'B, Tape (dark)' }]
const FONTS: Array<{ id: Font; label: string }> = [{ id: 'plex', label: 'IBM Plex Sans' }, { id: 'hanken', label: 'Hanken Grotesk' }, { id: 'schibsted', label: 'Schibsted Grotesk' }]

function Switch<T extends string>({ label, items, current, href }: { label: string; items: Array<{ id: T; label: string }>; current: T; href: (id: T) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-sm text-ui-graphite">{label}</span>
      {items.map((i) => (
        <Link key={i.id} href={href(i.id)} aria-current={i.id === current ? 'true' : undefined}
          className={cn('rounded-ui px-2 py-1 text-sm', i.id === current ? 'bg-ui-ink font-medium text-ui-surface no-underline' : 'text-ui-ink underline')}>{i.label}</Link>
      ))}
    </div>
  )
}

/**
 * The lab's frame: sets the theme and type attributes, and offers the two lab-only switches (direction and family).
 * These switches are for choosing; the product ships one theme and no toggle (question 3).
 */
export function LabShell({ params, page, title, intro, children }: { params: LabParams; page: string; title: string; intro: string; children: ReactNode }) {
  return (
    <div data-ui-theme={params.theme} data-ui-font={params.font} className="min-h-screen">
      <ToastProvider>
        <header className="border-b border-ui-rule">
          <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-4 sm:px-8">
            <nav aria-label="Design lab pages" className="flex flex-wrap gap-x-5 gap-y-1">
              {PAGES.map((p) => (
                <Link key={p.path} href={labHref(p.path, params)} aria-current={p.path === page ? 'page' : undefined}
                  className={cn('py-1 text-sm', p.path === page ? 'font-semibold text-ui-ink no-underline' : 'text-ui-graphite underline')}>{p.label}</Link>
              ))}
            </nav>
            <Switch label="Direction" items={THEMES} current={params.theme} href={(id) => labHref(page, { ...params, theme: id })} />
            <Switch label="Type" items={FONTS} current={params.font} href={(id) => labHref(page, { ...params, font: id })} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
          <h1 className="max-w-[24ch] text-[1.75rem] leading-9 font-semibold text-balance text-ui-ink sm:text-[2.5rem] sm:leading-[1.15]">{title}</h1>
          <p className="mt-3 max-w-[68ch] text-ui-graphite">{intro}</p>
          <div className="mt-10 flex flex-col gap-12">{children}</div>
        </main>
      </ToastProvider>
    </div>
  )
}

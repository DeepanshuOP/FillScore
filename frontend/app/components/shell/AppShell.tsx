'use client'

import Link from 'next/link'
import { useState, type ReactNode } from 'react'
import { ChevronDown, Menu } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { ProvenanceChip } from '../../ui/ProvenanceChip'
import { navHref } from '../../utils/navLinks'
import { CommandMenu } from './CommandMenu'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { accountLabel, DEMO_ACCOUNTS, VIEW_LABEL, VIEWS, viewHref, type View } from './nav'

export type ShellPage = View | 'trades' | 'analytics' | 'settings' | 'methodology'

interface Props {
  /** The demo account shown, or null for the signed-in account. */
  userId: string | null
  page: ShellPage
  /** Stored provenance of the data on screen; null while unknown. */
  dataSource?: 'synthetic-demo' | 'real-user' | null
  period?: string | null
  venue?: string | null
  title?: string
  actions?: ReactNode
  children: ReactNode
}

const isView = (p: ShellPage): p is View => (VIEWS as readonly string[]).includes(p)

/** The pages behind "More": Trades, Analytics, Methodology, and Settings when signed in. */
function morePages(userId: string | null, signedIn: boolean) {
  const pageHref = (p: string) => navHref(p, userId ?? undefined, signedIn)
  return [
    { id: 'trades', label: 'Trades', href: pageHref('/trades') },
    { id: 'analytics', label: 'Analytics', href: pageHref('/analytics') },
    { id: 'methodology', label: 'Methodology', href: '/methodology' },
    ...(signedIn ? [{ id: 'settings', label: 'Settings', href: '/settings' }] : []),
  ] as const
}

function AccountSwitcher({ userId, signedIn, className }: { userId: string | null; signedIn: boolean; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('inline-flex h-9 min-w-0 items-center gap-1.5 rounded-[4px] px-1.5 text-[15px] font-bold text-ui-ink hover:bg-ui-overlay', className)}>
        <span className="sr-only">Account: </span><span className="truncate">{accountLabel(userId)}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-ui-graphite" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-mono text-[11px] font-normal tracking-[0.06em] text-ui-graphite uppercase">Demo accounts: synthetic traders, real prices</DropdownMenuLabel>
        {DEMO_ACCOUNTS.map((a) => (
          <DropdownMenuItem key={a.id} asChild><Link href={viewHref('overview', a.id, signedIn)} className="no-underline">{a.label}</Link></DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {signedIn
          ? <DropdownMenuItem asChild><Link href="/dashboard" className="no-underline">Your account</Link></DropdownMenuItem>
          : <DropdownMenuItem asChild><Link href="/signup" className="no-underline">Connect your own account</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Signed in: the e-mail (to settings) and "Log out". Signed out: "Log in". */
function AccountEnd({ signedIn, inDrawer = false }: { signedIn: boolean; inDrawer?: boolean }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  if (!signedIn) {
    return <Link href="/login" className={cn('whitespace-nowrap text-sm font-medium text-ui-ink', !inDrawer && 'max-md:hidden')}>Log in</Link>
  }
  return (
    <span className={cn('flex min-w-0 items-center gap-3', !inDrawer && 'max-lg:hidden')}>
      <Link href="/settings" className="min-w-0 truncate font-mono text-[12px] text-ui-graphite no-underline hover:text-ui-ink" title="Settings">{user?.email ?? 'Your account'}</Link>
      <button type="button" onClick={() => { void logout(); router.push('/') }} className="whitespace-nowrap text-sm font-medium text-ui-ink underline decoration-ui-edge underline-offset-[0.3em]">Log out</button>
    </span>
  )
}

/** Section tabs: the six views of the audit, then "More" (a menu). The current one is ink and underlined twice. */
function SectionTabs({ userId, signedIn, page }: { userId: string | null; signedIn: boolean; page: ShellPage }) {
  const more = morePages(userId, signedIn)
  const moreActive = more.find((p) => p.id === page)
  return (
    <nav aria-label="App" className="flex items-end gap-1 max-lg:hidden">
      {VIEWS.map((v) => {
        const on = page === v
        return (
          <Link key={v} href={viewHref(v, userId, signedIn)} aria-current={on ? 'page' : undefined}
            className={cn('relative px-3 pt-2 pb-2.5 text-[15px] no-underline transition-colors',
              on ? 'font-bold text-ui-ink after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:border-y after:border-ui-ink' : 'font-medium text-ui-graphite hover:text-ui-ink')}>
            {VIEW_LABEL[v]}
          </Link>
        )
      })}
      <DropdownMenu>
        <DropdownMenuTrigger className={cn('relative inline-flex items-center gap-1 px-3 pt-2 pb-2.5 text-[15px]',
          moreActive ? 'font-bold text-ui-ink after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:border-y after:border-ui-ink' : 'font-medium text-ui-graphite hover:text-ui-ink')}>
          {moreActive ? moreActive.label : 'More'}<ChevronDown aria-hidden="true" className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {more.map((p) => (
            <DropdownMenuItem key={p.id} asChild>
              <Link href={p.href} aria-current={page === p.id ? 'page' : undefined} className={cn('no-underline', page === p.id && 'font-bold')}>{p.label}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}

/** The phone navigation, inside the Vaul drawer: every section and page as a printed list. */
function DrawerNav({ userId, signedIn, page, onNavigate }: { userId: string | null; signedIn: boolean; page: ShellPage; onNavigate: () => void }) {
  const items = [...VIEWS.map((v) => ({ id: v as string, label: VIEW_LABEL[v], href: viewHref(v, userId, signedIn) })), ...morePages(userId, signedIn)]
  return (
    <nav aria-label="App" className="border-t border-ui-ink">
      <ul>
        {items.map((it, i) => (
          <li key={it.id} className={cn(i === VIEWS.length && 'border-t border-dashed border-ui-edge')}>
            <Link href={it.href} onClick={onNavigate} aria-current={page === it.id ? 'page' : undefined}
              className={cn('flex h-12 items-center justify-between border-b border-dashed border-ui-rule text-lg no-underline', page === it.id ? 'font-black text-ui-ink' : 'font-medium text-ui-ink')}>
              {it.label}
              {page === it.id ? <span className="font-mono text-[11px] font-normal text-ui-pen-ink">YOU ARE HERE</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * The app shell of design v3 "Tape & Receipt": one top bar on the paper (wordmark with the orange dot, account switcher,
 * the synthetic badge, the period, ⌘K, theme) and a row of section tabs (Overview ... Evidence, then Trades, Analytics,
 * Methodology in "More"). No sidebar. On phones the tabs collapse into a Vaul drawer behind "Menu".
 */
export function AppShell({ userId, page, dataSource, period, venue, title, actions, children }: Props) {
  const { accessToken } = useAuth()
  const signedIn = !!accessToken
  const [cmdOpen, setCmdOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const heading = title ?? (isView(page) ? VIEW_LABEL[page] : page.charAt(0).toUpperCase() + page.slice(1))

  return (
    <div className="flex min-h-dvh flex-col bg-ui-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ui-raised focus:px-3 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-30 bg-ui-surface/95 px-[var(--ui-gutter)] backdrop-blur-sm">
        <div className="flex h-14 items-center gap-3 lg:gap-5">
          <Link href="/" className="shrink-0 no-underline" aria-label="FillScore home"><Logo /></Link>
          <AccountSwitcher userId={userId} signedIn={signedIn} className="max-sm:hidden" />
          {dataSource ? <ProvenanceChip dataSource={dataSource} className="max-md:hidden" /> : null}
          <span className="flex-1" />
          {period || venue ? (
            <p className="truncate font-mono text-[12px] text-ui-graphite max-lg:hidden">
              {period ? <><span className="sr-only">Period: </span>{period}</> : null}
              {venue ? <span className="ml-3"><span className="sr-only">Venue: </span>{venue}</span> : null}
            </p>
          ) : null}
          {actions}
          <button type="button" onClick={() => setCmdOpen(true)}
            className="inline-flex h-8 items-center gap-2.5 rounded-[4px] border border-ui-edge px-2.5 text-[13px] text-ui-graphite hover:border-ui-ink hover:text-ui-ink max-sm:px-2">
            <span className="max-sm:sr-only">Jump to</span><kbd aria-hidden="true" className="fs-kbd border-0 p-0">⌘K</kbd>
          </button>
          <ThemeToggle className="max-sm:hidden" />
          <AccountEnd signedIn={signedIn} />
          <button type="button" onClick={() => setSheetOpen(true)} className="inline-flex h-9 items-center gap-1.5 text-sm font-bold text-ui-ink lg:hidden">
            <Menu aria-hidden="true" className="size-4" /> Menu
          </button>
        </div>
        <div className="flex items-end justify-between gap-4 border-b border-ui-ink">
          <SectionTabs userId={userId} signedIn={signedIn} page={page} />
          <p className="flex min-w-0 items-center gap-2 pb-2 text-[15px] font-bold text-ui-ink lg:hidden">
            <span className="truncate">{heading}</span>
            {dataSource ? <ProvenanceChip dataSource={dataSource} className="md:hidden" /> : null}
          </p>
        </div>
      </header>
      {isView(page) ? null : <h1 className="sr-only">{heading}</h1>}
      <main id="main" className="w-full max-w-[1440px] flex-1 px-[var(--ui-gutter)] pt-6 pb-16 lg:pt-8">{children}</main>
      <footer className="border-t border-ui-rule px-[var(--ui-gutter)] py-4 font-mono text-[11px] text-ui-graphite">
        FillScore audits past execution. It is not financial advice.
      </footer>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="bg-ui-raised">
          <DrawerTitle className="sr-only">Navigation</DrawerTitle>
          <DrawerDescription className="sr-only">Sections of the audit and the other pages</DrawerDescription>
          <div className="flex flex-col gap-4 px-5 pt-2 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <AccountSwitcher userId={userId} signedIn={signedIn} className="-ml-1.5" />
              <ThemeToggle />
            </div>
            <DrawerNav userId={userId} signedIn={signedIn} page={page} onNavigate={() => setSheetOpen(false)} />
            <AccountEnd signedIn={signedIn} inDrawer />
          </div>
        </DrawerContent>
      </Drawer>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} userId={userId} signedIn={signedIn} />
    </div>
  )
}

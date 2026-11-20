'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { ChevronsUpDown, Command, FileCheck2, LayoutGrid, ListOrdered, Menu, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Sparkles, Trophy, Table2, Activity, BookOpen, LogIn, LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '../../../lib/utils'
import { useAuth } from '../../context/AuthContext'
import { ProvenanceChip } from '../../ui/ProvenanceChip'
import { navHref } from '../../utils/navLinks'
import { CommandMenu } from './CommandMenu'
import { Logo } from './Logo'
import { ThemeToggle } from './ThemeToggle'
import { accountLabel, DEMO_ACCOUNTS, VIEW_LABEL, VIEWS, viewHref, type View } from './nav'

const VIEW_ICON: Record<View, typeof LayoutGrid> = { overview: LayoutGrid, orders: ListOrdered, rules: ShieldCheck, rankings: Trophy, council: Sparkles, evidence: FileCheck2 }

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

function NavItem({ href, icon: Icon, label, active, collapsed, onClick }: { href: string; icon: typeof LayoutGrid; label: string; active: boolean; collapsed: boolean; onClick?: () => void }) {
  return (
    <Link href={href} onClick={onClick} aria-current={active ? 'page' : undefined} title={collapsed ? label : undefined}
      className={cn('group relative flex h-9 items-center gap-3 rounded-[9px] px-2.5 text-[13.5px] no-underline transition-colors',
        active ? 'bg-ui-overlay text-ui-ink' : 'text-ui-graphite hover:bg-ui-overlay/60 hover:text-ui-ink', collapsed && 'justify-center px-0')}>
      {active ? <span aria-hidden="true" className="absolute inset-y-2 -left-3 w-[2px] rounded-full bg-ui-action" /> : null}
      <Icon aria-hidden="true" strokeWidth={1.75} className={cn('size-4 shrink-0', active && 'text-ui-ink')} />
      {collapsed ? <span className="sr-only">{label}</span> : <span className="truncate">{label}</span>}
    </Link>
  )
}

function AccountSwitcher({ userId, signedIn, collapsed }: { userId: string | null; signedIn: boolean; collapsed: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left ring-1 ring-inset ring-ui-rule transition-colors hover:bg-ui-overlay', collapsed && 'justify-center p-1.5')}
        aria-label={collapsed ? `Account: ${accountLabel(userId)}` : undefined}>
        <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-ui-overlay text-[12px] font-semibold text-ui-ink">
          {accountLabel(userId).charAt(0)}
        </span>
        {collapsed ? null : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-ui-ink">{accountLabel(userId)}</span>
              <span className="block truncate text-[11px] text-ui-graphite">{userId ? 'Synthetic trader, real prices' : 'Read-only key'}</span>
            </span>
            <ChevronsUpDown aria-hidden="true" className="size-3.5 text-ui-graphite" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-[12px] font-normal text-ui-graphite">Demo accounts (synthetic)</DropdownMenuLabel>
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

/** The signed-in account: its e-mail (a link to settings) and "Log out". */
function AccountRow({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const out = () => { void logout(); router.push('/') }
  if (collapsed) {
    return (
      <button type="button" onClick={out} aria-label="Log out" className="mx-auto grid size-9 place-items-center rounded-md text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink">
        <LogOut aria-hidden="true" className="size-4" />
      </button>
    )
  }
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <Link href="/settings" className="min-w-0 truncate text-[12px] text-ui-graphite no-underline hover:text-ui-ink" title="Settings">{user?.email ?? 'Your account'}</Link>
      <button type="button" onClick={out} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink">
        <LogOut aria-hidden="true" className="size-3.5" /> Log out
      </button>
    </div>
  )
}

function NavList({ userId, signedIn, page, collapsed, onNavigate }: { userId: string | null; signedIn: boolean; page: ShellPage; collapsed: boolean; onNavigate?: () => void }) {
  const pageHref = (p: string) => navHref(p, userId ?? undefined, signedIn)
  return (
    <nav aria-label="App" className="flex flex-col gap-0.5">
      {VIEWS.map((v) => <NavItem key={v} href={viewHref(v, userId, signedIn)} icon={VIEW_ICON[v]} label={VIEW_LABEL[v]} active={page === v} collapsed={collapsed} onClick={onNavigate} />)}
      <div className="my-2 h-px bg-ui-rule" />
      <NavItem href={pageHref('/trades')} icon={Table2} label="Trades" active={page === 'trades'} collapsed={collapsed} onClick={onNavigate} />
      <NavItem href={pageHref('/analytics')} icon={Activity} label="Analytics" active={page === 'analytics'} collapsed={collapsed} onClick={onNavigate} />
      <NavItem href="/methodology" icon={BookOpen} label="Methodology" active={page === 'methodology'} collapsed={collapsed} onClick={onNavigate} />
      {signedIn ? <NavItem href="/settings" icon={Settings} label="Settings" active={page === 'settings'} collapsed={collapsed} onClick={onNavigate} /> : null}
    </nav>
  )
}

/**
 * The app shell of design v2: a collapsible left sidebar (account switcher, sections, pages), a top bar (title, period,
 * venue, the synthetic-demo badge, theme, actions, ⌘K) and, on phones, a bottom sheet for navigation (Vaul).
 */
export function AppShell({ userId, page, dataSource, period, venue, title, actions, children }: Props) {
  const { accessToken } = useAuth()
  const signedIn = !!accessToken
  const [collapsed, setCollapsed] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setCollapsed(localStorage.getItem('fs-sidebar') === 'collapsed'))
    return () => cancelAnimationFrame(id)
  }, [])
  const toggle = () => setCollapsed((c) => { localStorage.setItem('fs-sidebar', c ? 'open' : 'collapsed'); return !c })

  const heading = title ?? (page in VIEW_LABEL ? VIEW_LABEL[page as View] : page.charAt(0).toUpperCase() + page.slice(1))

  return (
    <div className="flex min-h-dvh bg-ui-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-ui-overlay focus:px-3 focus:py-2">Skip to content</a>
      <aside className={cn('sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-ui-rule bg-[color-mix(in_srgb,var(--ui-surface),var(--ui-raised)_50%)] transition-[width] duration-200 ease-out lg:flex', collapsed ? 'w-[68px] px-2.5' : 'w-[248px] px-3')}>
        <div className={cn('flex h-14 items-center', collapsed ? 'justify-center' : 'justify-between px-1')}>
          <Link href="/" className="no-underline" aria-label="FillScore home"><Logo compact={collapsed} /></Link>
          {collapsed ? null : (
            <button type="button" onClick={toggle} aria-label="Collapse the sidebar" className="grid size-7 place-items-center rounded-md text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink">
              <PanelLeftClose aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <AccountSwitcher userId={userId} signedIn={signedIn} collapsed={collapsed} />
        <div className="mt-4 flex-1 overflow-y-auto"><NavList userId={userId} signedIn={signedIn} page={page} collapsed={collapsed} /></div>
        <div className="flex flex-col gap-1 border-t border-ui-rule py-3">
          {signedIn ? <AccountRow collapsed={collapsed} /> : null}
          {collapsed ? (
            <button type="button" onClick={toggle} aria-label="Expand the sidebar" className="mx-auto grid size-9 place-items-center rounded-md text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink">
              <PanelLeftOpen aria-hidden="true" className="size-4" />
            </button>
          ) : (
            <p className="px-2 text-[11px] leading-4 text-ui-graphite">FillScore audits past execution. It is not financial advice.</p>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-ui-rule bg-ui-surface/80 px-3 backdrop-blur-md sm:px-5">
          <button type="button" onClick={() => setSheetOpen(true)} aria-label="Open navigation" className="grid size-9 place-items-center rounded-[9px] text-ui-graphite hover:bg-ui-overlay lg:hidden">
            <Menu aria-hidden="true" className="size-4" />
          </button>
          <Link href="/" className="no-underline max-sm:hidden lg:hidden" aria-label="FillScore home"><Logo compact /></Link>
          <div className="ml-1 min-w-0 shrink">
            <h1 className="truncate text-[15px] leading-5 font-semibold tracking-[-0.01em] text-ui-ink">{heading}</h1>
            {period || venue ? (
              <p className="hidden truncate text-[11.5px] leading-4 tabular-nums text-ui-graphite md:block">
                {period ? <><span className="sr-only">Period: </span>{period}</> : null}
                {venue ? <span className="ml-3"><span className="sr-only">Venue: </span>{venue}</span> : null}
              </p>
            ) : null}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {dataSource ? <ProvenanceChip dataSource={dataSource} className="hidden whitespace-nowrap sm:inline-flex" /> : null}
            {actions}
            <button type="button" onClick={() => setCmdOpen(true)} className="hidden h-9 items-center gap-2 rounded-[9px] px-2.5 text-[13px] text-ui-graphite ring-1 ring-inset ring-ui-rule hover:text-ui-ink sm:inline-flex">
              <Command aria-hidden="true" className="size-3.5" /> <span className="sr-only whitespace-nowrap 2xl:not-sr-only">Jump to</span><kbd className="font-ui text-[11px] text-ui-graphite">⌘K</kbd>
            </button>
            <button type="button" onClick={() => setCmdOpen(true)} aria-label="Jump to" className="grid size-9 place-items-center rounded-[9px] text-ui-graphite hover:bg-ui-overlay sm:hidden">
              <Command aria-hidden="true" className="size-4" />
            </button>
            <ThemeToggle />
            {!signedIn ? (
              <Link href="/login" className="hidden h-9 items-center gap-1.5 whitespace-nowrap rounded-[9px] px-2.5 text-[13px] text-ui-graphite no-underline hover:bg-ui-overlay hover:text-ui-ink md:inline-flex">
                <LogIn aria-hidden="true" className="size-3.5" /> Log in
              </Link>
            ) : null}
          </div>
        </header>
        {dataSource ? (
          <div className="flex items-center gap-2 border-b border-ui-rule px-4 py-2 sm:hidden"><ProvenanceChip dataSource={dataSource} /></div>
        ) : null}
        <main id="main" className="mx-auto w-full max-w-[1320px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>

      <Drawer open={sheetOpen} onOpenChange={setSheetOpen}>
        <DrawerContent className="bg-ui-raised">
          <DrawerTitle className="sr-only">Navigation</DrawerTitle>
          <div className="flex flex-col gap-4 px-4 pt-2 pb-8">
            <AccountSwitcher userId={userId} signedIn={signedIn} collapsed={false} />
            <NavList userId={userId} signedIn={signedIn} page={page} collapsed={false} onNavigate={() => setSheetOpen(false)} />
            {signedIn ? <div className="border-t border-ui-rule pt-3"><AccountRow collapsed={false} /></div>
              : <Link href="/login" className="text-sm text-ui-ink">Log in</Link>}
          </div>
        </DrawerContent>
      </Drawer>
      <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} userId={userId} signedIn={signedIn} />
    </div>
  )
}

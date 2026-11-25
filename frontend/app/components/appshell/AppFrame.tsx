'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { BookOpen, ChevronDown, ChevronsLeft, ChevronsRight, Ellipsis, LogIn, LogOut, Search, Settings, User } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '../../../lib/utils'
import { apiBase } from '../../lib/apiBase'
import { describeHeadline, totalBpsLabel } from '../../dashboard/headline'
import { ProvenanceChip } from '../../ui/ProvenanceChip'
import { Logo } from '../shell/Logo'
import { ThemeToggle } from '../shell/ThemeToggle'
import { DEMO_ACCOUNTS, GROUP_TITLE, PHONE_BAR, SECTIONS, sectionOfPath, viewHref, type SectionGroup, type SectionId } from '../shell/nav'
import { SECTION_ICON } from '../shell/navIcons'
import { PeriodLabel } from './PeriodLabel'
import { ProvenanceBanner } from './ProvenanceBanner'
import { ShellHeaderProvider, useShellHeaderState, useShellSlotRef } from './shellContext'
import { useAccount, type Account } from './useAccount'

// Design v5 (⌘K on first open): the palette and cmdk load when it is first opened, not with the frame (PROPOSAL §8).
const CommandMenu = dynamic(() => import('../shell/CommandMenu'), { ssr: false })
const PhoneMoreSheet = dynamic(() => import('./PhoneMoreSheet'), { ssr: false })   // Vaul loads when More is first pressed (design v5 step 7)

const MQ_NARROW = '(max-width: 1279px)'
const subscribeNarrow = (cb: () => void) => { const m = window.matchMedia(MQ_NARROW); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const isNarrow = () => window.matchMedia(MQ_NARROW).matches

const GROUPS: SectionGroup[] = ['main', 'review', 'tools']
const itemClass = 'flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-[14px] font-medium text-ui-graphite no-underline transition-colors hover:bg-ui-overlay hover:text-ui-ink pointer-coarse:min-h-11 aria-[current=page]:bg-ui-raised aria-[current=page]:text-ui-ink aria-[current=page]:shadow-[inset_0_0_0_1px_var(--ui-rule)]'

/**
 * The account switcher: the three demo traders, then the own account or sign-up. It keeps the section you are on. A long name
 * ends in an ellipsis, and a tooltip shows it whole.
 */
function AccountSwitcher({ account, section, className, compact = false }: { account: Account; section: SectionId | null; className?: string; compact?: boolean }) {
  // each demo's total cost in bps, as the server sends it; read once, the first time the menu opens
  const [bps, setBps] = useState<Record<string, string>>({})
  const asked = useRef(false)
  const load = (open: boolean) => {
    if (!open || asked.current) return
    asked.current = true
    for (const a of DEMO_ACCOUNTS) {
      fetch(`${apiBase()}/audit/orders-summary?userId=${a.id}`).then((r) => (r.ok ? r.json() : null))
        .then((body) => { const l = totalBpsLabel(describeHeadline(body, true)); if (l) setBps((s) => ({ ...s, [a.id]: l })) })
        .catch(() => undefined)
    }
  }
  const to = section ?? 'home'
  return (
    <DropdownMenu onOpenChange={load}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger data-testid="account-switcher" aria-label={compact ? `Account: ${account.label}` : undefined}
            className={cn('inline-flex min-h-9 min-w-0 max-w-full items-center gap-2 rounded-lg border border-ui-edge bg-ui-raised px-2.5 text-left text-[14px] font-medium text-ui-ink hover:bg-ui-overlay pointer-coarse:min-h-11', compact && 'size-11 justify-center px-0', className)}>
            {compact ? <User aria-hidden="true" className="size-5" /> : (<>
              <span className="sr-only">Account: </span><span className="min-w-0 flex-1 truncate">{account.label}</span>
              <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-ui-graphite" />
            </>)}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">{account.label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" data-app className="w-72 max-w-[calc(100vw-24px)]">
        <DropdownMenuLabel className="text-[12px] font-normal text-ui-graphite">Demo accounts: synthetic traders, real prices</DropdownMenuLabel>
        {DEMO_ACCOUNTS.map((a) => (
          <DropdownMenuItem key={a.id} asChild className="min-h-9 pointer-coarse:min-h-11">
            <Link href={viewHref(to, a.id, account.signedIn)} className="flex w-full items-baseline justify-between gap-3 no-underline">
              <span className="min-w-0 truncate">{a.label}</span>{bps[a.id] ? <span data-testid="picker-bps" className="shrink-0 text-[13px] text-ui-graphite">{bps[a.id]}</span> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {account.signedIn
          ? <DropdownMenuItem asChild className="min-h-9 pointer-coarse:min-h-11"><Link href={viewHref(to, null, true)} className="no-underline">Your account</Link></DropdownMenuItem>
          : <DropdownMenuItem asChild className="min-h-9 pointer-coarse:min-h-11"><Link href="/signup" className="no-underline">Connect your own account</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function NavItem({ id, account, active, rail, onNavigate }: { id: SectionId; account: Account; active: boolean; rail?: boolean; onNavigate?: () => void }) {
  const s = SECTIONS.find((x) => x.id === id)!
  const Icon = SECTION_ICON[id]
  return (
    <Link href={viewHref(id, account.demoId, account.signedIn)} aria-current={active ? 'page' : undefined} aria-label={rail ? s.label : undefined} title={rail ? s.label : undefined}
      onClick={onNavigate} data-testid={`nav-${id}`} className={cn(itemClass, rail && 'justify-center px-0')}>
      <Icon aria-hidden="true" className="size-[18px] shrink-0" />
      {rail ? null : <span className="min-w-0 truncate">{s.label}</span>}
    </Link>
  )
}

/** The grouped nouns: Home, Costs, Orders, Fills; Review; Tools. Group titles are 12 px, sentence case, muted. */
function NavGroups({ account, active, rail, onNavigate }: { account: Account; active: SectionId | null; rail?: boolean; onNavigate?: () => void }) {
  return (
    <>
      {GROUPS.map((g) => (
        <div key={g} className="flex flex-col gap-0.5" role="group" aria-label={GROUP_TITLE[g] ?? 'Main'}>
          {GROUP_TITLE[g] && !rail ? <p className="px-2.5 pb-1 text-[12px] font-medium text-ui-graphite">{GROUP_TITLE[g]}</p> : null}
          {SECTIONS.filter((s) => s.group === g).map((s) => <NavItem key={s.id} id={s.id} account={account} active={s.id === active} rail={rail} onNavigate={onNavigate} />)}
        </div>
      ))}
    </>
  )
}

/** Below the sections: Docs, Settings (when signed in), the theme, and the account (log in or out). */
function FootGroup({ account, rail, onNavigate }: { account: Account; rail?: boolean; onNavigate?: () => void }) {
  const router = useRouter()
  return (
    <div className="flex flex-col gap-0.5">
      <Link href="/docs" onClick={onNavigate} aria-label={rail ? 'Docs' : undefined} title={rail ? 'Docs' : undefined} className={cn(itemClass, rail && 'justify-center px-0')}><BookOpen aria-hidden="true" className="size-[18px]" />{rail ? null : 'Docs'}</Link>
      {account.signedIn
        ? <Link href="/app/settings" onClick={onNavigate} aria-label={rail ? 'Settings' : undefined} title={rail ? 'Settings' : undefined} className={cn(itemClass, rail && 'justify-center px-0')}><Settings aria-hidden="true" className="size-[18px]" />{rail ? null : 'Settings'}</Link>
        : null}
      <ThemeToggle iconOnly={rail} className={rail ? 'justify-center px-0' : 'w-full'} />
      {rail ? null : account.signedIn ? (
        <>
          {account.email ? <p className="truncate px-2.5 pt-2 text-[13px] text-ui-graphite" data-testid="shell-email">{account.email}</p> : null}
          <button type="button" onClick={() => { onNavigate?.(); void account.logout(); router.push('/') }} className={cn(itemClass, 'w-full')}><LogOut aria-hidden="true" className="size-[18px]" />Log out</button>
        </>
      ) : (
        <Link href="/login" onClick={onNavigate} className={itemClass}><LogIn aria-hidden="true" className="size-[18px]" />Log in</Link>
      )}
    </div>
  )
}

function Sidebar({ rail, onToggleRail, onOpenPalette }: { rail: boolean; onToggleRail: () => void; onOpenPalette: () => void }) {
  const account = useAccount()
  const active = sectionOfPath(usePathname())
  return (
    <aside className="fa-side" aria-label="App">
      <div className={cn('flex items-center gap-2', rail ? 'flex-col' : 'justify-between px-1')}>
        <Link href="/" className="inline-flex min-h-9 items-center no-underline" aria-label="FillScore home"><Logo compact={rail} /></Link>
        <button type="button" onClick={onOpenPalette} aria-label="Search and jump to (⌘K)" data-testid="open-palette"
          className="inline-flex size-9 items-center justify-center rounded-lg text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink"><Search aria-hidden="true" className="size-[18px]" /></button>
      </div>
      {rail ? null : <AccountSwitcher account={account} section={active} className="w-full" />}
      <nav aria-label="Sections" className="flex flex-1 flex-col gap-4 overflow-y-auto"><NavGroups account={account} active={active} rail={rail} /></nav>
      <div className="flex flex-col gap-2 border-t border-ui-rule pt-3">
        <FootGroup account={account} rail={rail} />
        <button type="button" onClick={onToggleRail} aria-label={rail ? 'Expand the sidebar' : 'Collapse the sidebar'}
          className="inline-flex size-9 items-center justify-center self-start rounded-lg text-ui-graphite hover:bg-ui-overlay hover:text-ui-ink xl:hidden">
          {rail ? <ChevronsRight aria-hidden="true" className="size-4" /> : <ChevronsLeft aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </aside>
  )
}

/** The phone's top bar: the logo mark, the page title, search and the account. */
function PhoneTopBar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const account = useAccount()
  const pathname = usePathname()
  const { header } = useShellHeaderState()
  const section = sectionOfPath(pathname)
  const title = header.title ?? (section ? SECTIONS.find((s) => s.id === section)!.label : 'FillScore')
  return (
    <div className="fa-top" data-testid="phone-top-bar">
      <Link href="/" aria-label="FillScore home" className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center no-underline"><Logo compact /></Link>
      <p className="min-w-0 flex-1 truncate text-[16px] font-semibold text-ui-ink">{title}</p>
      <button type="button" onClick={onOpenPalette} aria-label="Search and jump to" className="inline-flex size-11 items-center justify-center rounded-lg text-ui-graphite hover:bg-ui-overlay"><Search aria-hidden="true" className="size-5" /></button>
      <AccountSwitcher account={account} section={section} compact />
    </div>
  )
}

/** The phone: the bottom bar (Home, Costs, Orders, More with icons and 12 px labels) and its More sheet. */
function PhoneBar() {
  const account = useAccount()
  const active = sectionOfPath(usePathname())
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)   // the sheet's code (Vaul) loads when More is first pressed
  const moreActive = active !== null && !PHONE_BAR.includes(active)
  const tab = 'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[12px] font-medium no-underline text-ui-graphite aria-[current=page]:text-ui-ink'
  return (
    <nav className="fa-bar" aria-label="Sections">
      {PHONE_BAR.map((id) => {
        const s = SECTIONS.find((x) => x.id === id)!
        const Icon = SECTION_ICON[id]
        return <Link key={id} href={viewHref(id, account.demoId, account.signedIn)} aria-current={id === active ? 'page' : undefined} className={tab}><Icon aria-hidden="true" className="size-5" />{s.label}</Link>
      })}
      <button type="button" aria-haspopup="dialog" aria-current={moreActive ? 'page' : undefined} data-testid="phone-more" className={cn(tab, 'bg-transparent')}
        onClick={() => { setRequested(true); setOpen(true) }}><Ellipsis aria-hidden="true" className="size-5" />More</button>
      {requested ? (
        <PhoneMoreSheet open={open} onOpenChange={setOpen}>
          <div className="mb-4"><AccountSwitcher account={account} section={active} className="w-full" /></div>
          <div className="flex flex-col gap-4">
            {GROUPS.map((g) => (
              <div key={g} className="flex flex-col gap-0.5">
                {GROUP_TITLE[g] ? <p className="px-2.5 pb-1 text-[12px] font-medium text-ui-graphite">{GROUP_TITLE[g]}</p> : null}
                {SECTIONS.filter((s) => s.group === g && !PHONE_BAR.includes(s.id)).map((s) => <NavItem key={s.id} id={s.id} account={account} active={s.id === active} onNavigate={() => setOpen(false)} />)}
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-ui-rule pt-3"><FootGroup account={account} onNavigate={() => setOpen(false)} /></div>
        </PhoneMoreSheet>
      ) : null}
    </nav>
  )
}

/**
 * The page header, on every app page (PROPOSAL §3.2): the title (24 px), one sentence, the period as a disabled label styled like
 * the future picker, and the page's actions (one primary, the rest behind "⋯") in the slot. The provenance banner sits above it.
 */
function PageHeader() {
  const account = useAccount()
  const pathname = usePathname()
  const { header } = useShellHeaderState()
  const setSlot = useShellSlotRef()
  const section = sectionOfPath(pathname)
  const dataSource = header.dataSource ?? account.dataSource
  const heading = header.title ?? (section ? SECTIONS.find((s) => s.id === section)!.label : 'FillScore')
  return (
    <>
      <ProvenanceBanner dataSource={dataSource} sourceText={header.sourceText} />
      <header className="fa-head" data-testid="app-page-header">
        <div className="min-w-0">
          {header.ownHeading ? <h1 className="sr-only">{heading}</h1> : <h1 className="page-title text-ui-ink" data-testid="page-title">{heading}</h1>}
          {header.description && !header.ownHeading ? <p className="mt-1 max-w-[68ch] text-[14px] leading-normal text-ui-graphite" data-testid="page-description">{header.description}</p> : null}
          {dataSource === 'real-user' ? <ProvenanceChip dataSource="real-user" className="mt-2" /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {header.period ? <PeriodLabel period={header.period} /> : null}
          <div ref={setSlot} className="flex flex-wrap items-center gap-2" />
        </div>
      </header>
    </>
  )
}

/** ⌘K or Ctrl K opens the palette. The palette's code is requested the first time it opens (design v5). */
function usePalette() {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setLoaded(true); setOpen((o) => !o) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return { open, loaded, setOpen, openIt: () => { setLoaded(true); setOpen(true) } }
}

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const account = useAccount()
  return <CommandMenu open={open} onOpenChange={onOpenChange} userId={account.demoId} signedIn={account.signedIn} />
}

/**
 * The app frame (design v5): a neutral grey ground (`data-app`, tokens.css) with a sidebar of nouns and icons (a 64 px rail from 1024
 * to 1279 px, the phone's top bar and bottom bar below 1024), the provenance banner and page header, and the lazy palette.
 * It lives in the layout, so it stays while the page changes. Pages report their provenance, period, title and sentence through
 * `AppPage`; they own their data.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false)
  const [choice, setChoice] = useState<{ narrow: boolean; rail: boolean } | null>(null)
  const rail = choice && choice.narrow === narrow ? choice.rail : narrow
  const palette = usePalette()
  const pathname = usePathname()
  return (
    <ShellHeaderProvider>
      <div className="fa-app" data-app data-rail={rail}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-ui-raised focus:px-3 focus:py-2">Skip to content</a>
        <Suspense fallback={<aside className="fa-side" aria-hidden="true" />}>
          <Sidebar rail={rail} onToggleRail={() => setChoice({ narrow, rail: !rail })} onOpenPalette={palette.openIt} />
        </Suspense>
        <div className="flex min-h-dvh min-w-0 flex-col">
          <Suspense fallback={<div className="fa-top" aria-hidden="true" />}><PhoneTopBar onOpenPalette={palette.openIt} /></Suspense>
          <Suspense fallback={<header className="fa-head" aria-hidden="true"><div className="h-9" /></header>}><PageHeader /></Suspense>
          <main id="main" key={pathname} className="fa-page w-full max-w-[1440px] flex-1 px-[var(--ui-gutter)] pt-2 pb-16">{children}</main>
          <footer className="border-t border-ui-rule px-[var(--ui-gutter)] py-4 text-[13px] text-ui-graphite">
            FillScore audits past execution. It is not financial advice.
          </footer>
        </div>
        <Suspense fallback={null}><PhoneBar /></Suspense>
        {palette.loaded ? <Suspense fallback={null}><Palette open={palette.open} onOpenChange={palette.setOpen} /></Suspense> : null}
      </div>
    </ShellHeaderProvider>
  )
}

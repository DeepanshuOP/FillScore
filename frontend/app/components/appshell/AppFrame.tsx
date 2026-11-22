'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Suspense, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '../../../lib/utils'
import { apiBase } from '../../lib/apiBase'
import { describeHeadline, totalBpsLabel } from '../../dashboard/headline'
import { MarginNote } from '../../ui/MarginNote'
import { ProvenanceChip } from '../../ui/ProvenanceChip'
import { DEMO_NOTE } from '../../dashboard/scoreV2'
import { CommandMenu } from '../shell/CommandMenu'
import { Logo } from '../shell/Logo'
import { ThemeToggle } from '../shell/ThemeToggle'
import { DEMO_ACCOUNTS, PHONE_BAR, SECTIONS, sectionOfPath, viewHref, type SectionId } from '../shell/nav'
import { ShellHeaderProvider, useShellHeaderState, useShellSlotRef } from './shellContext'
import { useAccount, type Account } from './useAccount'

export interface ShellVersions { scoring: string; measure: string }

const MQ_NARROW = '(max-width: 1279px)'
const subscribeNarrow = (cb: () => void) => { const m = window.matchMedia(MQ_NARROW); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const isNarrow = () => window.matchMedia(MQ_NARROW).matches

/** The account switcher: the three demo traders, then the own account or sign-up. It keeps the section you are on. */
function AccountSwitcher({ account, section, className }: { account: Account; section: SectionId | null; className?: string }) {
  // A3: each demo's total cost in bps, as the server sends it; read once, the first time the menu opens
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
      <DropdownMenuTrigger data-testid="account-switcher" className={cn('inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-[8px] border border-ui-edge px-2.5 text-left text-[14px] font-bold text-ui-ink hover:bg-ui-overlay', className)}>
        <span className="sr-only">Account: </span><span className="truncate">{account.label}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-ui-graphite" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="font-mono text-[11px] font-normal tracking-[0.06em] text-ui-graphite uppercase">Demo accounts: synthetic traders, real prices</DropdownMenuLabel>
        {DEMO_ACCOUNTS.map((a) => (
          <DropdownMenuItem key={a.id} asChild>
            <Link href={viewHref(to, a.id, account.signedIn)} className="flex w-full items-baseline justify-between gap-3 no-underline">
              <span>{a.label}</span>{bps[a.id] ? <span data-testid="picker-bps" className="font-mono text-[12px] text-ui-graphite">{bps[a.id]}</span> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {account.signedIn
          ? <DropdownMenuItem asChild><Link href={viewHref(to, null, true)} className="no-underline">Your account</Link></DropdownMenuItem>
          : <DropdownMenuItem asChild><Link href="/signup" className="no-underline">Connect your own account</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Below the sections: the account's public card, Methodology, Settings (only when signed in), the theme, the versions, log in or out. */
function BottomGroup({ account, versions, onNavigate }: { account: Account; versions: ShellVersions; onNavigate?: () => void }) {
  const router = useRouter()
  const link = 'py-1 text-ui-graphite no-underline hover:text-ui-ink'
  return (
    <div className="flex flex-col items-start gap-1 text-[14px]">
      {account.demoId ? <Link href={`/share/${account.demoId}`} onClick={onNavigate} className={link}>Public score card</Link> : null}
      <Link href="/methodology" onClick={onNavigate} className={link}>Methodology</Link>
      {account.signedIn ? <Link href="/app/settings" onClick={onNavigate} className={link}>Settings</Link> : null}
      <ThemeToggle className="-ml-1 min-w-0 justify-start" />
      <p className="mt-1 font-mono text-[11px] tracking-[0.06em] text-ui-graphite uppercase" data-testid="shell-versions">Scoring {versions.scoring}, measure {versions.measure}</p>
      {account.signedIn
        ? <button type="button" onClick={() => { onNavigate?.(); void account.logout(); router.push('/') }} className="py-1 text-[14px] font-medium text-ui-ink underline decoration-ui-edge underline-offset-[0.3em]">Log out</button>
        : <Link href="/login" onClick={onNavigate} className="py-1 font-medium text-ui-ink no-underline">Log in</Link>}
    </div>
  )
}

function Sidebar({ versions, rail, onToggleRail, onOpenPalette }: { versions: ShellVersions; rail: boolean; onToggleRail: () => void; onOpenPalette: () => void }) {
  const account = useAccount()
  const pathname = usePathname()
  const active = sectionOfPath(pathname)
  const nav = useRef<HTMLElement>(null)
  const [pen, setPen] = useState<{ y: number; w: number } | null>(null)
  // the pen underline sits under the current item: measured after layout, moved by transform (appshell.css); measured again
  // on resize and once the fonts load, so a font swap or a text zoom cannot leave it under the wrong item
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
      setPen(a ? { y: a.offsetTop + a.offsetHeight - 3, w: rail ? Math.max(a.offsetWidth - 16, 16) : 44 } : null)
    }
    place()
    window.addEventListener('resize', place)
    void document.fonts?.ready.then(place)
    return () => window.removeEventListener('resize', place)
  }, [active, rail])
  return (
    <aside className="fa-side" aria-label="App">
      <div className={cn('flex items-center gap-2', rail ? 'flex-col' : 'justify-between')}>
        <Link href="/" className="no-underline" aria-label="FillScore home"><Logo compact={rail} /></Link>
        <button type="button" onClick={onOpenPalette} aria-label="⌘K, jump to a section" className="rounded-[4px] px-1 py-0.5 font-mono text-[11px] text-ui-graphite hover:text-ui-ink"><kbd className="fs-kbd border-0 p-0">⌘K</kbd></button>
      </div>
      {rail ? null : <AccountSwitcher account={account} section={active} />}
      <nav ref={nav} aria-label="Sections" className="fa-nav">
        {SECTIONS.map((s) => (
          <Link key={s.id} href={viewHref(s.id, account.demoId, account.signedIn)} aria-current={s.id === active ? 'page' : undefined} title={rail ? s.label : undefined}>
            <span className="fa-side-text">{s.label}</span><span className="fa-side-short" aria-hidden="true">{s.label.slice(0, 2).toUpperCase()}</span>
          </Link>
        ))}
        {pen ? <span className="fa-pen" aria-hidden="true" style={{ ['--y' as string]: `${pen.y}px`, ['--w' as string]: `${pen.w}px` }} /> : null}
      </nav>
      <div className="mt-auto flex flex-col gap-3 border-t border-ui-rule pt-3">
        {rail ? null : <BottomGroup account={account} versions={versions} />}
        <button type="button" onClick={onToggleRail} aria-label={rail ? 'Expand the sidebar' : 'Collapse the sidebar'} aria-pressed={!rail}
          className="inline-flex size-8 items-center justify-center self-start rounded-[4px] text-ui-graphite hover:text-ui-ink max-xl:inline-flex xl:hidden">
          {rail ? <ChevronsRight aria-hidden="true" className="size-4" /> : <ChevronsLeft aria-hidden="true" className="size-4" />}
        </button>
      </div>
    </aside>
  )
}

/** The phone: the bottom bar of four and its More sheet (Vaul). The palette opens from the sidebar's ⌘K or a keyboard. */
function PhoneBar({ versions }: { versions: ShellVersions }) {
  const account = useAccount()
  const pathname = usePathname()
  const active = sectionOfPath(pathname)
  const [open, setOpen] = useState(false)
  const moreActive = active !== null && !PHONE_BAR.includes(active)
  return (
    <>
      <nav className="fa-bar" aria-label="Sections">
        {PHONE_BAR.map((id) => {
          const s = SECTIONS.find((x) => x.id === id)!
          return <Link key={id} href={viewHref(id, account.demoId, account.signedIn)} aria-current={id === active ? 'page' : undefined}>{s.label}</Link>
        })}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerTrigger asChild><button type="button" aria-haspopup="dialog" aria-current={moreActive ? 'page' : undefined}>More</button></DrawerTrigger>
          <DrawerContent className="bg-ui-raised">
            <div className="fs-torn-top" aria-hidden="true" />
            <DrawerTitle className="sr-only">More</DrawerTitle>
            <DrawerDescription className="sr-only">The other sections of the app, and the account links</DrawerDescription>
            <div className="max-h-[75dvh] overflow-y-auto px-[var(--ui-gutter)] pt-3 pb-8">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">MORE</p>
                <DrawerClose asChild><button type="button" className="min-h-11 px-2 text-[14px] text-ui-ink underline underline-offset-2">Close</button></DrawerClose>
              </div>
              <ul className="mt-1 flex flex-col">
                {SECTIONS.filter((s) => !PHONE_BAR.includes(s.id)).map((s) => (
                  <li key={s.id}>
                    <Link href={viewHref(s.id, account.demoId, account.signedIn)} onClick={() => setOpen(false)} aria-current={s.id === active ? 'page' : undefined} className="block py-2 no-underline">
                      <span className="block text-[17px] font-bold text-ui-ink">{s.label}</span>
                      <span className="block text-[13px] text-ui-graphite">{s.gloss}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-ui-rule pt-3"><BottomGroup account={account} versions={versions} onNavigate={() => setOpen(false)} /></div>
            </div>
          </DrawerContent>
        </Drawer>
      </nav>
    </>
  )
}

/**
 * The page header, on every app page: where the data came from (the stored provenance the page reports; until then what the
 * address implies), the account and the period. On a phone it also holds the account switcher (the sidebar is hidden there).
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
    <header className="fa-head" data-testid="app-page-header">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex w-full min-w-0 items-center gap-3 lg:hidden">
          <Link href="/" aria-label="FillScore home" className="shrink-0 no-underline"><Logo compact /></Link>
          <AccountSwitcher account={account} section={section} className="min-w-0 flex-1" />
        </div>
        {dataSource ? <ProvenanceChip dataSource={dataSource} /> : null}
        {dataSource === 'synthetic-demo' ? <MarginNote label="the demo data">{DEMO_NOTE}</MarginNote> : null}
        <span className="hidden text-[14px] font-bold text-ui-ink lg:inline" data-testid="header-account">{account.label}</span>
        {header.period ? <span className="font-mono text-[12px] tracking-[0.04em] text-ui-graphite" data-testid="header-period"><span className="sr-only">Period: </span>{header.period}</span> : null}
        {header.venue ? <span className="font-mono text-[12px] text-ui-graphite"><span className="sr-only">Venue: </span>{header.venue}</span> : null}
        <span className="flex-1" />
        <div ref={setSlot} className="flex items-center gap-2" />
      </div>
      {header.ownHeading ? null : <h1 className="sr-only">{heading}</h1>}
    </header>
  )
}

function Palette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const account = useAccount()
  return <CommandMenu open={open} onOpenChange={onOpenChange} userId={account.demoId} signedIn={account.signedIn} />
}

/**
 * The app frame (IA v4): one sidebar (a rail from 1024 to 1279 px, a bottom bar below 1024), the page header and the palette.
 * It lives in the layout, so it stays while the page changes and the pen underline can move. Pages report their provenance and
 * period through `AppPage`; they own their data.
 */
export function AppFrame({ versions, children }: { versions: ShellVersions; children: ReactNode }) {
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false)
  const [choice, setChoice] = useState<{ narrow: boolean; rail: boolean } | null>(null)
  const rail = choice && choice.narrow === narrow ? choice.rail : narrow
  const [cmdOpen, setCmdOpen] = useState(false)
  const pathname = usePathname()
  return (
    <ShellHeaderProvider>
      <div className="fa-app" data-rail={rail}>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-ui-raised focus:px-3 focus:py-2">Skip to content</a>
        <Suspense fallback={<aside className="fa-side" aria-hidden="true" />}>
          <Sidebar versions={versions} rail={rail} onToggleRail={() => setChoice({ narrow, rail: !rail })} onOpenPalette={() => setCmdOpen(true)} />
        </Suspense>
        <div className="flex min-h-dvh min-w-0 flex-col">
          <Suspense fallback={<header className="fa-head" aria-hidden="true"><div className="h-9" /></header>}><PageHeader /></Suspense>
          <main id="main" key={pathname} className="fa-page w-full max-w-[1440px] flex-1 px-[var(--ui-gutter)] pt-6 pb-16 lg:pt-8">{children}</main>
          <footer className="border-t border-ui-rule px-[var(--ui-gutter)] py-4 font-mono text-[11px] text-ui-graphite">
            FillScore audits past execution. It is not financial advice.
          </footer>
        </div>
        <Suspense fallback={null}><PhoneBar versions={versions} /></Suspense>
        <Suspense fallback={null}><Palette open={cmdOpen} onOpenChange={setCmdOpen} /></Suspense>
      </div>
    </ShellHeaderProvider>
  )
}

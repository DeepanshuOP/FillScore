'use client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ArrowLeftRight, BookOpen, ChartColumn, ChevronDown, CircleDollarSign, Ellipsis, FileCheck2, Flag, House, ListOrdered, Monitor, Moon,
  Search, Settings, ShieldCheck, Sparkles, Sun, X, type LucideIcon } from 'lucide-react'
import { useV5Theme, type ThemeChoice } from '../ThemeRoot'
import { DemoBanner } from './PageHeader'

/** The v5 sidebar (PROPOSAL §3.1): nouns with icons in three groups; the pages not in this prototype are shown disabled. */
const BASE = '/design-lab/v5/app'
type Item = { label: string; path: string | null; icon: LucideIcon }
const GROUPS: Array<{ title: string | null; items: Item[] }> = [
  { title: null, items: [
    { label: 'Home', path: '', icon: House }, { label: 'Costs', path: '/overview', icon: CircleDollarSign },
    { label: 'Orders', path: '/orders', icon: ListOrdered }, { label: 'Fills', path: '/fills', icon: ArrowLeftRight }] },
  { title: 'Review', items: [
    { label: 'Flagged orders', path: null, icon: Flag }, { label: 'Comparisons', path: null, icon: ChartColumn }, { label: 'AI review', path: null, icon: Sparkles }] },
  { title: 'Tools', items: [{ label: 'Reports', path: null, icon: ShieldCheck }, { label: 'Check a broker file', path: '/check', icon: FileCheck2 }] },
]
const PHONE_BAR = ['Home', 'Costs', 'Orders']
const ACCOUNTS = [['demo-moderate', 'Demo: mixed orders, mixed hours'], ['demo-disciplined', 'Demo: limit orders, daytime'], ['demo-aggressive', 'Demo: market orders, night']] as const

const href = (path: string, account: string) => `${BASE}${path}?userId=${account}`

function NavLink({ item, account, active, onNavigate }: { item: Item; account: string; active: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  if (item.path === null) {
    return <span className="v-nav-item cursor-not-allowed opacity-60" aria-disabled="true" title="Not in this prototype"><Icon size={18} aria-hidden="true" />{item.label}</span>
  }
  return (
    <Link href={href(item.path, account)} className="v-nav-item" aria-current={active ? 'page' : undefined} onClick={onNavigate}>
      <Icon size={18} aria-hidden="true" />{item.label}
    </Link>
  )
}

const THEMES: Array<[ThemeChoice, string, LucideIcon]> = [['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', Monitor]]
export function ThemeControl() {
  const { choice, set } = useV5Theme()
  return (
    <div role="radiogroup" aria-label="Theme" className="v-seg w-full">
      {THEMES.map(([v, label, Icon]) => (
        <button key={v} type="button" role="radio" aria-checked={choice === v} onClick={() => set(v)} className="inline-flex min-w-0 flex-1 items-center justify-center gap-1 !px-1.5 text-[13px]">
          <Icon size={15} aria-hidden="true" />{label}
        </button>
      ))}
    </div>
  )
}

function AccountSwitcher({ account }: { account: string }) {
  const path = usePathname().replace(BASE, '')
  return (
    <label className="relative block">
      <span className="sr-only">Account</span>
      <select value={account} onChange={(e) => { window.location.href = href(path, e.target.value) }}
        className="v-btn w-full appearance-none pr-8 text-left font-medium">
        {ACCOUNTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      </select>
      <ChevronDown size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--v-muted)]" />
    </label>
  )
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const param = useSearchParams().get('userId')
  const account = ACCOUNTS.some(([id]) => id === param) ? param! : 'demo-moderate'
  const rel = pathname.replace(BASE, '') || ''
  const [more, setMore] = useState(false)
  useEffect(() => {
    if (!more) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMore(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [more])
  const all = GROUPS.flatMap((g) => g.items)
  return (
    <div className="lg:grid lg:min-h-dvh lg:grid-cols-[248px_minmax(0,1fr)]">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r border-[var(--v-border)] bg-[var(--v-bg)] px-3 py-4 lg:flex" aria-label="Sections">
        <div className="flex items-center justify-between px-2">
          <Link href={href('', account)} className="v-wordmark text-[18px] font-bold tracking-[-0.02em]">FillScore<span className="text-[var(--v-accent)]">.</span></Link>
          <button type="button" className="v-icon-btn" aria-label="Search (⌘K)"><Search size={18} aria-hidden="true" /></button>
        </div>
        <AccountSwitcher account={account} />
        <nav className="flex flex-1 flex-col gap-4 overflow-y-auto" aria-label="Main">
          {GROUPS.map((g, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              {g.title ? <p className="px-2.5 pb-1 text-[12px] font-medium text-[var(--v-muted)]">{g.title}</p> : null}
              {g.items.map((it) => <NavLink key={it.label} item={it} account={account} active={it.path === rel} />)}
            </div>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-[var(--v-border)] pt-3">
          <span className="v-nav-item opacity-60" aria-disabled="true" title="Not in this prototype"><BookOpen size={18} aria-hidden="true" />Docs</span>
          <span className="v-nav-item opacity-60" aria-disabled="true" title="Not in this prototype"><Settings size={18} aria-hidden="true" />Settings</span>
          <div className="px-1 pt-2"><ThemeControl /></div>
        </div>
      </aside>

      {/* phone and tablet top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--v-border)] bg-[var(--v-bg)]/95 px-3 py-2 backdrop-blur lg:hidden">
        <Link href={href('', account)} className="v-wordmark text-[17px] font-bold tracking-[-0.02em]">FillScore<span className="text-[var(--v-accent)]">.</span></Link>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className="v-icon-btn" aria-label="Search"><Search size={20} aria-hidden="true" /></button>
        </div>
      </header>

      <div className="min-w-0 pb-20 lg:pb-0">
        {/* provenance on every app page (review fix): every account this prototype serves is a demo account */}
        <DemoBanner dataSource={account.startsWith('demo-') ? 'synthetic-demo' : 'real-user'} />
        {children}
      </div>

      {/* phone and tablet bottom bar: four items with icons and labels */}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-[var(--v-border)] bg-[var(--v-surface)] pb-[env(safe-area-inset-bottom)] lg:hidden">
        {all.filter((i) => PHONE_BAR.includes(i.label)).map((it) => {
          const Icon = it.icon
          const active = it.path === rel
          return (
            <Link key={it.label} href={href(it.path ?? '', account)} aria-current={active ? 'page' : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[12px] font-medium ${active ? 'text-[var(--v-text)]' : 'text-[var(--v-muted)]'}`}>
              <Icon size={20} aria-hidden="true" />{it.label}
            </Link>
          )
        })}
        <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}
          className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[12px] font-medium text-[var(--v-muted)]">
          <Ellipsis size={20} aria-hidden="true" />More
        </button>
      </nav>

      {more ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="More sections">
          <button type="button" aria-label="Close" className="v-scrim absolute inset-0 bg-black/40" onClick={() => setMore(false)} />
          <div className="v-sheet absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl bg-[var(--v-surface)] p-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[16px] font-semibold">More</p>
              <button type="button" className="v-icon-btn" aria-label="Close" onClick={() => setMore(false)}><X size={20} aria-hidden="true" /></button>
            </div>
            <div className="mb-4"><AccountSwitcher account={account} /></div>
            {GROUPS.map((g, i) => (
              <div key={i} className="mb-3 flex flex-col gap-0.5">
                {g.title ? <p className="px-2.5 pb-1 text-[12px] font-medium text-[var(--v-muted)]">{g.title}</p> : null}
                {g.items.map((it) => <NavLink key={it.label} item={it} account={account} active={it.path === rel} onNavigate={() => setMore(false)} />)}
              </div>
            ))}
            <div className="border-t border-[var(--v-border)] pt-3"><ThemeControl /></div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

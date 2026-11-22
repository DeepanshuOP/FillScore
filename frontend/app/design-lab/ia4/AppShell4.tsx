'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Logo } from '../../components/shell/Logo'

import { SECTIONS, type SectionId } from './sections'

const PHONE_BAR: SectionId[] = ['home', 'overview', 'orders']

const linkFor = (userId: string) => (id: string) => {
  const q = new URLSearchParams({ ...(id === 'home' ? {} : { s: id }), userId })
  return `/design-lab/ia4/app?${q.toString()}`
}

function BottomGroup({ version }: { version: string }) {
  return (
    <div className="flex flex-col gap-1 text-[14px]">
      <Link href="/share/demo-moderate" className="py-1 text-ui-graphite no-underline hover:text-ui-ink">Public score card</Link>
      <Link href="/methodology" className="py-1 text-ui-graphite no-underline hover:text-ui-ink">Methodology</Link>
      <span className="py-1 text-ui-graphite">Settings (signed in)</span>
      <p className="mt-2 font-mono text-[11px] tracking-[0.06em] text-ui-graphite">SCORING {version.toUpperCase()} · MEASURE 1.0.0</p>
      <Link href="/login" className="py-1 text-ui-ink no-underline">Log in</Link>
    </div>
  )
}

export function AppShell4({ active, userId, account, provenance, period, version, children }: {
  active: SectionId; userId: string; account: string; provenance: string; period: string; version: string; children: ReactNode
}) {
  const href = linkFor(userId)
  const nav = useRef<HTMLElement>(null)
  const [y, setY] = useState<number | null>(null)
  const sheet = useRef<HTMLDialogElement>(null)
  // the pen underline sits under the current item: measured after layout, moved by transform (ia4.css)
  // re-measured on resize and once the fonts load, so a font swap or text zoom cannot leave it under the wrong item (review)
  useLayoutEffect(() => {
    const place = () => {
      const a = nav.current?.querySelector<HTMLAnchorElement>('a[aria-current="page"]')
      if (a) setY(a.offsetTop + a.offsetHeight - 3)
    }
    place()
    window.addEventListener('resize', place)
    void document.fonts?.ready.then(place)
    return () => window.removeEventListener('resize', place)
  }, [active])
  return (
    <div className="ia4-shell">
      <aside className="ia4-side" aria-label="App">
        <div className="flex items-center justify-between">
          <Link href="/design-lab/ia4/site" className="no-underline" aria-label="FillScore site"><Logo /></Link>
          <span className="font-mono text-[11px] text-ui-graphite" aria-hidden="true">⌘K</span>
        </div>
        <div>
          <Link href="/design-lab/ia4/site#demo" className="block w-full rounded-[8px] border border-ui-edge px-2.5 py-2 text-left text-[14px] font-bold text-ui-ink no-underline"
            aria-label={`Demo: ${account}. Switch demo trader`}>Demo: {account}</Link>
          <p className="mt-2 font-mono text-[11px] tracking-[0.06em] text-ui-ink uppercase">{provenance}</p>
          <p className="font-mono text-[11px] tracking-[0.06em] text-ui-graphite uppercase">{period}</p>
        </div>
        <nav ref={nav} aria-label="Sections" className="ia4-nav">
          {SECTIONS.map((s) => (
            <Link key={s.id} href={href(s.id)} aria-current={s.id === active ? 'page' : undefined}>{s.label}</Link>
          ))}
          {y !== null ? <span className="ia4-pen" aria-hidden="true" style={{ ['--y' as string]: `${y}px` }} /> : null}
        </nav>
        <div className="mt-auto border-t border-ui-rule pt-3"><BottomGroup version={version} /></div>
      </aside>

      <div className="min-w-0">
        {/* the page header carries the provenance on every app page: it is never only in the sidebar */}
        <header className="border-b border-ui-rule px-[var(--ui-gutter)] py-3" data-testid="ia4-provenance">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="lg:hidden"><Logo /></span>
            <span className="font-mono text-[12px] tracking-[0.06em] text-ui-ink uppercase">{provenance}</span>
            <span className="text-[14px] font-bold text-ui-ink">Demo: {account}</span>
            <span className="font-mono text-[12px] tracking-[0.06em] text-ui-graphite uppercase">{period}</span>
          </div>
        </header>
        <main id="main" key={active} className="ia4-page px-[var(--ui-gutter)] py-10 lg:py-14">{children}</main>
      </div>

      <nav className="ia4-bar" aria-label="Sections">
        {PHONE_BAR.map((id) => {
          const s = SECTIONS.find((x) => x.id === id)!
          return <Link key={id} href={href(id)} aria-current={id === active ? 'page' : undefined}>{s.label}</Link>
        })}
        <button type="button" aria-haspopup="dialog" aria-current={PHONE_BAR.includes(active) ? undefined : 'page'} onClick={() => sheet.current?.showModal()}>More</button>
      </nav>
      <dialog ref={sheet} className="ia4-sheet" aria-label="More sections" onClick={(e) => { if (e.target === sheet.current) sheet.current?.close() }}>
        <div className="fs-torn-top" aria-hidden="true" />
        <div className="px-[var(--ui-gutter)] pt-3 pb-8">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[12px] tracking-[0.08em] text-ui-graphite">MORE</p>
            <button type="button" className="min-h-11 px-2 text-[14px] text-ui-ink underline underline-offset-2" onClick={() => sheet.current?.close()}>Close</button>
          </div>
          <ul className="mt-2 flex flex-col">
            {SECTIONS.filter((s) => !PHONE_BAR.includes(s.id)).map((s) => (
              <li key={s.id}><Link href={href(s.id)} className="block py-2.5 text-[17px] font-bold text-ui-ink no-underline" aria-current={s.id === active ? 'page' : undefined}>{s.label}</Link></li>
            ))}
          </ul>
          <div className="mt-4 border-t border-ui-rule pt-3"><BottomGroup version={version} /></div>
        </div>
      </dialog>
    </div>
  )
}

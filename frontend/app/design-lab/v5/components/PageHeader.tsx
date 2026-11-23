'use client'
import { useEffect, useRef, useState } from 'react'
import { Calendar, ChevronDown, Ellipsis, Info } from 'lucide-react'

/** Provenance banner (PROPOSAL §3.6): every app page of a demo account, 14 px, full width. Words kept from the invariant. */
export function DemoBanner({ dataSource }: { dataSource: string }) {
  if (dataSource !== 'synthetic-demo') return null
  return (
    <div data-testid="provenance-banner" className="border-b border-[var(--v-banner-border)] bg-[var(--v-banner)] px-4 py-2 text-[14px] text-[var(--v-banner-text)] lg:px-8">
      <strong className="font-semibold">Demo account</strong> · synthetic trader, real Binance prices · read-only
    </div>
  )
}

/**
 * The period control (PROPOSAL §3.2). The demo data holds January 2024 only, and the server does not yet answer for a window
 * (decision D6), so this prototype offers the whole history and shows the other presets as not yet available.
 */
export function PeriodPicker({ period }: { period: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button type="button" className="v-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Calendar size={16} aria-hidden="true" />{period}<ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div role="dialog" aria-label="Period" className="v-card v-sheet absolute right-0 z-30 mt-2 w-[300px] p-2">
          <p className="px-2 pb-1 pt-1 text-[12px] font-medium text-[var(--v-muted)]">Period</p>
          <button type="button" className="v-nav-item w-full" aria-current="true" onClick={() => setOpen(false)}>Whole history · {period}</button>
          {['Last 7 days', 'Last 30 days', 'Last 90 days', 'Custom range'].map((p) => (
            <span key={p} className="v-nav-item w-full opacity-60" aria-disabled="true">{p}</span>
          ))}
          <p className="px-2.5 pb-2 pt-2 text-[13px] text-[var(--v-text-2)]">Other periods and the comparison with the previous period need the server to answer for a window (decision D6). This demo holds January 2024 only.</p>
        </div>
      ) : null}
    </div>
  )
}

/** Title, one sentence, controls and one primary action; other actions behind "More". */
export function PageHeader({ title, description, controls, primary, more }: {
  title: string; description: React.ReactNode; controls?: React.ReactNode; primary?: React.ReactNode; more?: string[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-4 px-4 pb-4 pt-5 md:flex-row md:items-start md:justify-between lg:px-8 lg:pt-7">
      <div className="min-w-0">
        <h1 className="text-[24px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
        <p className="mt-1 max-w-[68ch] text-[14px] text-[var(--v-text-2)]">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {controls}
        {primary}
        {more?.length ? (
          <div className="relative">
            <button type="button" className="v-icon-btn border border-[var(--v-border-strong)]" aria-label="More actions" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <Ellipsis size={18} aria-hidden="true" />
            </button>
            {open ? (
              <div role="menu" className="v-card v-sheet absolute right-0 z-30 mt-2 w-[220px] p-1">
                {more.map((m) => <button key={m} role="menuitem" type="button" className="v-nav-item w-full" onClick={() => setOpen(false)}>{m}</button>)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** An "i" button whose text is also printed for screen readers; the sentence a reader needs stays visible elsewhere. */
export function InfoTip({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex align-middle">
      <button type="button" className="v-icon-btn v-tip" aria-label={`About: ${label}`} aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>
        <Info size={15} aria-hidden="true" />
      </button>
      {open ? <span role="tooltip" className="v-card absolute left-0 top-8 z-30 w-[280px] p-3 text-[13px] font-normal text-[var(--v-text-2)]">{text}</span> : null}
    </span>
  )
}

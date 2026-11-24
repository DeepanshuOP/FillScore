'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Ellipsis } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

/**
 * What a page tells the persistent app frame (IA v4, design v5): where its data came from, the period it covers, a title and one
 * sentence, and its actions for the header (one primary action, the rest behind "⋯"). The frame owns the sidebar, the banner and the
 * header; the page owns its data. Two contexts, so a page that only sets the header never re-renders when the header changes.
 */
export interface ShellHeader {
  /** Stored provenance of the data on screen; null until the page knows (the frame then shows what the address implies). */
  dataSource: 'synthetic-demo' | 'real-user' | null
  /** Where the figures on a page without stored data come from, in words (the exchange-export check: the user's own file). Shown in the banner when `dataSource` is null. */
  sourceText: string | null
  /** The period the page covers, as words ("January 2024", "All stored fills"). Printed on the disabled period label. */
  period: string | null
  venue: string | null
  title: string | null
  /** The one sentence under the title. */
  description: string | null
  /** True when the page prints its own visible h1, so the frame draws no title (the frame then adds a hidden one). */
  ownHeading: boolean
}
const EMPTY: ShellHeader = { dataSource: null, sourceText: null, period: null, venue: null, title: null, description: null, ownHeading: false }

interface Setters { setHeader: (h: ShellHeader) => void; setSlot: (el: HTMLElement | null) => void }
const SetCtx = createContext<Setters | null>(null)
const HeaderCtx = createContext<{ header: ShellHeader; slot: HTMLElement | null }>({ header: EMPTY, slot: null })

const same = (a: ShellHeader, b: ShellHeader) =>
  a.dataSource === b.dataSource && a.sourceText === b.sourceText && a.period === b.period && a.venue === b.venue && a.title === b.title && a.description === b.description && a.ownHeading === b.ownHeading

export function ShellHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<ShellHeader>(EMPTY)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const setHeader = useCallback((h: ShellHeader) => setHeaderState((prev) => (same(prev, h) ? prev : h)), [])
  const setters = useMemo(() => ({ setHeader, setSlot }), [setHeader])
  const value = useMemo(() => ({ header, slot }), [header, slot])
  return <SetCtx.Provider value={setters}><HeaderCtx.Provider value={value}>{children}</HeaderCtx.Provider></SetCtx.Provider>
}

export function useShellHeaderState() { return useContext(HeaderCtx) }
export function useShellSlotRef() { return useContext(SetCtx)?.setSlot ?? (() => undefined) }

/** One entry of the header's "⋯" menu. */
export interface MoreAction { label: string; onSelect: () => void }

/** The "⋯" button of the page header: the actions that are not the page's one primary action (PROPOSAL §3.2). */
export function MoreMenu({ items }: { items: MoreAction[] }) {
  if (items.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" data-testid="header-more" aria-label="More actions"
          className="inline-flex size-9 items-center justify-center rounded-lg border border-ui-edge text-ui-ink hover:bg-ui-overlay pointer-coarse:size-11">
          <Ellipsis aria-hidden="true" className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-app className="min-w-48">
        {items.map((m) => <DropdownMenuItem key={m.label} onSelect={m.onSelect} className="min-h-9 pointer-coarse:min-h-11">{m.label}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A page of the app. It sets the frame's header from what it knows and renders its header actions into the header's action slot:
 * `primary` (one button) and `more` (the "⋯" menu); `actions` stays for pages that place their own controls there.
 * It draws nothing else: the sidebar, bars and palette belong to the frame.
 */
export function AppPage({ dataSource = null, sourceText = null, period = null, venue = null, title = null, description = null, ownHeading = false, actions, primary, more, children }:
  Partial<ShellHeader> & { actions?: ReactNode; primary?: ReactNode; more?: MoreAction[]; children: ReactNode }) {
  const set = useContext(SetCtx)
  const { slot } = useContext(HeaderCtx)
  useLayoutEffect(() => { set?.setHeader({ dataSource, sourceText, period, venue, title, description, ownHeading }) }, [set, dataSource, sourceText, period, venue, title, description, ownHeading])
  // a layout cleanup, not a passive one: on a page change the old page's reset must run before the new page's set
  useLayoutEffect(() => () => set?.setHeader(EMPTY), [set])
  const bar = (actions || primary || (more && more.length)) ? <>{actions}{primary}{more ? <MoreMenu items={more} /> : null}</> : null
  return <>{bar && slot ? createPortal(bar, slot) : null}{children}</>
}

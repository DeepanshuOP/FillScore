'use client'

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * What a page tells the persistent app frame (IA v4): where its data came from, the period it covers, a title, and optional
 * actions for the header. The frame owns the sidebar and the header; the page owns its data. Two contexts, so a page that only
 * sets the header never re-renders when the header changes (no update loop).
 */
export interface ShellHeader {
  /** Stored provenance of the data on screen; null until the page knows (the frame then shows what the address implies). */
  dataSource: 'synthetic-demo' | 'real-user' | null
  /** Where the figures on a page without stored data come from, in words (the broker-file check: the user's own file). Shown when `dataSource` is null. */
  sourceText: string | null
  period: string | null
  venue: string | null
  title: string | null
  /** True when the page prints its own visible h1 (Home), so the frame adds no hidden one. */
  ownHeading: boolean
}
const EMPTY: ShellHeader = { dataSource: null, sourceText: null, period: null, venue: null, title: null, ownHeading: false }

interface Setters { setHeader: (h: ShellHeader) => void; setSlot: (el: HTMLElement | null) => void }
const SetCtx = createContext<Setters | null>(null)
const HeaderCtx = createContext<{ header: ShellHeader; slot: HTMLElement | null }>({ header: EMPTY, slot: null })

export function ShellHeaderProvider({ children }: { children: ReactNode }) {
  const [header, setHeaderState] = useState<ShellHeader>(EMPTY)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const setHeader = useCallback((h: ShellHeader) => setHeaderState((prev) => (
    prev.dataSource === h.dataSource && prev.sourceText === h.sourceText && prev.period === h.period && prev.venue === h.venue && prev.title === h.title && prev.ownHeading === h.ownHeading ? prev : h)), [])
  const setters = useMemo(() => ({ setHeader, setSlot }), [setHeader])
  const value = useMemo(() => ({ header, slot }), [header, slot])
  return <SetCtx.Provider value={setters}><HeaderCtx.Provider value={value}>{children}</HeaderCtx.Provider></SetCtx.Provider>
}

export function useShellHeaderState() { return useContext(HeaderCtx) }
export function useShellSlotRef() { return useContext(SetCtx)?.setSlot ?? (() => undefined) }

/**
 * A page of the app. It sets the frame's header from what it knows and renders its header actions into the header's action slot.
 * It draws nothing else: the sidebar, bars and palette belong to the frame.
 */
export function AppPage({ dataSource = null, sourceText = null, period = null, venue = null, title = null, ownHeading = false, actions, children }: Partial<ShellHeader> & { actions?: ReactNode; children: ReactNode }) {
  const set = useContext(SetCtx)
  const { slot } = useContext(HeaderCtx)
  useLayoutEffect(() => { set?.setHeader({ dataSource, sourceText, period, venue, title, ownHeading }) }, [set, dataSource, sourceText, period, venue, title, ownHeading])
  // a layout cleanup, not a passive one: on a page change the old page's reset must run before the new page's set
  useLayoutEffect(() => () => set?.setHeader(EMPTY), [set])
  return <>{actions && slot ? createPortal(actions, slot) : null}{children}</>
}

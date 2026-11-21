'use client'

import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

/**
 * The pen margin note (design v3.1 "Quiet audit", docs/design/v31-plan.md rule 3). A small pen mark right after the
 * value it explains; the explanation lives behind it.
 * - Fine pointer (a mouse): opens on hover after 250 ms (at once within 400 ms of another note closing: the warm
 *   window), on keyboard focus and on click; closes 150 ms after the pointer leaves the mark and the note, when focus
 *   leaves both, on an outside press and on Escape (focus stays on the mark).
 * - Touch (coarse pointer): a tap opens the note in a bottom sheet with a Close button.
 * The mark is a real button named "Note: <label>", drawn in pen-ink (4.5:1 on every ground, so the pen rule holds).
 * The popover and sheet code (Radix Popover, Vaul: MarginNotePopup) loads on the first hover, focus or tap, so it is
 * not in any page's first load. Never put anything that guards an invariant only in a note.
 */
const Popup = lazy(() => import('./MarginNotePopup'))
const OPEN_DELAY = 250, CLOSE_DELAY = 150, WARM = 400
let lastClosed = 0

function useFinePointer(): boolean {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(hover: hover) and (pointer: fine)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) },
    () => window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    () => true,
  )
}

/** The mark: a hand-drawn ring around a dot, 18 px, in pen-ink. */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="block">
      <path d="M9.4 2.6c3.4.2 6 2.9 5.9 6.3-.1 3.5-3 6.2-6.4 6.1C5.5 14.9 2.8 12 2.9 8.6 3 5.6 5.3 3.1 8.2 2.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="9.1" cy="8.9" r="1.7" fill="currentColor" />
    </svg>
  )
}

export function MarginNote({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const fine = useFinePointer()
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const id = useId()
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  useEffect(() => clear, [])
  // fetch the popup code when the browser is idle after load, so the first note opens without waiting for it
  useEffect(() => {
    const go = () => { void import('./MarginNotePopup').catch(() => {}) }
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number }
    if (w.requestIdleCallback) w.requestIdleCallback(go); else setTimeout(go, 1500)
  }, [])

  const set = useCallback((v: boolean) => {
    clear()
    if (v) setArmed(true)
    setOpen((was) => { if (was && !v) lastClosed = Date.now(); return v })
  }, [])
  const hoverIn = () => {
    clear()
    setArmed(true)   // start loading the popup code while the reader hovers
    if (open) return
    if (Date.now() - lastClosed < WARM) set(true)
    else timer.current = setTimeout(() => set(true), OPEN_DELAY)
  }
  const hoverOut = () => { clear(); timer.current = setTimeout(() => set(false), CLOSE_DELAY) }
  const isMark = useCallback((t: EventTarget | null) => !!btn.current && t instanceof Node && btn.current.contains(t), [])

  // a no-break space glues the mark to the word before it, so it never wraps onto a line of its own (place the note
  // straight after the text, with no space of its own)
  return (
    <span className="whitespace-nowrap">{' '}<span className="relative inline-flex align-baseline">
      <button ref={btn} type="button" aria-label={`Note: ${label}`} data-margin-note="" aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined}
        className={cn('fs-note-mark inline-flex size-6 shrink-0 translate-y-[3px] items-center justify-center rounded-full text-ui-pen-ink', className)}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse' && fine) hoverIn() }}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse' && fine) hoverOut() }}
        // focus opens the note only for keyboard focus (a click toggles it). Focus never leaves the mark while a note
        // is open (the popup takes no focus), so closing with Escape cannot refocus and reopen it
        onFocus={(e) => { if (fine && e.currentTarget.matches(':focus-visible')) set(true) }}
        onBlur={(e) => { if (fine && !(e.relatedTarget instanceof Node && document.getElementById(id)?.contains(e.relatedTarget))) set(false) }}
        // Escape on the mark closes the note even before its popup code has loaded
        onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.preventDefault(); set(false) } }}
        onClick={() => set(!open)}>
        <Mark />
      </button>
      {armed ? (
        <Suspense fallback={null}>
          <Popup fine={fine} open={open} onOpenChange={set} label={label} id={id} isMark={isMark} onPointerEnter={clear} onPointerLeave={hoverOut}>{children}</Popup>
        </Suspense>
      ) : null}
    </span></span>
  )
}

'use client'

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { Drawer } from 'vaul'
import { cn } from '../../lib/utils'

/**
 * The pen margin note (design v3.1 "Quiet audit", docs/design/v31-plan.md rule 3). A small pen mark right after the
 * value it explains; the explanation lives behind it.
 * - Fine pointer (a mouse): a Radix Popover that opens on hover after 250 ms (at once within 400 ms of another note
 *   closing: the warm window), on keyboard focus and on click; it closes 150 ms after the pointer leaves the mark and the
 *   note, when focus leaves both, and on Escape (focus returns to the mark).
 * - Touch (coarse pointer): a tap opens the note in a Vaul bottom sheet with a Close button.
 * The mark is a real button named "Note: <label>", drawn in pen-ink (4.5:1 on every ground, so the pen rule holds).
 * Never put anything that guards an invariant only in a note: the visible line must stand without it.
 */
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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const id = useId()
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null }
  useEffect(() => clear, [])

  const set = useCallback((v: boolean) => {
    clear()
    setOpen((was) => { if (was && !v) lastClosed = Date.now(); return v })
  }, [])
  const hoverIn = () => {
    clear()
    if (open) return
    if (Date.now() - lastClosed < WARM) set(true)
    else timer.current = setTimeout(() => set(true), OPEN_DELAY)
  }
  const hoverOut = () => { clear(); timer.current = setTimeout(() => set(false), CLOSE_DELAY) }

  const trigger = (
    <button type="button" aria-label={`Note: ${label}`} data-margin-note=""
      className={cn('fs-note-mark inline-flex size-6 shrink-0 translate-y-[3px] items-center justify-center rounded-full align-baseline text-ui-pen-ink', className)}>
      <Mark />
    </button>
  )
  const body = <div className="fs-note-body">{children}</div>

  if (!fine) {
    return (
      <Drawer.Root open={open} onOpenChange={set}>
        <Drawer.Trigger asChild>{trigger}</Drawer.Trigger>
        <Drawer.Portal>
          <Drawer.Overlay className="fs-r-overlay" />
          <Drawer.Content className="fs-vaul fs-note-sheet" aria-describedby={undefined}>
            <div className="fs-torn-top" aria-hidden="true" />
            <div className="fs-receipt">
              <div className="grip" aria-hidden="true" />
              <Drawer.Title className="font-mono text-[12px] tracking-[0.04em] text-ui-graphite uppercase">Note: {label}</Drawer.Title>
              <div className="mt-2">{body}</div>
              <Drawer.Close className="mt-5 h-10 w-full rounded-full border border-ui-edge font-ui text-[15px] font-medium text-ui-ink">Close</Drawer.Close>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }

  return (
    <Popover.Root open={open} onOpenChange={set}>
      {/* focus opens the note only for keyboard focus (a mouse click toggles it), and never in the instant after it
          closed: Escape returns focus to the mark, which must not reopen it */}
      <Popover.Trigger asChild onPointerEnter={hoverIn} onPointerLeave={hoverOut}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible') && Date.now() - lastClosed > 200) set(true) }}>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content id={id} side="bottom" align="start" sideOffset={8} collisionPadding={16}
          className="fs-note" onPointerEnter={clear} onPointerLeave={hoverOut}
          onOpenAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => { if ((e.target as HTMLElement | null)?.closest?.('[data-margin-note]')) e.preventDefault() }}>
          <p className="sr-only">Note: {label}</p>
          {body}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

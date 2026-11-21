'use client'

import type { ReactNode } from 'react'
import { Popover } from 'radix-ui'
import { Drawer } from 'vaul'

/**
 * The opened part of a pen margin note (design v3.1), loaded on the first hover, focus or tap of a mark so that Radix
 * Popover and Vaul stay out of the first load. Fine pointer: a non-modal popover anchored on the mark. Touch: a bottom
 * sheet with a Close button. The mark itself (MarginNote) keeps focus; Escape and an outside press close the note.
 */
export default function MarginNotePopup({ fine, open, onOpenChange, label, id, isMark, onPointerEnter, onPointerLeave, children }: {
  fine: boolean; open: boolean; onOpenChange: (v: boolean) => void; label: string; id: string
  isMark: (t: EventTarget | null) => boolean; onPointerEnter: () => void; onPointerLeave: () => void; children: ReactNode
}) {
  if (!fine) {
    return (
      <Drawer.Root open={open} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fs-r-overlay" />
          <Drawer.Content id={id} className="fs-vaul fs-note-sheet" aria-describedby={undefined}>
            <div className="fs-torn-top" aria-hidden="true" />
            <div className="fs-receipt">
              <div className="grip" aria-hidden="true" />
              <Drawer.Title className="font-mono text-[12px] tracking-[0.04em] text-ui-graphite uppercase">Note: {label}</Drawer.Title>
              <div className="fs-note-body mt-2">{children}</div>
              <Drawer.Close className="mt-5 h-10 w-full rounded-full border border-ui-edge font-ui text-[15px] font-medium text-ui-ink">Close</Drawer.Close>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    )
  }
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor className="pointer-events-none absolute inset-0" />
      <Popover.Portal>
        <Popover.Content id={id} side="bottom" align="start" sideOffset={8} collisionPadding={16} className="fs-note"
          onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave}
          onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => { if (isMark(e.target)) e.preventDefault() }}
          onFocusOutside={(e) => { if (isMark(e.target)) e.preventDefault() }}>
          <p className="sr-only">Note: {label}</p>
          <div className="fs-note-body">{children}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

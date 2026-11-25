'use client'

import { useState, type ReactNode } from 'react'

/**
 * A fold: a button with `aria-expanded` that opens its content; the content stays in the document (hidden while closed), so nothing
 * is computed on open. 14 px sentence case, a 44 px target on phones. No open/close animation: a fold is used often.
 * (Moved here from the removed Overview, design v5 step 6; AskHome's "Values used" is its user.)
 */
export function Fold({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div data-testid={testId}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="group inline-flex min-h-8 items-center gap-2 border-b border-dashed border-ui-edge pb-0.5 text-[14px] font-medium text-ui-ink pointer-coarse:min-h-11">
        <span aria-hidden="true" className="inline-block w-3 text-center">{open ? '−' : '+'}</span>{label}
      </button>
      <div hidden={!open}>{children}</div>
    </div>
  )
}

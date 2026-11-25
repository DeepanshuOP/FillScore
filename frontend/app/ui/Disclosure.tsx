'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Show or hide a block (method, lineage). The button names what it opens, reports aria-expanded and controls the
 * region. The block fades in over 0.2 s with CSS (`fs-disclose`, app/globals.css; none with reduced motion), so no animation
 * library is in the page for it (design v5 step 7). The closed region is not rendered, so it is out of the tab order.
 */
export function Disclosure({ summary, children, defaultOpen = false, className }: { summary: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={cn('border-t border-ui-rule', className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-ui-ink pointer-coarse:min-h-11">
        <span>{summary}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className={cn('size-4 shrink-0 text-ui-graphite transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open ? (
        <div id={id} className="fs-disclose overflow-hidden">
          <div className="max-w-[68ch] pb-4 text-[13px] leading-5 text-ui-graphite">{children}</div>
        </div>
      ) : <div id={id} hidden />}
    </div>
  )
}

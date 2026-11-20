'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { cn } from '../../lib/utils'

/**
 * Show or hide a block (method, lineage). The button names what it opens, reports aria-expanded and controls the
 * region. The height eases open in 0.25 s (Motion; with reduced motion the block simply appears). The closed region is
 * not rendered, so it is out of the tab order.
 */
export function Disclosure({ summary, children, defaultOpen = false, className }: { summary: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div className={cn('border-t border-ui-rule', className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-ui-ink">
        <span>{summary}</span>
        <ChevronDown aria-hidden="true" strokeWidth={1.75} className={cn('size-4 shrink-0 text-ui-graphite transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <m.div id={id} key="body" className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}>
            <div className="max-w-[68ch] pb-4 text-[13px] leading-5 text-ui-graphite">{children}</div>
          </m.div>
        ) : <div id={id} hidden />}
      </AnimatePresence>
    </div>
  )
}

'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/utils'
import { DURATION, EASE, gsap, prefersReducedMotion } from '../lib/motion'

/**
 * Show or hide a block (method, lineage, "numbers come from code"). The button names what it opens, reports
 * aria-expanded and controls the region. Motion answers the click: the height eases open or shut in 0.3 s, ease out;
 * with reduced motion the block simply appears or disappears. The closed panel is `hidden`, so it is out of the tab order.
 */
export function Disclosure({ summary, children, defaultOpen = false, className }: { summary: string; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen)
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()

  function toggle() {
    const el = panel.current
    const next = !open
    if (!el || prefersReducedMotion()) {
      setOpen(next)
      return
    }
    if (next) {
      el.hidden = false
      const h = el.scrollHeight
      gsap.fromTo(el, { height: 0, opacity: 0 }, { height: h, opacity: 1, duration: DURATION.panel, ease: EASE.out, onComplete: () => { gsap.set(el, { clearProps: 'height,opacity' }) } })
      setOpen(true)
    } else {
      gsap.to(el, { height: 0, opacity: 0, duration: DURATION.ui, ease: EASE.out, onComplete: () => { setOpen(false); gsap.set(el, { clearProps: 'height,opacity' }) } })
    }
  }

  const Icon = open ? ChevronUp : ChevronDown
  return (
    <div className={cn('border-t border-ui-rule', className)}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={toggle}
        className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium text-ui-ink">
        <span>{summary}</span>
        <Icon aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-ui-graphite" />
      </button>
      <div id={id} ref={panel} hidden={!open} className="overflow-hidden">
        <div className="max-w-[68ch] pb-4 text-sm text-ui-graphite">{children}</div>
      </div>
    </div>
  )
}

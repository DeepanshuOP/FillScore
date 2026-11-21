'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { cn } from '../../lib/utils'

/**
 * Design v3.1 overview chapters (docs/design/v31-plan.md rule 2): a printed rail label in the left column on a desktop
 * (above the chapter on a phone), the accessible heading in sentence case, one visual and one sentence.
 */
export function Chapter({ n, label, title, id, children, className, testId }: {
  n: number; label: string; title: string; id: string; children: ReactNode; className?: string; testId?: string
}) {
  return (
    <section aria-labelledby={`${id}-t`} id={id} data-testid={testId} data-chapter={n}
      className={cn('grid gap-x-10 gap-y-4 border-t border-ui-ink pt-4 lg:grid-cols-[168px_minmax(0,1fr)]', className)}>
      <p aria-hidden="true" className="font-mono text-[13px] tracking-[0.04em] text-ui-graphite uppercase lg:sticky lg:top-24 lg:self-start">
        {String(n).padStart(2, '0')} {label}
      </p>
      <div className="min-w-0">
        <h2 id={`${id}-t`} className="sr-only">{title}</h2>
        {children}
      </div>
    </section>
  )
}

/**
 * True once the element first scrolls into view, the first time in this browser session for this key, when motion is
 * allowed. Reduced motion, no IntersectionObserver or a repeat visit: always false, so the finished frame shows and
 * nothing moves (DESIGN.md invariant 6; the motion budget allows rich motion only on a chapter's first entry).
 */
export function useFirstEntry(key: string, ref: RefObject<Element | null>): boolean {
  const [play, setPlay] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const k = `fs-entry:${key}`
    try { if (sessionStorage.getItem(k)) return } catch { return }
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      try { sessionStorage.setItem(k, '1') } catch { /* private mode: plays again next time, harmless */ }
      setPlay(true)
    }, { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [key, ref])
  return play
}

/** A ref and its first-entry flag together. */
export function useEntry<T extends Element>(key: string): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  return [ref, useFirstEntry(key, ref)]
}

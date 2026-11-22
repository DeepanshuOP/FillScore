'use client'

import { useEffect, useRef } from 'react'

/**
 * The pen nib on the landing's hero tape (IA v4 step 6, PROPOSAL section 5): a small nib that follows the pointer over the tape and
 * leaves no mark. Fine pointers only (a touch screen has no hover), and nothing under reduced motion. It follows with a 90 ms lag
 * (GSAP quickTo, loaded on the landing page already). The system cursor is hidden over the tape only while the nib is shown.
 * Decorative: aria-hidden, never takes a click.
 */
export function PenNib() {
  const nib = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = nib.current
    const stage = el?.parentElement
    const viewport = stage?.querySelector<HTMLElement>('.fs-hero-viewport')
    if (!el || !stage || !viewport) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let dead = false, off = () => {}
    void import('gsap').then(({ gsap }) => {
      if (dead) return
      const x = gsap.quickTo(el, 'x', { duration: 0.09, ease: 'power3.out' })
      const y = gsap.quickTo(el, 'y', { duration: 0.09, ease: 'power3.out' })
      const move = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
        const r = stage.getBoundingClientRect()
        if (el.dataset.on !== 'true') { gsap.set(el, { x: e.clientX - r.left, y: e.clientY - r.top }); el.dataset.on = 'true'; viewport.dataset.nib = 'on' }
        x(e.clientX - r.left); y(e.clientY - r.top)
      }
      const leave = () => { el.dataset.on = 'false'; delete viewport.dataset.nib }
      viewport.addEventListener('pointermove', move)
      viewport.addEventListener('pointerleave', leave)
      off = () => { viewport.removeEventListener('pointermove', move); viewport.removeEventListener('pointerleave', leave); delete viewport.dataset.nib }
    }).catch(() => {})
    return () => { dead = true; off() }
  }, [])
  return (
    <span ref={nib} className="fs-nib" aria-hidden="true" data-on="false">
      <svg width="16" height="22" viewBox="0 0 16 22" fill="none"><path d="M2 20 L5 9 L8 1 L11 9 L14 12 Z" fill="var(--ui-pen)" /><path d="M8 5 V12" stroke="var(--ui-surface)" strokeWidth="1" /><circle cx="8" cy="13.5" r="1.1" fill="var(--ui-surface)" /></svg>
    </span>
  )
}

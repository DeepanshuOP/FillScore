/**
 * The one motion module (M8 phase 2a). Duration and easing tokens, a reduced-motion wrapper over gsap.matchMedia,
 * and a Flip helper for tables. Imported by client components only (a test enforces it).
 *
 * Rules of this product, in force here:
 *  - Reduced motion: with `prefers-reduced-motion: reduce`, the animation callback does not run and the
 *    "settle" callback puts everything in its final state. Nothing moves.
 *  - A measured value's number is never tweened. Numbers appear in their final form; only drawing, opacity and
 *    position are animated.
 *  - UI responses last 150-300 ms and ease out. Longer durations (draw, scene) are for the one authored moment, the
 *    landing hero, and for no control.
 *  - Motion answers a user action: sorting, filtering and expanding rows (Flip), opening a disclosure, a confirmation.
 *  - No scroll-jacking and no smooth-scroll plugin on app screens. Plugins other than Flip load only on the landing page, by dynamic import.
 */
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(useGSAP, Flip)

/** Seconds. `instant`, `ui` and `panel` are the UI responses (0.15 to 0.3 s); `draw` and `scene` are for the hero only. */
export const DURATION = { instant: 0.15, ui: 0.2, panel: 0.3, draw: 0.7, scene: 1.1 } as const
export const EASE = { out: 'power3.out', outStrong: 'expo.out', inOut: 'power2.inOut', linear: 'none' } as const

const REDUCE = '(prefers-reduced-motion: reduce)'
const FULL = '(prefers-reduced-motion: no-preference)'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE).matches
}

/**
 * Run `run` when the user has no reduced-motion preference, `settle` (final state, no movement) when they do.
 * Returns the cleanup: call it on unmount; it reverts every tween made inside `run`.
 */
export function withMotion(scope: Element | string | null | undefined, run: () => void | (() => void), settle?: () => void): () => void {
  const mm = gsap.matchMedia(scope ?? undefined)
  mm.add({ full: FULL, reduced: REDUCE }, (ctx) => {
    if (ctx.conditions?.reduced) {
      settle?.()
      return
    }
    return run()
  })
  return () => mm.revert()
}

/**
 * Animate a change of layout (sorting, filtering, expanding a row) with Flip. `items` are the elements that may move;
 * `change` applies the new state synchronously (a DOM change, or a flushed React update). With reduced motion the
 * change happens with no movement.
 */
export function flipChange(items: Element[] | string, change: () => void): void {
  if (prefersReducedMotion()) {
    change()
    return
  }
  const state = Flip.getState(items)
  change()
  // Position and opacity only. No `absolute`: table rows keep their layout and move by transform.
  Flip.from(state, { duration: DURATION.panel, ease: EASE.out, onEnter: (els) => gsap.fromTo(els, { opacity: 0 }, { opacity: 1, duration: DURATION.ui, ease: EASE.out }) })
}

export { gsap, useGSAP, Flip }

'use client'

/**
 * Design v3 lab (2026-11-20): the one pinned, scrubbed landing moment, shared by both hero prototypes. Lives in
 * components/marketing because landing-page scroll motion is allowed only here (app/lib/motion.test.ts); GSAP,
 * ScrollTrigger, DrawSVGPlugin and Lenis load by dynamic import, on the landing hero only.
 *
 * Contract: the DOM's default state IS the final frame (strokes drawn, notes written, the tape stopped on the order), so
 * no JavaScript and reduced motion both show the finished annotation and nothing travels. With motion allowed, `build`
 * adds `from` tweens to a scrubbed timeline that rewinds the scene to its start; `tick` runs every frame with the scroll
 * progress (0..1) and the seconds since start, for motion that is not a tween (the tape's free feed).
 */
// Types only (erased at build): the libraries themselves load by dynamic import below.
import type { gsap as GsapType } from 'gsap'

type Gsap = typeof GsapType
export interface StoryOptions {
  root: HTMLElement
  /** Scroll distance of the pinned section, in px. */
  distance: number
  build: (tl: ReturnType<Gsap['timeline']>, gsap: Gsap) => void
  tick?: (progress: number, seconds: number) => void
  onReady?: () => void
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function startPinnedStory(o: StoryOptions): () => void {
  if (prefersReducedMotion()) return () => {}
  let dead = false
  let cleanup = () => {}
  void Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/DrawSVGPlugin'), import('lenis')]).then(
    ([{ gsap }, { ScrollTrigger }, { DrawSVGPlugin }, { default: Lenis }]) => {
      if (dead) return
      gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin)
      // Lenis with ScrollTrigger, as documented (README "GSAP ScrollTrigger"): update on scroll, raf from GSAP's ticker.
      const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 })
      lenis.on('scroll', ScrollTrigger.update)
      const raf = (t: number) => lenis.raf(t * 1000)
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)

      const ctx = gsap.context(() => {
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: o.root, start: 'top top', end: `+=${o.distance}`, pin: true, scrub: 0.6, anticipatePin: 1 },
        })
        o.build(tl, gsap)
        if (o.tick) {
          const t0 = gsap.ticker.time
          const st = tl.scrollTrigger
          const step = () => o.tick?.(st ? st.progress : 0, gsap.ticker.time - t0)
          gsap.ticker.add(step)
          return () => gsap.ticker.remove(step)
        }
      }, o.root)
      o.onReady?.()
      cleanup = () => {
        ctx.revert()
        gsap.ticker.remove(raf)
        lenis.destroy()
      }
    },
  )
  return () => { dead = true; cleanup() }
}

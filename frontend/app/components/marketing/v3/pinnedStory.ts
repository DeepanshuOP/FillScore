'use client'

/**
 * Design v3: the landing page's scrubbed moments (the pinned hero story and the end figure). Lives in
 * components/marketing because landing-page scroll motion is allowed only here (app/lib/motion.test.ts); GSAP,
 * ScrollTrigger and DrawSVGPlugin load by dynamic import. Smooth scrolling (Lenis) is owned by LandingMotion, which
 * feeds ScrollTrigger; this module never creates a second Lenis.
 *
 * Contract: the DOM's default state IS the final frame (strokes drawn, notes written, the tape stopped on the order), so
 * no JavaScript and reduced motion both show the finished frame and nothing travels. With motion allowed, `build` adds
 * fromTo tweens to a scrubbed timeline that rewinds the scene to its start; `tick` runs every frame with the scroll
 * progress (0..1) and the seconds since start, for motion that is not a tween (the tape's free feed).
 */
// Types only (erased at build): the libraries themselves load by dynamic import below.
import type { gsap as GsapType } from 'gsap'

type Gsap = typeof GsapType
export interface StoryOptions {
  root: HTMLElement
  /** Scroll distance of the pinned section, in px (ignored when `trigger.pin` is false). */
  distance: number
  /** Override the ScrollTrigger window; by default the section pins from top to top + distance. */
  trigger?: { start: string; end: string; pin: boolean }
  build: (tl: ReturnType<Gsap['timeline']>, gsap: Gsap) => void
  tick?: (progress: number, seconds: number) => void
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function startPinnedStory(o: StoryOptions): () => void {
  if (prefersReducedMotion()) return () => {}
  let dead = false
  let cleanup = () => {}
  void Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/DrawSVGPlugin')]).then(
    ([{ gsap }, { ScrollTrigger }, { DrawSVGPlugin }]) => {
      if (dead) return
      gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin)
      const t = o.trigger ?? { start: 'top top', end: `+=${o.distance}`, pin: true }
      const ctx = gsap.context(() => {
        const tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: o.root, start: t.start, end: t.end, pin: t.pin, scrub: 0.6, anticipatePin: t.pin ? 1 : 0 },
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
      cleanup = () => ctx.revert()
    },
  ).catch(() => {})
  return () => { dead = true; cleanup() }
}

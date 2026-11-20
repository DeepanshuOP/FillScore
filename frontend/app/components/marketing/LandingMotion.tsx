'use client'

import { useEffect, type ReactNode } from 'react'

/**
 * Landing-page motion only (DESIGN.md section 6): Lenis smooth scroll synced to GSAP's ticker and ScrollTrigger, and a
 * SplitText line reveal for headings marked `data-split`. Everything is loaded by dynamic import on mount, and nothing
 * runs with prefers-reduced-motion: reduce (headings then simply stay as they are; scrolling stays native).
 */
export function LandingMotion({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let cleanup = () => {}
    let dead = false
    void Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/SplitText'), import('lenis')]).then(
      ([{ gsap }, { ScrollTrigger }, { SplitText }, { default: Lenis }]) => {
        if (dead) return
        gsap.registerPlugin(ScrollTrigger, SplitText)
        const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.9 })
        lenis.on('scroll', ScrollTrigger.update)
        const tick = (t: number) => lenis.raf(t * 1000)
        gsap.ticker.add(tick)
        gsap.ticker.lagSmoothing(0)
        document.documentElement.dataset.lenis = 'on'

        const ctx = gsap.context(() => {
          document.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
            SplitText.create(el, {
              type: 'lines', mask: 'lines', autoSplit: true, aria: 'none',
              onSplit: (self) => gsap.from(self.lines, {
                yPercent: 105, duration: 0.9, ease: 'expo.out', stagger: 0.08,
                scrollTrigger: { trigger: el, start: 'top 85%', once: true },
              }),
            })
          })
        })
        cleanup = () => {
          ctx.revert()
          gsap.ticker.remove(tick)
          lenis.destroy()
          delete document.documentElement.dataset.lenis
        }
      },
    ).catch(() => {})
    return () => { dead = true; cleanup() }
  }, [])
  return <>{children}</>
}

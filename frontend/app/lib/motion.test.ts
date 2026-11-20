/**
 * Motion rules of M8 phase 2a, as tests (orders of 2026-11-19):
 *  - UI responses last 150-300 ms and ease out;
 *  - with prefers-reduced-motion: reduce, nothing moves: the "final state" callback runs and the animation does not;
 *  - GSAP is imported by client components only (one motion module holds the tokens);
 *  - a measured value's number is never tweened (no count-ups): the sources hold no text, textContent or snap tween.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DURATION, EASE, prefersReducedMotion, withMotion } from './motion'

function stubMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    // "no-preference" first: every query contains the word "reduce" ("prefers-reduced-motion")
    matches: query.includes('no-preference') ? !reduce : query.includes(': reduce') ? reduce : false,
    media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

describe('tokens', () => {
  it('UI durations are 150 to 300 ms', () => {
    for (const k of ['instant', 'ui', 'panel'] as const) {
      expect(DURATION[k]).toBeGreaterThanOrEqual(0.15)
      expect(DURATION[k]).toBeLessThanOrEqual(0.3)
    }
  })
  it('the UI easing is an ease-out', () => {
    expect(EASE.out).toMatch(/\.out$/)
    expect(EASE.outStrong).toMatch(/\.out$/)
  })
})

describe('withMotion', () => {
  beforeEach(() => document.body.replaceChildren())
  afterEach(() => vi.restoreAllMocks())

  it('reduced motion: runs the final-state callback, never the animation', () => {
    stubMatchMedia(true)
    const run = vi.fn()
    const settle = vi.fn()
    const revert = withMotion(document.body, run, settle)
    expect(prefersReducedMotion()).toBe(true)
    expect(settle).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
    revert()
  })

  it('no preference: runs the animation, not the final-state callback', () => {
    stubMatchMedia(false)
    const run = vi.fn()
    const settle = vi.fn()
    const revert = withMotion(document.body, run, settle)
    expect(prefersReducedMotion()).toBe(false)
    expect(run).toHaveBeenCalledTimes(1)
    expect(settle).not.toHaveBeenCalled()
    revert()
  })
})

const APP = resolve(__dirname, '..')
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (name === 'node_modules' || name === '.next') return []
    if (statSync(p).isDirectory()) return sources(p)
    return /\.(tsx?|mjs)$/.test(name) && !/\.test\./.test(name) ? [p] : []
  })
}
const motionFiles = sources(APP).filter((f) => /from ['"](gsap|@gsap\/react)(\/[A-Za-z]+)?['"]/.test(readFileSync(f, 'utf8')))

describe('source rules', () => {
  it('some file imports gsap (the scan is not vacuous)', () => {
    expect(motionFiles.length).toBeGreaterThan(0)
  })
  it("every importer of gsap is a client component, except the motion module (imported by client code only)", () => {
    const bad = motionFiles.filter((f) => {
      const rel = relative(APP, f)
      if (rel === join('lib', 'motion.ts')) return false
      return !/^\s*(['"])use client\1/.test(readFileSync(f, 'utf8'))
    })
    expect(bad.map((f) => relative(APP, f))).toEqual([])
  })
  it('the motion module is imported only by client components', () => {
    const importers = sources(APP).filter((f) => /from ['"].*\/lib\/motion['"]|from ['"]\.\/motion['"]/.test(readFileSync(f, 'utf8')))
    const bad = importers.filter((f) => !/^\s*(['"])use client\1/.test(readFileSync(f, 'utf8')))
    expect(bad.map((f) => relative(APP, f))).toEqual([])
  })
  it('no tween of a number: no count-up, text or snap tween in a motion file', () => {
    for (const f of motionFiles) {
      const src = readFileSync(f, 'utf8')
      expect(src, relative(APP, f)).not.toMatch(/\b(snap|textContent|innerText|innerHTML|countUp|count-up)\b\s*[:=(]/)
    }
  })
  // Design v2 (orders of 2026-11-20): the landing page's scroll story is ordered to be pinned and scrubbed (ScrollTrigger
  // with Lenis), so scrub is allowed in app/components/marketing/ only. Everywhere else, and ScrollSmoother anywhere, stays banned.
  it('no scroll-jacking outside the landing page: no ScrollSmoother anywhere; no ScrollTrigger pin or scrub in the app screens or the lab', () => {
    for (const f of sources(APP)) {
      const src = readFileSync(f, 'utf8')
      const rel = relative(APP, f)
      expect(src, rel).not.toMatch(/ScrollSmoother/)
      if (!rel.startsWith(join('components', 'marketing'))) expect(src, rel).not.toMatch(/scrub\s*:|pin\s*:\s*true/)
    }
  })
  it('Lenis and ScrollTrigger are loaded only by the landing page, by dynamic import', () => {
    const users = sources(APP).filter((f) => /['"](lenis|gsap\/ScrollTrigger|gsap\/SplitText)['"]/.test(readFileSync(f, 'utf8')))
    for (const f of users) {
      expect(relative(APP, f), 'only marketing components').toMatch(/^components[\\/]marketing[\\/]/)
      expect(readFileSync(f, 'utf8'), relative(APP, f)).not.toMatch(/^import .* from ['"](lenis|gsap\/ScrollTrigger|gsap\/SplitText)['"]/m)
    }
  })
})

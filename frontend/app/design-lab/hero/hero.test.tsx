/**
 * The hero's promises (orders of 2026-11-19): at most about 8 s; ends on a static readable frame (everything visible,
 * every line drawn); the values it shows come from the replay data; with reduced motion it renders its final state and
 * never builds the timeline.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gsap } from '../../lib/motion'
import { Hero } from './Hero'
import { buildHeroTimeline, MAX_SECONDS } from './heroTimeline'
import replay from '../fixtures/hero-order.replay.json'

function mount() {
  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(<Hero />)
  document.body.appendChild(host)
  return host
}

afterEach(() => { document.body.replaceChildren(); gsap.globalTimeline.clear() })

describe('hero timeline', () => {
  it('lasts at most 8 seconds, and long enough to be a sequence', () => {
    const tl = buildHeroTimeline(mount())
    expect(tl.duration()).toBeLessThanOrEqual(MAX_SECONDS)
    expect(tl.duration()).toBeGreaterThan(5)
  })

  it('starts nearly empty and ends on the frame the page shows without script', () => {
    const host = mount()
    const tl = buildHeroTimeline(host)
    tl.pause().progress(0)
    const animated = Array.from(host.querySelectorAll<HTMLElement | SVGElement>('[data-h]'))
    expect(animated.length).toBeGreaterThan(30)
    expect(animated.filter((e) => Number(getComputedStyle(e).opacity || e.style.opacity) > 0).length).toBe(0)
    tl.progress(1)
    const hidden = animated.filter((e) => Number(e.style.opacity) !== 1 && !(e.dataset.h === 'sweep' && Number(e.style.opacity) === 0))
    expect(hidden.map((e) => e.dataset.h)).toEqual([])
    for (const d of Array.from(host.querySelectorAll<SVGElement>('[data-draw]'))) expect(Number(d.style.strokeDashoffset || 0)).toBe(0)
    for (const g of Array.from(host.querySelectorAll<SVGElement>('[data-grow]'))) expect(gsap.getProperty(g, 'scaleX')).toBe(1)
  })

  it('never tweens a number: nothing in the timeline targets text', () => {
    const host = mount()
    const tl = buildHeroTimeline(host)
    const props = new Set<string>()
    for (const t of tl.getChildren(true, true, false)) for (const p of Object.keys((t as gsap.core.Tween).vars ?? {})) props.add(p)
    for (const banned of ['text', 'textContent', 'innerText', 'innerHTML', 'snap']) expect(props.has(banned)).toBe(false)
  })
})

describe('hero content', () => {
  it('writes the figures of the replay data, in the product formatting', () => {
    const html = renderToStaticMarkup(<Hero />)
    // bps: 1.5961691939331055 -> "1.6"; 3.1923383878698397 -> "3.2"; 10.004788507581804 -> "10.0"; total 14.793296 -> "14.8".
    // USD = bps x 48.48757806057283 / 1e4: 0.0077394 -> $0.008; 0.0154789 -> $0.015; 0.0485108 -> $0.049; 0.0717334 -> $0.072.
    for (const s of ['1.6 bps, $0.008', '3.2 bps, $0.015', '10.0 bps, $0.049', '14.8 bps, $0.072']) expect(html, s).toContain(s)
    expect(html).toContain('Filled at 313.40, 0.9 s later')
    expect(html).toContain('Mid when placed 313.25')
    expect(html).toContain('Order placed 19:01:52.910 UTC')
    expect(html).toContain('Synthetic demo account')
    expect(html).toContain('How this was measured')
    expect(replay.fills[0].price).toBe(313.4)
  })

  it('states the execution cost against the expected interval in the past tense, from the data', () => {
    const html = renderToStaticMarkup(<Hero />)
    // execution 4.79 bps, interval -0.02 to 3.28, expected 1.63: 4.79 > 3.28 -> "above"
    expect(html).toContain('Its execution cost, 4.8 bps, was above the interval of −0.02 bps to 3.3 bps around the expected 1.6 bps.')
  })

  it('uses no advice, no cause, no uppercase label and no arrow glyph in its copy', () => {
    const text = renderToStaticMarkup(<Hero />).replace(/<[^>]+>/g, ' ')
    expect(text).not.toMatch(/\b(should|could save|recommend|because|due to|caused|route flow)\b/i)
    expect(text).not.toMatch(/[→·]/)
    // no uppercase label: the only capitals runs are the symbol, the time zone, the currency and the hash name
    expect(text.replace(/BNBUSDT|UTC|SHA|BNB|USD/g, '')).not.toMatch(/\b[A-Z]{3,}\b/)
  })
})

describe('reduced motion', () => {
  it('the wrapper does not build the timeline: the final state stays as rendered', async () => {
    window.matchMedia = vi.fn((q: string) => ({ matches: q.includes('no-preference') ? false : q.includes(': reduce'), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false, onchange: null })) as unknown as typeof window.matchMedia
    const { withMotion } = await import('../../lib/motion')
    const host = mount()
    const run = vi.fn(() => { buildHeroTimeline(host) })
    const settle = vi.fn()
    withMotion(host, run, settle)()
    expect(run).not.toHaveBeenCalled()
    expect(settle).toHaveBeenCalled()
    // nothing was hidden by script; the sweep hairline, which exists only while playing, is hidden in the markup itself
    const all = Array.from(host.querySelectorAll<HTMLElement>('[data-h]'))
    expect(all.filter((e) => e.dataset.h !== 'sweep').every((e) => e.style.opacity === '')).toBe(true)
    expect(all.filter((e) => e.dataset.h === 'sweep').every((e) => e.style.opacity === '0')).toBe(true)
  })
})

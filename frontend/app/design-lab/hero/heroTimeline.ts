'use client'

import { DURATION, EASE, gsap } from '../../lib/motion'

/**
 * The one orchestrated moment: "one order, measured". Every animated element of the drawing carries `data-h` (its
 * role) and, where it follows the tape, `data-at` (seconds into the sweep, from sweepSeconds). Nothing is tweened
 * except opacity, position, stroke drawing and the scale of a bar being drawn: no number changes while it plays; a value
 * appears in its final form.
 *
 * Story, in seconds: 0.3 the sweep starts and the tape prints appear as it passes; the mid line is drawn with it;
 * the fill marker appears when the sweep reaches the fill; 3.2 the spread bracket is drawn, 3.9 the impact bracket;
 * 4.8 the cost ruler is drawn term by term (spread, impact, fees); 6.3 the total, 6.7 the expected interval, 7.1 the
 * closing sentence. It ends at about 7.7 s on the same frame the page shows without script.
 */
export const SWEEP_START = 0.3
export const SWEEP_SECONDS = 2.6
export const MAX_SECONDS = 8

export function buildHeroTimeline(root: Element, onDone?: () => void): gsap.core.Timeline {
  const q = gsap.utils.selector(root)
  const role = (r: string) => q(`[data-h="${r}"]`)
  const all = q('[data-h]')

  gsap.set(all, { opacity: 0 })
  gsap.set(q('[data-draw]'), { strokeDasharray: 1, strokeDashoffset: 1 })
  gsap.set(q('[data-grow]'), { transformBox: 'fill-box', transformOrigin: '0% 50%', scaleX: 0 })

  const tl = gsap.timeline({ defaults: { ease: EASE.out }, onComplete: onDone })

  // 1. The tape: a hairline sweeps across; prints appear as it reaches them; the mid line is drawn with it.
  const sweep = role('sweep')
  tl.set(sweep, { opacity: 1 }, SWEEP_START)
  tl.to(sweep, { x: (_i: number, el: Element) => Number((el as HTMLElement).dataset.travel), duration: SWEEP_SECONDS, ease: EASE.linear }, SWEEP_START)
  tl.to(sweep, { opacity: 0, duration: DURATION.ui }, SWEEP_START + SWEEP_SECONDS)
  tl.to(role('mid'), { opacity: 1, strokeDashoffset: 0, duration: SWEEP_SECONDS, ease: EASE.linear }, SWEEP_START)
  for (const el of [...role('print'), ...role('arrival'), ...role('fill'), ...role('mid-label')]) {
    const at = Number((el as HTMLElement).dataset.at ?? 0)
    tl.to(el, { opacity: 1, duration: DURATION.instant }, SWEEP_START + at)
  }

  // 2. The brackets, then the ruler, term by term.
  const draw = (r: string, at: number, d: number = DURATION.draw) => {
    tl.to(role(r), { opacity: 1, duration: DURATION.ui }, at)
    tl.to(q(`[data-h="${r}"][data-draw], [data-h="${r}"] [data-draw]`), { strokeDashoffset: 0, duration: d }, at)
  }
  draw('guide', 3.2, DURATION.panel)
  draw('bracket-spread', 3.2)
  draw('bracket-impact', 3.9)
  tl.to(role('ruler-axis'), { opacity: 1, duration: DURATION.ui }, 4.7)
  for (const [i, r] of ['ruler-spread', 'ruler-impact', 'ruler-fees'].entries()) {
    const at = 4.8 + i * 0.5
    tl.to(role(r), { opacity: 1, duration: DURATION.ui }, at)
    tl.to(q(`[data-h="${r}"][data-grow], [data-h="${r}"] [data-grow]`), { scaleX: 1, duration: DURATION.draw * 0.7 }, at)
  }
  draw('total', 6.3)
  draw('expected', 6.7, DURATION.panel)
  tl.to(role('closing'), { opacity: 1, duration: DURATION.panel }, 7.1)
  return tl
}

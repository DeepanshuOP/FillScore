/**
 * ValueState: measured, insufficient data and not computed are three different facts. They come from one component
 * and must differ in shape, line style and words, never in colour alone (M8 proposal §2, rules of 2026-11-19).
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ValueState } from './ValueState'
import { NOT_COMPUTED } from '../utils/notComputed'

const measured = renderToStaticMarkup(<ValueState state="measured" label="Total cost" value="$52.08" n={245} nLabel="orders" />)
const insufficient = renderToStaticMarkup(
  <ValueState state="insufficient" label="Cost versus expected" have={7} need={20} what="market orders had a usable expected cost" />)
const notComputed = renderToStaticMarkup(<ValueState state="not-computed" label="Per-trade score" reason="The rebuilt demo trades carry no v1 fields." />)

describe('ValueState', () => {
  it('measured: the value, its sample size, and a spoken state', () => {
    expect(measured).toContain('$52.08')
    expect(measured).toContain('245 orders')
    expect(measured).toMatch(/Measured/)
    expect(measured).toContain('data-state="measured"')
  })

  it('insufficient data: says so in words, shows what is missing, shows no figure', () => {
    expect(insufficient).toContain('insufficient data')
    expect(insufficient).toContain('7 market orders had a usable expected cost; at least 20 are needed')
    expect(insufficient).toContain('data-state="insufficient"')
    expect(insufficient).not.toMatch(/\$\d|\bbps\b/)
  })

  it('not computed: the stored phrase, the reason, and never a zero', () => {
    expect(notComputed).toContain(NOT_COMPUTED)
    expect(notComputed).toContain('The rebuilt demo trades carry no v1 fields.')
    expect(notComputed).toContain('data-state="not-computed"')
    expect(notComputed.replace(/<[^>]+>/g, ' ')).not.toMatch(/(^|\s)0(\.0+)?(\s|$)/)
  })

  it('the three states differ in marker shape and line style, not only in colour', () => {
    const marker = (h: string) => /data-marker="([a-z]+)"/.exec(h)?.[1]
    const line = (h: string) => /data-line="([a-z]+)"/.exec(h)?.[1]
    expect(new Set([marker(measured), marker(insufficient), marker(notComputed)]).size).toBe(3)
    expect(new Set([line(measured), line(insufficient), line(notComputed)]).size).toBe(3)
    expect([marker(measured), line(measured)]).toEqual(['square', 'solid'])
    expect([marker(insufficient), line(insufficient)]).toEqual(['diamond', 'dashed'])
    expect([marker(notComputed), line(notComputed)]).toEqual(['dash', 'dotted'])
  })

  it('each state has an accessible name that says the state in words', () => {
    expect(measured).toMatch(/aria-label="Total cost: \$52\.08, measured, 245 orders"/)
    expect(insufficient).toMatch(/aria-label="Cost versus expected: insufficient data/)
    expect(notComputed).toMatch(/aria-label="Per-trade score: not computed for this data/)
  })

  it('the decorative marker is hidden from assistive technology', () => {
    expect(measured).toMatch(/aria-hidden="true"[^>]*data-marker|data-marker[^>]*aria-hidden="true"/)
  })
})

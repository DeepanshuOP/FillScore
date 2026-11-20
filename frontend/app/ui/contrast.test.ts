/**
 * Contrast of the design tokens. Design v2 (2026-11-20): the themes are now "dark" (default) and "light", both in
 * app/ui/tokens.css (was: A in tokens.css and the lab's B); every rule of the earlier test is kept for both themes, and
 * the grade chips are now tested as the letter on its own tinted chip. WCAG 2.x: L = 0.2126 R + 0.7152 G + 0.0722 B
 * (linearised sRGB), ratio = (L1 + 0.05) / (L2 + 0.05). Required: >= 4.5 for text, >= 3 for the parts of a control.
 *
 * Hand values (computed by hand from the formula above, 2026-11-20):
 *   dark graphite #8A96A3 on surface #0B1015: L 0.29863 vs 0.00496 -> 0.34863 / 0.05496 = 6.34
 *     (a first rough pass took the surface as 0.0055 and wrote 6.27; the test caught it, the hand value was corrected)
 *   dark ink #0B1015 on action #4C8DFF: L 0.278 -> 0.328 / 0.05496 = 5.97 (the primary button's text)
 * The separators (--ui-rule) stay below 3:1: decoration only, never the border of a control.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, mixHex } from './contrast'
import { HUE_MIN_SHARE, hueShare, RULER_SHARES } from './hue'
import { CHIP_TINT } from './GradeChip'

const CSS = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

function theme(name: 'dark' | 'light'): Record<string, string> {
  const block = CSS.match(new RegExp(`\\[data-theme="${name}"\\]\\s*\\{([^}]*)\\}`))
  if (!block) throw new Error(`theme ${name} not found in tokens.css`)
  const out: Record<string, string> = {}
  for (const m of block[1].matchAll(/--ui-([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2]
  return out
}

const THEMES = { dark: theme('dark'), light: theme('light') } as const

describe('contrastRatio', () => {
  it('matches the hand values', () => {
    expect(contrastRatio('#1C2127', '#F5F6F3')).toBeCloseTo(14.94, 2)
    expect(contrastRatio('#FFFFFF', '#2B4BB5')).toBeCloseTo(7.56, 2)
    expect(contrastRatio('#8A96A3', '#0B1015')).toBeCloseTo(6.34, 1)
    expect(contrastRatio('#0B1015', '#4C8DFF')).toBeCloseTo(5.97, 1)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe.each(['dark', 'light'] as const)('theme %s', (name) => {
  const t = THEMES[name]
  const surfaces = [['surface', t.surface], ['raised', t.raised], ['overlay', t.overlay]] as const

  it('declares every token the components read', () => {
    for (const k of ['surface', 'raised', 'overlay', 'ink', 'graphite', 'rule', 'edge', 'measured', 'on-measured', 'action', 'on-action',
      'insufficient', 'insufficient-text', 'danger', 'on-danger', 'focus', 'grade-a', 'grade-b', 'grade-c', 'grade-d', 'grade-f'])
      expect(t[k], `--ui-${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it.each(['ink', 'graphite', 'measured', 'action', 'insufficient-text', 'danger'])('text colour %s is >= 4.5 on every surface', (k) => {
    for (const [sname, s] of surfaces) expect(contrastRatio(t[k], s), `${k} on ${sname}`).toBeGreaterThanOrEqual(4.5)
  })

  it('text on a filled button is >= 4.5', () => {
    expect(contrastRatio(t['on-measured'], t.measured)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t['on-action'], t.action)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t['on-danger'], t.danger)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['edge', 'measured', 'insufficient', 'focus'])('UI part %s is >= 3 on every surface', (k) => {
    for (const [sname, s] of surfaces) expect(contrastRatio(t[k], s), `${k} on ${sname}`).toBeGreaterThanOrEqual(3)
  })

  it('rule is a separator, not a control border: it is below 3', () => {
    expect(contrastRatio(t.rule, t.surface)).toBeLessThan(3)
  })

  it('single-hue marks: the palest share of the measured colour is >= 3:1 on the surfaces', () => {
    for (const share of [HUE_MIN_SHARE, ...RULER_SHARES]) {
      for (const s of [t.surface, t.raised]) expect(contrastRatio(mixHex(t.measured, s, share), s), `${share}% on ${s}`).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(['a', 'b', 'c', 'd', 'f'])('grade %s: the letter is >= 4.5 on its tinted chip on a panel', (g) => {
    const fg = t[`grade-${g}`]
    const chip = mixHex(fg, t.raised, CHIP_TINT)
    expect(contrastRatio(fg, chip)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('the ruler shares and the hue floor', () => {
  it('mixHex mixes in sRGB', () => {
    expect(mixHex('#000000', '#FFFFFF', 50)).toBe('#808080')
    expect(mixHex('#2B4BB5', '#F5F6F3', 100)).toBe('#2B4BB5')
    expect(mixHex('#2B4BB5', '#F5F6F3', 0)).toBe('#F5F6F3')
  })
  it('the floor and the ruler shares', () => {
    expect(HUE_MIN_SHARE).toBe(65)
    expect(hueShare(0)).toBe(65)
    expect(hueShare(1)).toBe(100)
    expect(RULER_SHARES).toEqual([100, 82, 65])
  })
})

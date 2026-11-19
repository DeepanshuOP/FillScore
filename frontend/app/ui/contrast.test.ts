/**
 * Contrast of the design tokens (M8 phase 2a). The values are parsed from app/ui/tokens.css, so the file the
 * browser reads is the file under test. WCAG 2.x: relative luminance L = 0.2126 R + 0.7152 G + 0.0722 B (linearised
 * sRGB), ratio = (L1 + 0.05) / (L2 + 0.05). Required: >= 4.5 for text, >= 3 for the parts of a control.
 *
 * Hand values (computed outside the code, python, 2026-11-19), the first three rows of the table:
 *   A ink #1C2127 on ledger #F5F6F3 = 14.94      A ochre #A86F12 on ledger = 3.91 (FAILS text, so ochreText exists: 5.46)
 *   B signal #6CC4D9 on slate #1D2227 = 8.04     white on audit blue #2B4BB5 = 7.56
 * The separators (--ui-rule) are 1.28:1 (A) and 1.57:1 (B): decoration only, never the border of a control; controls use --ui-edge.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, mixHex, readableOn } from './contrast'
import { HUE_MIN_SHARE, hueShare, RULER_SHARES } from './hue'
import { getGradeColor } from '../utils/gradeColor'

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

function theme(name: 'a' | 'b'): Record<string, string> {
  const block = css.match(new RegExp(`\\[data-ui-theme="${name}"\\]\\s*\\{([^}]*)\\}`))
  if (!block) throw new Error(`theme ${name} not found in tokens.css`)
  const out: Record<string, string> = {}
  for (const m of block[1].matchAll(/--ui-([a-z-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2]
  return out
}

const THEMES = { a: theme('a'), b: theme('b') } as const

describe('contrastRatio', () => {
  it('matches the hand values', () => {
    expect(contrastRatio('#1C2127', '#F5F6F3')).toBeCloseTo(14.94, 2)
    expect(contrastRatio('#A86F12', '#F5F6F3')).toBeCloseTo(3.91, 2)
    expect(contrastRatio('#6CC4D9', '#1D2227')).toBeCloseTo(8.04, 2)
    expect(contrastRatio('#FFFFFF', '#2B4BB5')).toBeCloseTo(7.56, 2)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe.each(['a', 'b'] as const)('theme %s', (name) => {
  const t = THEMES[name]
  const surfaces = [['surface', t.surface], ['raised', t.raised]] as const

  it('declares every token the components read', () => {
    for (const k of ['surface', 'raised', 'ink', 'graphite', 'rule', 'edge', 'measured', 'on-measured', 'insufficient',
      'insufficient-text', 'danger', 'on-danger', 'focus']) expect(t[k], `--ui-${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it.each(['ink', 'graphite', 'measured', 'insufficient-text', 'danger'])('text colour %s is >= 4.5 on both surfaces', (k) => {
    for (const [sname, s] of surfaces) expect(contrastRatio(t[k], s), `${k} on ${sname}`).toBeGreaterThanOrEqual(4.5)
  })

  it('text on a filled button is >= 4.5', () => {
    expect(contrastRatio(t['on-measured'], t.measured)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(t['on-danger'], t.danger)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['edge', 'measured', 'insufficient', 'focus'])('UI part %s is >= 3 on both surfaces', (k) => {
    for (const [sname, s] of surfaces) expect(contrastRatio(t[k], s), `${k} on ${sname}`).toBeGreaterThanOrEqual(3)
  })

  it('rule is a separator, not a control border: it is below 3', () => {
    expect(contrastRatio(t.rule, t.surface)).toBeLessThan(3)
  })
})

describe('A: the ochre needs its text variant', () => {
  it('the mark colour fails as text, the text colour passes', () => {
    expect(contrastRatio(THEMES.a.insufficient, THEMES.a.surface)).toBeLessThan(4.5)
    expect(contrastRatio(THEMES.a['insufficient-text'], THEMES.a.surface)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('single-hue marks stay visible: the palest share of the measured colour is >= 3:1 on both surfaces', () => {
  // Hand values (python, 2026-11-19): at 40% the mix is 1.94:1 (A) and 2.45:1 (B), too faint; at 65% it is 3.20:1 (A on
  // ledger), 3.34:1 (A on white), 4.20:1 (B on slate), 3.90:1 (B on raised), so 65% is the floor.
  it('mixHex mixes in sRGB', () => {
    expect(mixHex('#000000', '#FFFFFF', 50)).toBe('#808080')   // 127.5 rounds to 128
    expect(mixHex('#2B4BB5', '#F5F6F3', 100)).toBe('#2B4BB5')
    expect(mixHex('#2B4BB5', '#F5F6F3', 0)).toBe('#F5F6F3')
  })
  it('the floor and the ruler shares', () => {
    expect(HUE_MIN_SHARE).toBe(65)
    expect(hueShare(0)).toBe(65)
    expect(hueShare(1)).toBe(100)
    expect(RULER_SHARES).toEqual([100, 82, 65])
  })
  it.each(['a', 'b'] as const)('direction %s', (name) => {
    const t = THEMES[name]
    for (const share of [HUE_MIN_SHARE, ...RULER_SHARES]) {
      for (const s of [t.surface, t.raised]) expect(contrastRatio(mixHex(t.measured, s, share), s), `${share}% on ${s}`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('grade chips keep the grade colours of gradeColor.ts and carry readable text', () => {
  it.each(['A', 'B', 'C', 'D', 'F'])('grade %s', (g) => {
    const bg = getGradeColor(g)
    expect(contrastRatio(readableOn(bg), bg)).toBeGreaterThanOrEqual(4.5)
  })
})

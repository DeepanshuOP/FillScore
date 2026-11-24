/**
 * Contrast of the design tokens. Design v3 "Tape & Receipt" (2026-11-20): the themes are "paper" (default) and "carbon"
 * (Carbon copy), both in app/ui/tokens.css. Every rule of the v2 test is kept for both themes; the pen rules are new:
 * pen-ink is text (>= 4.5), the stamp is large text (>= 3), and the pen orange on paper is under 3:1, so there it may only
 * double a value that is also written in pen-ink (DESIGN.md, "Paper, ink and pen"). WCAG 2.x: L = 0.2126 R + 0.7152 G
 * + 0.0722 B (linearised sRGB), ratio = (L1 + 0.05) / (L2 + 0.05). Required: >= 4.5 for text, >= 3 for the parts of a
 * control and for large text.
 *
 * Hand values (computed by hand from the formula above, 2026-11-20):
 *   #8A96A3 on #0B1015: L 0.29863 vs 0.00496 -> 0.34863 / 0.05496 = 6.34
 *   #0B1015 on #4C8DFF: L 0.278 -> 0.328 / 0.05496 = 5.97
 *   paper graphite #6B6A66 on paper #F3F2EE: channels 0.1471 0.1442 0.1329 -> L 0.1440; paper 0.8963 0.8880 0.8550 ->
 *     L 0.8874; (0.8874 + 0.05) / (0.1440 + 0.05) = 0.9374 / 0.1940 = 4.83
 * The separators (--ui-rule) stay below 3:1: decoration only, never the border of a control.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, mixHex } from './contrast'
import { HUE_MIN_SHARE, hueShare, RULER_SHARES } from './hue'
import { CHIP_TINT } from './GradeChip'

const CSS = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8')

/** The declarations of the rule whose selector list contains `selector` exactly (comments stripped first). */
function block(selector: string): Record<string, string> {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue
    const out: Record<string, string> = {}
    for (const d of m[2].matchAll(/--ui-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[d[1]] = d[2]
    return out
  }
  throw new Error(`rule ${selector} not found in tokens.css`)
}

// Design v5 (2026-11-24): the themes are "light" and "dark" (D3). `paper` and `carbon` below name the two PAPER-TONE palettes
// (marketing, the receipt, the stamp), now keyed by [data-theme="light"] and [data-theme="dark"]; `app` and `appDark` are the app
// palette (neutral grey ground, white cards, D5), which overrides the paper roles inside [data-app] and inherits the rest.
const paper = block('[data-theme="light"]')
const carbon = block('[data-theme="dark"]')
const app = { ...paper, ...block('[data-app]') }
const appDark = { ...carbon, ...block('[data-theme="dark"] [data-app]') }
const THEMES = { paper, carbon } as const

describe('contrastRatio', () => {
  it('matches the hand values', () => {
    expect(contrastRatio('#1C2127', '#F5F6F3')).toBeCloseTo(14.94, 2)
    expect(contrastRatio('#FFFFFF', '#2B4BB5')).toBeCloseTo(7.56, 2)
    expect(contrastRatio('#8A96A3', '#0B1015')).toBeCloseTo(6.34, 1)
    expect(contrastRatio('#0B1015', '#4C8DFF')).toBeCloseTo(5.97, 1)
    expect(contrastRatio('#6B6A66', '#F3F2EE')).toBeCloseTo(4.83, 1)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})

describe.each(['paper', 'carbon'] as const)('theme %s', (name) => {
  const t = THEMES[name]
  const surfaces = [['surface', t.surface], ['raised', t.raised], ['overlay', t.overlay]] as const

  it('declares every token the components read', () => {
    for (const k of ['surface', 'raised', 'overlay', 'ink', 'graphite', 'rule', 'edge', 'measured', 'on-measured', 'action', 'on-action',
      'pen', 'pen-ink', 'stamp', 'insufficient', 'insufficient-text', 'danger', 'on-danger', 'focus', 'grade-a', 'grade-b', 'grade-c', 'grade-d', 'grade-f'])
      expect(t[k], `--ui-${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })

  it.each(['ink', 'graphite', 'measured', 'action', 'pen-ink', 'insufficient-text', 'danger'])('text colour %s is >= 4.5 on every surface', (k) => {
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

  it('the stamp letters are large text: >= 3 on the paper and on the receipt', () => {
    for (const s of [t.surface, t.raised]) expect(contrastRatio(t.stamp, s)).toBeGreaterThanOrEqual(3)
  })

  it('rule is a separator, not a control border: it is below 3', () => {
    expect(contrastRatio(t.rule, t.surface)).toBeLessThan(3)
  })

  it('single-hue ink marks: the palest share of the measured colour is >= 3:1 on the paper and the receipt', () => {
    for (const share of [HUE_MIN_SHARE, ...RULER_SHARES]) {
      for (const s of [t.surface, t.raised]) expect(contrastRatio(mixHex(t.measured, s, share), s), `${share}% on ${s}`).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(['a', 'b', 'c', 'd', 'f'])('grade %s: the stamped letter is >= 4.5 on its chip on a sheet', (g) => {
    const fg = t[`grade-${g}`]
    const chip = mixHex(fg, t.raised, CHIP_TINT)
    expect(contrastRatio(fg, chip)).toBeGreaterThanOrEqual(4.5)
  })
})

// Design v5: the app palette, both themes. Hand value (2026-11-24): banner text #5A4210 on #FFF7E6:
//   #5A4210 -> linear 0.1022 0.0545 0.00518 -> L = 0.2126*0.1022 + 0.7152*0.0545 + 0.0722*0.00518 = 0.06108
//   #FFF7E6 -> linear 1 0.9300 0.7914       -> L = 0.2126 + 0.6651 + 0.0571 = 0.9348
//   (0.9348 + 0.05) / (0.06108 + 0.05) = 0.9848 / 0.11108 = 8.87
describe.each([['app light', app, 'light'], ['app dark', appDark, 'dark']] as const)('v5 tokens, %s', (_name, t, mode) => {
  const surfaces = [['surface', t.surface], ['raised', t.raised], ['overlay', t.overlay]] as const

  it('declares every v5 token', () => {
    for (const k of ['series-1', 'series-2', 'series-3', 'grid', 'axis', 'banner', 'banner-border', 'banner-text', 'accent-soft'])
      expect(t[k], `--ui-${k}`).toMatch(/^#[0-9A-Fa-f]{6}$/)
  })
  it.each(['ink', 'graphite', 'pen-ink', 'insufficient-text', 'danger'])('text colour %s is >= 4.5 on the grey ground, the white card and the hover grey', (k) => {
    for (const [sname, s] of surfaces) expect(contrastRatio(t[k], s), `${k} on ${sname}`).toBeGreaterThanOrEqual(4.5)
  })
  it('the banner text is >= 4.5 on the banner, and the banner is a different ground from the card', () => {
    expect(contrastRatio(t['banner-text'], t.banner)).toBeGreaterThanOrEqual(4.5)
    expect(t.banner.toLowerCase()).not.toBe(t.raised.toLowerCase())
  })
  it('text on the filled primary button is >= 4.5', () => {
    expect(contrastRatio(t['on-action'], t.action)).toBeGreaterThanOrEqual(4.5)
  })
  it.each(['edge', 'focus'])('control part %s is >= 3 on every surface', (k) => {
    for (const [sname, s] of surfaces) expect(contrastRatio(t[k], s), `${k} on ${sname}`).toBeGreaterThanOrEqual(3)
  })
  it('chart marks are >= 3:1 on the card, except light-theme series 3 (green), which always carries a direct label', () => {
    expect(contrastRatio(t['series-1'], t.raised)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(t['series-2'], t.raised)).toBeGreaterThanOrEqual(3)
    if (mode === 'dark') expect(contrastRatio(t['series-3'], t.raised)).toBeGreaterThanOrEqual(3)
    else expect(contrastRatio(t['series-3'], t.raised)).toBeGreaterThanOrEqual(2.5)
  })
  it('gridlines and the axis line are decoration: under 3:1 on the card', () => {
    expect(contrastRatio(t.grid, t.raised)).toBeLessThan(3)
  })
  it('the receipt keeps the paper tone inside the app: .fs-paper takes the paper values back', () => {
    const inner = mode === 'light' ? block('[data-app] .fs-paper') : block('[data-theme="dark"] [data-app] .fs-paper')
    expect(inner.raised).toBe((mode === 'light' ? paper : carbon).raised)
    expect(inner.ink).toBe((mode === 'light' ? paper : carbon).ink)
  })
})

describe('v5 hand values', () => {
  it('banner text on banner is 8.87', () => {
    expect(contrastRatio('#5A4210', '#FFF7E6')).toBeCloseTo(8.87, 1)
  })
  it('the app ground is neutral (D5): red, green and blue within 3 of each other', () => {
    for (const hex of [app.surface, appDark.surface, appDark.raised]) {
      const n = parseInt(hex.slice(1), 16)
      const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      expect(Math.max(...ch) - Math.min(...ch), hex).toBeLessThanOrEqual(3)
    }
    expect(app.raised).toBe('#FFFFFF')
  })
})

describe('the pen orange', () => {
  it('on paper it is under 3:1, so it only doubles a value already written in pen-ink; on carbon it passes as a mark', () => {
    // #FF4F12 on #F3F2EE is 2.9:1 (WCAG 1.4.11 asks 3:1 of a meaningful mark). Every pen circle or bracket on paper sits
    // beside the same value in pen-ink text; the orange alone never states anything.
    expect(contrastRatio(THEMES.paper.pen, THEMES.paper.surface)).toBeLessThan(3)
    expect(contrastRatio(THEMES.carbon.pen, THEMES.carbon.surface)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(THEMES.carbon.pen, THEMES.carbon.raised)).toBeGreaterThanOrEqual(3)
  })
  it('no blue-black: every ground has red >= blue (warm paper, warm charcoal)', () => {
    for (const t of Object.values(THEMES)) for (const k of ['surface', 'raised', 'overlay']) {
      const n = parseInt(t[k].slice(1), 16)
      expect((n >> 16) & 255, k).toBeGreaterThanOrEqual(n & 255)
    }
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

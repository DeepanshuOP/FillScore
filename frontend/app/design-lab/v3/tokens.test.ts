import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../../ui/contrast'
import { grid, tape } from './tokens'

// WCAG 2.2: body text >= 4.5:1, large text (the stamp, display figures) and meaningful marks and control borders >= 3:1.
const themes = { 'tape/paper': tape.paper, 'tape/carbon': tape.carbon, 'grid/ink': grid.ink, 'grid/sheet': grid.sheet }

describe('design v3 token contrast', () => {
  for (const [name, t] of Object.entries(themes)) {
    describe(name, () => {
      for (const bg of ['paper', 'receipt'] as const) {
        it(`ink and graphite read on ${bg} (>= 4.5)`, () => {
          expect(contrastRatio(t.ink, t[bg])).toBeGreaterThanOrEqual(4.5)
          expect(contrastRatio(t.graphite, t[bg])).toBeGreaterThanOrEqual(4.5)
        })
        it(`orange or lime text reads on ${bg} (>= 4.5)`, () => {
          expect(contrastRatio(t.penInk, t[bg])).toBeGreaterThanOrEqual(4.5)
        })
        it(`control edges show on ${bg} (>= 3)`, () => {
          expect(contrastRatio(t.edge, t[bg])).toBeGreaterThanOrEqual(3)
        })
      }
    })
  }

  it('the stamp letters are large text and pass 3:1 on paper and on the receipt', () => {
    for (const t of [tape.paper, tape.carbon]) {
      expect(contrastRatio(t.stamp, t.paper)).toBeGreaterThanOrEqual(3)
      expect(contrastRatio(t.stamp, t.receipt)).toBeGreaterThanOrEqual(3)
    }
  })

  it('the pen orange passes 3:1 as a mark on carbon; on paper it only doubles text that is already there', () => {
    // #FF4F12 on #F3F2EE is 2.9:1, below 3:1, so the paper theme never lets an orange mark carry meaning alone:
    // every circled value is also written in penInk text. On carbon it passes.
    expect(contrastRatio(tape.carbon.pen, tape.carbon.paper)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(tape.paper.pen, tape.paper.paper)).toBeLessThan(3)
  })

  it('text on a highlighter fill reads (>= 4.5), and lime marks show on the ink ground (>= 3)', () => {
    for (const t of [grid.ink, grid.sheet]) expect(contrastRatio(t.onPen, t.pen)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(grid.ink.pen, grid.ink.paper)).toBeGreaterThanOrEqual(3)
  })

  it('no blue-black: every ground has red >= blue', () => {
    for (const t of Object.values(themes)) {
      const n = parseInt(t.paper.slice(1), 16)
      expect((n >> 16) & 255).toBeGreaterThanOrEqual(n & 255)
    }
  })
})

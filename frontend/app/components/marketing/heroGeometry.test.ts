import { describe, expect, it } from 'vitest'
import { heroEntries } from '../../lib/landing/heroData'
import { heroGeometry, LAYOUT } from './heroGeometry'

describe('hero tape geometry', () => {
  const entries = heroEntries()
  const before = entries.findIndex((e) => e.kind === 'quote')

  it('the desktop rest point is the middle of the span from the quote to the last fill', () => {
    // With fixed widths, the quote starts after `before` prints of 152 px. Every entry between the quote and the last
    // fill adds its own width; the centre is (quote.left + lastFill.right) / 2.
    const w = LAYOUT.desk.w
    const qL = before * w.print
    const lastFill = entries.map((e, i) => (e.kind === 'fill' ? i : -1)).filter((i) => i >= 0).pop()!
    let r = qL
    for (let i = before; i <= lastFill; i++) r += w[entries[i].kind]
    const g = heroGeometry(entries, 'desk')
    expect(g.centre).toBe((qL + r) / 2)
    expect(g.stopShare).toBe(0.44)
  })
  it('every mark has a leader and a note on both layouts, and the notes do not overlap', () => {
    for (const name of ['desk', 'phone'] as const) {
      const g = heroGeometry(entries, name)
      expect(g.marks.fee).toHaveLength(2)
      for (const k of ['spread', 'impact', 'fee'] as const) {
        expect(g.leaders[k]).toMatch(/^M/)
        expect(g.notes[k]).toHaveLength(2)
      }
    }
    // desktop: the spread note (left of the quote, about 180 px wide) ends before the fee note starts
    const d = heroGeometry(entries, 'desk')
    expect(d.notes.spread[0] + 180).toBeLessThan(d.notes.fee[0])
  })
  it('is deterministic: the server and the client draw the same strokes', () => {
    expect(heroGeometry(entries, 'desk')).toEqual(heroGeometry(entries, 'desk'))
  })
})

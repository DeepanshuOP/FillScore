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
  // Design v3 fixes A6 (2026-11-21). The phone's fill tiles are 128 x 104 px and the prints beside them 104 px wide
  // (landing.css). Measured in the browser at 390 px (e2e-shots/probe-tiles.ts): a fill tile's text spans x 9..119,
  // y 23..97 of the tile; a neighbouring print's text starts 9 px inside it and spans y 21..77.
  const points = (d: string) => [...d.matchAll(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])])
  const anchors = (d: string) => d.split(/[MC]/).filter(Boolean).map((seg) => points(seg).pop()!)   // the points the stroke passes through
  const phoneFills = () => {
    const w = LAYOUT.phone.w
    let x = 0
    const boxes = entries.map((e) => { const b = { kind: e.kind, l: x, r: x + w[e.kind] }; x += w[e.kind]; return b })
    return boxes.filter((b) => b.kind === 'fill')
  }
  it('phone: each fee loop goes round the whole fill tile and crosses no printed text', () => {
    const g = heroGeometry(entries, 'phone')
    phoneFills().forEach((f, i) => {
      for (const [x, y] of anchors(g.marks.fee[i])) {
        // outside the tile's own text (2 px clear)
        const inside = x > f.l + 9 - 2 && x < f.l + 119 + 2 && y > 23 - 2 && y < 97 + 2
        expect(inside, `loop ${i} at ${x},${y}`).toBe(false)
        // not into the neighbouring prints' text (which starts 9 px past the tile's edges, at y 21..77)
        if (y > 21 && y < 77) expect(x > f.l - 9 + 2 && x < f.r + 9 - 2, `loop ${i} at ${x},${y}`).toBe(true)
      }
    })
  })
  it('the fee note\'s leader starts on the second fill\'s pen mark, not in the gap between the fills (both layouts)', () => {
    for (const name of ['desk', 'phone'] as const) {
      const g = heroGeometry(entries, name)
      const [x0, y0] = points(g.leaders.fee)[0]
      const near = Math.min(...anchors(g.marks.fee[1]).map(([x, y]) => Math.hypot(x - x0, y - y0)))
      expect(near, name).toBeLessThan(4)
    }
  })
  it('is deterministic: the server and the client draw the same strokes', () => {
    expect(heroGeometry(entries, 'desk')).toEqual(heroGeometry(entries, 'desk'))
  })
})

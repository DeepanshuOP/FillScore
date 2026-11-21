/**
 * Geometry of the landing hero's tape (design v3). Pure: the entries have fixed widths per layout (landing.css), so the
 * stop position, the pen marks, the leaders and the notes are computed here, on the server too. That makes the no-script
 * and reduced-motion frame the complete, annotated frame. Tested in heroGeometry.test.ts.
 */
import { bracketPath, circlePath, leaderPath, loopPath } from '../../ui/pen'

/** The points a pen path passes through (its M and C end points). */
function anchorsOf(d: string): Array<[number, number]> {
  return d.split(/[MC]/).filter(Boolean).map((seg) => {
    const n = seg.trim().split(/\s+/).map(Number)
    return [n[n.length - 2], n[n.length - 1]] as [number, number]
  })
}
import type { TapeEntry } from '../../lib/landing/heroData'

export const LAYOUT = {
  desk: { H: 134, w: { print: 152, quote: 214, fill: 152 } },
  phone: { H: 104, w: { print: 104, quote: 150, fill: 128 } },
} as const
export type LayoutName = keyof typeof LAYOUT

export interface HeroGeo {
  H: number
  /** The tape is at rest when this x (in tape px) sits at the stop line: 44% of the width on a desktop, 50% on a phone. */
  centre: number
  stopShare: number
  marks: { spread: string; impact: string; fee: string[] }
  leaders: { spread: string; impact: string; fee: string }
  notes: { spread: [number, number]; impact: [number, number]; fee: [number, number] }
}

export function heroGeometry(entries: TapeEntry[], name: LayoutName): HeroGeo {
  const L = LAYOUT[name]
  let x = 0
  const boxes = entries.map((e) => { const w = L.w[e.kind]; const b = { kind: e.kind, l: x, r: x + w }; x += w; return b })
  const q = boxes.find((b) => b.kind === 'quote')!
  const fills = boxes.filter((b) => b.kind === 'fill')
  const first = fills[0], last = fills[fills.length - 1]
  const H = L.H
  const spreadMid = (q.l + q.r) / 2, impactMid = (q.l + last.r) / 2, feeMid = (first.l + last.r) / 2
  // Fee marks. Desktop: the loose circle. Phone (design v3 fixes A6): a squarish loop round the whole 128 x 104 tile,
  // centred on its text (x 9..119, y 23..97: centre 64, 60), half-axes 68 x 48 so it clears the text and stops short of
  // the neighbouring prints' text, 9 px past the tile's edges (heroGeometry.test.ts checks both).
  const fee = fills.map((f, i) => (name === 'phone'
    ? loopPath(f.l + (f.r - f.l) / 2 - 68, 60 - 48, 136, 96, 31 + i)
    : circlePath(f.l + 2, 8, f.r - f.l - 4, H - 16, 31 + i)))
  // The fee note's leader starts on the second fill's mark (near its top, left of centre), never in the gap.
  const c2 = (last.l + last.r) / 2
  const top = anchorsOf(fee[1]).filter(([, y]) => y < H / 2)
  const [lx, ly] = top.reduce((a, b) => (Math.abs(b[0] - (c2 - 14)) < Math.abs(a[0] - (c2 - 14)) ? b : a))
  return {
    H,
    centre: name === 'phone' ? feeMid : impactMid,
    stopShare: name === 'phone' ? 0.5 : 0.44,
    marks: {
      spread: bracketPath(q.l + 10, q.r - 10, -12, -9, 11),     // above the tape, ticks pointing down at the quote
      impact: bracketPath(q.l + 4, last.r - 4, H + 14, 10, 23),  // under the tape, ticks pointing up
      fee,
    },
    leaders: {
      spread: leaderPath(spreadMid - 24, -15, q.l + 8, -44, 5),
      impact: leaderPath(impactMid, H + 16, impactMid - 36, H + 50, 6),
      fee: leaderPath(lx, ly, feeMid + 44, -42, 7),
    },
    notes: {
      spread: [q.l - 4, -86],
      impact: [impactMid - 128, H + 54],
      fee: [feeMid + 38, -84],
    },
  }
}

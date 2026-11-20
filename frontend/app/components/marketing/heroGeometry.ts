/**
 * Geometry of the landing hero's tape (design v3). Pure: the entries have fixed widths per layout (landing.css), so the
 * stop position, the pen marks, the leaders and the notes are computed here, on the server too. That makes the no-script
 * and reduced-motion frame the complete, annotated frame. Tested in heroGeometry.test.ts.
 */
import { bracketPath, circlePath, leaderPath } from '../../ui/pen'
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
  return {
    H,
    centre: name === 'phone' ? feeMid : impactMid,
    stopShare: name === 'phone' ? 0.5 : 0.44,
    marks: {
      spread: bracketPath(q.l + 10, q.r - 10, -12, -9, 11),     // above the tape, ticks pointing down at the quote
      impact: bracketPath(q.l + 4, last.r - 4, H + 14, 10, 23),  // under the tape, ticks pointing up
      fee: fills.map((f, i) => circlePath(f.l + 2, 8, f.r - f.l - 4, H - 16, 31 + i)),
    },
    leaders: {
      spread: leaderPath(spreadMid - 24, -15, q.l + 8, -44, 5),
      impact: leaderPath(impactMid, H + 16, impactMid - 36, H + 50, 6),
      fee: leaderPath(feeMid + 18, -3, feeMid + 44, -42, 7),
    },
    notes: {
      spread: [q.l - 4, -86],
      impact: [impactMid - 128, H + 54],
      fee: [feeMid + 38, -84],
    },
  }
}

/**
 * Hand values for the landing tape (fixture landing-order.inputs.json, BTCUSDT 2024-01-28).
 *   prints 41914.00 to 41918.40; quotes add 41922.03 (an ask 4 s before placement), which is more than 3 above the mid
 *   when placed (41918.005) and is left out of the domain so it does not flatten the drawing (the band is clipped there).
 *   domain = [floor(41914.00 - 0.4), ceil(41918.40 + 0.4)] = [41913, 41919]; inner ticks 41914 ... 41918.
 *   The lowest print after the last fill (20:41:42.095) is 41914.00.
 */
import { describe, expect, it } from 'vitest'
import inputs from '../../design-lab/fixtures/landing-order.inputs.json'
import replay from '../../design-lab/fixtures/landing-order.replay.json'
import { priceDomain, quoteBandPath, tapeModel } from './tapeModel'

const box = { W: 720, H: 320, L: 64, R: 700, T: 24, B: 280 }

describe('tape model', () => {
  it('price domain and ticks', () => {
    expect(priceDomain(inputs)).toEqual([41913, 41919])
    expect(tapeModel(inputs, replay.fills, box).ticks).toEqual([41914, 41915, 41916, 41917, 41918])
  })
  it('positions: placement at arrival, both fills at the bid 41918.00', () => {
    const m = tapeModel(inputs, replay.fills, box)
    // y(41918) = 280 - (41918 - 41913) / 6 x 256 = 280 - 213.333 = 66.667
    expect(m.fills.map((f) => Math.round(f.y * 1000) / 1000)).toEqual([66.667, 66.667])
    // x(arrival) = 64 + 4000 / 6633 x 636 = 64 + 383.537 = 447.537 (window 20:41:36.962 to 20:41:43.595 = 6633 ms)
    expect(m.arrival.x).toBeCloseTo(447.537, 2)
    expect(m.lowAfter).toBe(41914)
  })
  it('the quote band is one closed path along the asks and back along the bids', () => {
    const d = quoteBandPath([{ ts: 0, mid: 1.5, bid: 1, ask: 2 }, { ts: 10, mid: 2.5, bid: 2, ask: 3 }], 20, (t) => t, (v) => v * 10, 99)
    expect(d).toBe('M0,20 H10 V30 H20 V20 H10 V10 H0 Z')
  })
})

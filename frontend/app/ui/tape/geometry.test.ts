/**
 * Geometry of the hero drawing "one order, measured". Pure functions; every expected value is worked out by hand.
 * The real order: BNBUSDT BUY, mid at placement 313.25, filled at 313.40; spread 1.5961691939331055 bps, impact and
 * timing 3.1923383878698397 bps, execution 4.7885075818029454 bps, fees 10.004788507581804 bps.
 */
import { describe, expect, it } from 'vitest'
import { bracketPriceSpan, linearScale, printRadius, rulerSegments, stepPath, sweepSeconds } from './geometry'

describe('linearScale', () => {
  it('maps a domain onto a range, including an inverted range (price up = y down)', () => {
    const x = linearScale(0, 10, 100, 200)
    expect(x(0)).toBe(100)
    expect(x(10)).toBe(200)
    expect(x(2.5)).toBe(125)
    const y = linearScale(313.05, 313.45, 260, 60)       // 0.40 of price over 200 px: 500 px per 1.00
    expect(y(313.25)).toBeCloseTo(160, 9)                  // the middle of the range
    expect(y(313.4)).toBeCloseTo(85, 9)                    // 0.15 above the middle: 160 - 75
  })
})

describe('bracketPriceSpan', () => {
  it('turns basis points of the placement mid into a price distance', () => {
    expect(bracketPriceSpan(1.5961691939331055, 313.25)).toBeCloseTo(0.05, 9)    // 313.25 x 1.5961691939331055 / 1e4
    expect(bracketPriceSpan(3.1923383878698397, 313.25)).toBeCloseTo(0.1, 9)
    expect(bracketPriceSpan(4.7885075818029454, 313.25)).toBeCloseTo(0.15, 9)    // = 313.40 - 313.25
    expect(bracketPriceSpan(0, 313.25)).toBe(0)
  })
  it('the two brackets stack exactly onto the fill', () => {
    const mid = 313.25
    const top = mid + bracketPriceSpan(1.5961691939331055, mid) + bracketPriceSpan(3.1923383878698397, mid)
    expect(top).toBeCloseTo(313.4, 9)
  })
})

describe('rulerSegments', () => {
  const terms = [{ key: 'spread', bps: 1.5961691939331055 }, { key: 'impactTiming', bps: 3.1923383878698397 }, { key: 'fees', bps: 10.004788507581804 }]
  it('lays the terms end to end on one bps scale; the last end is the total', () => {
    const segs = rulerSegments(terms, 100, 900, 16)      // 800 px for 16 bps = 50 px per bps
    expect(segs.map((s) => s.key)).toEqual(['spread', 'impactTiming', 'fees'])
    expect(segs[0].x).toBe(100)
    expect(segs[0].width).toBeCloseTo(1.5961691939331055 * 50, 9)               // 79.80845969665528
    expect(segs[1].x).toBeCloseTo(100 + 1.5961691939331055 * 50, 9)
    expect(segs[2].x + segs[2].width).toBeCloseTo(100 + (1.5961691939331055 + 3.1923383878698397 + 10.004788507581804) * 50, 9)   // 14.793296... x 50 + 100 = 839.66
  })
  it('a term with no value is left out, never drawn as a zero-width mark with a label', () => {
    expect(rulerSegments([{ key: 'a', bps: 2 }, { key: 'b', bps: null }, { key: 'c', bps: 0 }], 0, 100, 10).map((s) => s.key)).toEqual(['a'])
  })
})

describe('stepPath', () => {
  it('a mid line is a step function: it holds its value until the next point', () => {
    const d = stepPath([{ t: 0, v: 5 }, { t: 10, v: 7 }, { t: 20, v: 6 }], 30, (t) => t, (v) => v * 10)
    expect(d).toBe('M0,50 H10 V70 H20 V60 H30')
  })
})

describe('printRadius', () => {
  it('grows with size but is bounded: a 62 BNB print is not 3000 times a 0.02 print', () => {
    expect(printRadius(0.02)).toBeLessThan(printRadius(5))
    expect(printRadius(5)).toBeLessThan(printRadius(62.206))
    expect(printRadius(1e9)).toBeLessThanOrEqual(7)
    expect(printRadius(0)).toBeGreaterThanOrEqual(2.5)
  })
})

describe('sweepSeconds', () => {
  it('maps real tape time onto the sweep: 6433 ms of tape in 2.6 s', () => {
    expect(sweepSeconds(0, 0, 6433, 2.6)).toBe(0)
    expect(sweepSeconds(6433, 0, 6433, 2.6)).toBe(2.6)
    expect(sweepSeconds(3216.5, 0, 6433, 2.6)).toBeCloseTo(1.3, 9)
  })
})

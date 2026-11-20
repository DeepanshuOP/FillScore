import { describe, expect, it } from 'vitest'
import { intervalDomain } from './IntervalPlot'
import { stackWidths } from './StackBar'
import { arcPath } from './ScoreGauge'

describe('intervalDomain', () => {
  it('pads the span of interval, difference and zero by 15%', () => {
    // demo-moderate: low -0.3369, high -0.0923, diff -0.2053 -> lo = -0.3369, hi = 0 (zero is included), span 0.3369,
    // pad = 0.15 x 0.3369 = 0.050535 -> [-0.387435, 0.050535]
    const [a, b] = intervalDomain(-0.3369, -0.0923, -0.2053)
    expect(a).toBeCloseTo(-0.387435, 9)
    expect(b).toBeCloseTo(0.050535, 9)
  })
  it('a tiny span is padded by at least 0.05 bps', () => {
    // low = high = diff = 0.01 -> lo 0, hi 0.01, span 0.01, 15% = 0.0015 < 0.05 -> [-0.05, 0.06]
    const [a, b] = intervalDomain(0.01, 0.01, 0.01)
    expect(a).toBeCloseTo(-0.05, 12)
    expect(b).toBeCloseTo(0.06, 12)
  })
})

describe('stackWidths', () => {
  it('splits only the parts above zero', () => {
    // 30 + 10 = 40 -> 75% and 25%; the negative part is not drawn
    const w = stackWidths([
      { key: 'a', label: 'A', value: 30, valueLabel: '' },
      { key: 'b', label: 'B', value: -5, valueLabel: '' },
      { key: 'c', label: 'C', value: 10, valueLabel: '' },
    ])
    expect(w).toEqual([{ key: 'a', pct: 75 }, { key: 'c', pct: 25 }])
  })
})

describe('arcPath', () => {
  it('draws a 240 degree arc from 150 degrees on r 52 around (64, 64)', () => {
    // start (64 + 52 cos150, 64 + 52 sin150) = (18.97, 90); end at 390 deg = 30 deg: (109.03, 90); large-arc flag 1
    expect(arcPath(64, 64, 52, 150, 240)).toBe('M18.97 90 A52 52 0 1 1 109.03 90')
  })
})

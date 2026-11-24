import { describe, expect, it } from 'vitest'
import { niceDomain, niceTicks } from './ticks'

// Hand values (target 4 ticks): the step is 1, 2 or 5 times a power of ten, chosen from raw = (hi - lo) / 4.
//   0..8:    raw 2     -> mantissa 2   -> step 2   -> 0, 2, 4, 6, 8
//   0..9.6:  raw 2.4   -> mantissa 2.4 -> step 5   -> 0, 5
//   0..1:    raw 0.25  -> pow 0.1, mantissa 2.5 -> step 0.5 -> 0, 0.5, 1
//   0..3:    raw 0.75  -> pow 0.1, mantissa 7.5 -> step 1   -> 0, 1, 2, 3
//   0..4.4:  raw 1.1   -> mantissa 1.1 -> step 2   -> 0, 2, 4
//   -1.3..4.2: raw 1.375 -> step 2 -> first multiple at or above -1.3 is 0 (not -0) -> 0, 2, 4
describe('niceTicks', () => {
  it('ticks are multiples of 1, 2 or 5 times a power of ten', () => {
    expect(niceTicks(0, 8)).toEqual([0, 2, 4, 6, 8])
    expect(niceTicks(0, 9.6)).toEqual([0, 5])
    expect(niceTicks(0, 1)).toEqual([0, 0.5, 1])
    expect(niceTicks(0, 3)).toEqual([0, 1, 2, 3])
  })
  it('a dollar axis starts at $0 with round ticks', () => {
    expect(niceTicks(0, 4.4)).toEqual([0, 2, 4])
  })
  it('crosses zero cleanly, with no -0', () => {
    const t = niceTicks(-1.3, 4.2)
    expect(t).toEqual([0, 2, 4])
    expect(t.some((v) => Object.is(v, -0))).toBe(false)
  })
  it('a flat or invalid domain returns the single value or nothing', () => {
    expect(niceTicks(2, 2)).toEqual([2])
    expect(niceTicks(NaN, 2)).toEqual([])
  })
})

// niceDomain(1.3, 7.2): holds zero -> 0..7.2, step 2, upper end ceil(7.2 / 2) * 2 = 8.   niceDomain(-1.3, 4.2): step 2, [-2, ceil(2.1) * 2 = 6].
describe('niceDomain', () => {
  it('holds zero and the served values, ending on tick multiples', () => {
    expect(niceDomain(1.3, 7.2)).toEqual([0, 8])
    expect(niceDomain(-1.3, 4.2)).toEqual([-2, 6])
  })
})

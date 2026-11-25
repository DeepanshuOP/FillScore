import { describe, expect, it } from 'vitest'
import { clockTick, niceDomain, niceTicks, niceTimeTicks, priceDecimals } from './ticks'

// Reviewer item (design v5 step 5): the receipt chart's time axis carried odd values (14:00:00.123) and its price axis a fixed two
// decimals. Time ticks are multiples of a round step (1, 2, 5 times a power of ten up to 500 ms, then 1, 2, 5, 10, 15, 30 s, 1, 2, 5
// min); price decimals are the decimals the stored public trades use, which is the symbol's tick size (trade prices are multiples of it).
// Hand values: day = Date.UTC(2024, 0, 15, 14, 0, 0) is a whole second, so a multiple of 200 ms from the epoch is a multiple of 200 ms after it.
// The step is the smallest round step at or above raw = range / target. The ticks are the multiples of the step inside the range.
//   14:00:00.123 to 14:00:00.987 is 864 ms; target 5: raw 172.8 ms -> step 200 ms -> .200 .400 .600 .800
//   0 to 42 s; target 4: raw 10.5 s -> step 15 s -> 0, 15 s, 30 s (45 s is past the end)
//   0 to 6 min; target 4: raw 90 s -> step 120 s -> 0, 2, 4, 6 min
const DAY = Date.UTC(2024, 0, 15, 14, 0, 0)
describe('niceTimeTicks', () => {
  it('picks the smallest round step at or above (range / target): 864 ms over 5 ticks is 200 ms', () => {
    expect(niceTimeTicks(DAY + 123, DAY + 987, 5)).toEqual([DAY + 200, DAY + 400, DAY + 600, DAY + 800])
  })
  it('seconds: 0 to 42 s over 4 ticks (raw 10.5 s) steps 15 s', () => {
    expect(niceTimeTicks(DAY, DAY + 42_000, 4)).toEqual([DAY, DAY + 15_000, DAY + 30_000])
  })
  it('a 6 minute range steps 2 minutes (raw 90 s; the next round step at or above it is 120 s)', () => {
    expect(niceTimeTicks(DAY, DAY + 360_000, 4)).toEqual([DAY, DAY + 120_000, DAY + 240_000, DAY + 360_000])
  })
  it('a flat or invalid range returns the one value or nothing', () => {
    expect(niceTimeTicks(DAY, DAY)).toEqual([DAY])
    expect(niceTimeTicks(NaN, DAY)).toEqual([])
  })
})

describe('clockTick', () => {
  it('prints milliseconds only when the step is under a second', () => {
    expect(clockTick(DAY + 200, 200)).toBe('14:00:00.200')
    expect(clockTick(DAY + 15_000, 15_000)).toBe('14:00:15')
  })
})

describe('priceDecimals', () => {
  it('is the most decimals any stored price uses: 42000.1 and 42000.25 need 2', () => {
    expect(priceDecimals([42000.1, 42000.25, 42001])).toBe(2)
  })
  it('whole prices need none; an 8-decimal price needs 8 (no float noise: 0.00001234 is 8, not 17)', () => {
    expect(priceDecimals([42000, 42001])).toBe(0)
    expect(priceDecimals([0.00001234, 0.00001235])).toBe(8)
  })
  it('no prices: 2 (the default)', () => {
    expect(priceDecimals([])).toBe(2)
  })
})

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
  it('small ranges carry no float noise (review fix): 0..0.8 gives 0, 0.2, 0.4, 0.6, 0.8', () => {
    expect(niceTicks(0, 0.8)).toEqual([0, 0.2, 0.4, 0.6, 0.8])
    expect(niceTicks(0, 0.3)).toEqual([0, 0.1, 0.2, 0.3])
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

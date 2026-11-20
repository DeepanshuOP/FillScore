/**
 * The noise-aware rankings view (orders of 2026-11-20). Hand case, written before the code:
 *   groups as the API returns them (backend rankWithNoise: ranked first, cheapest median first, then the too-few groups)
 *     A  n 40  median 1.0  interval [0.5, 1.5]  rank 1  tied with B
 *     B  n 25  median 1.8  interval [1.2, 2.4]  rank 1  tied with A, C   (nothing lies entirely below 1.2: A's high 1.5 > 1.2)
 *     C  n 30  median 3.0  interval [2.2, 3.6]  rank 2  tied with B      (A's high 1.5 < C's low 2.2: one group clearly cheaper)
 *     D  n 12  too few
 *   Expected rows: ranks 1, 1, 2 (they start at 1); A and B read "not distinguishable from"; D comes after the ranked ones
 *   as "too few to tell (12 orders; 20 are needed)". Shared axis = [min low, max high] = [0.5, 3.6].
 * The part 1 screenshots showed ranks 2, 3, 4 with no rank 1: the cause was the screenshot fixture (cut-fixtures.ts), which
 * numbered groups by position (i + 1) and wrote status "too_few"; the backend always gives the lowest interval rank 1.
 */
import { describe, expect, it } from 'vitest'
import { describeRankPlot } from './rankingsView'

const body = {
  by: 'symbol', level: 0.9, minOrders: 20,
  groups: [
    { key: 'A', n: 40, median: 1.0, low: 0.5, high: 1.5, status: 'ranked', rank: 1, tiedWith: ['B'] },
    { key: 'B', n: 25, median: 1.8, low: 1.2, high: 2.4, status: 'ranked', rank: 1, tiedWith: ['A', 'C'] },
    { key: 'C', n: 30, median: 3.0, low: 2.2, high: 3.6, status: 'ranked', rank: 2, tiedWith: ['B'] },
    { key: 'D', n: 12, median: null, low: null, high: null, status: 'too-few', rank: null, tiedWith: [] },
  ],
}

describe('describeRankPlot', () => {
  const v = describeRankPlot(body)
  it('ranks start at 1 and overlapping groups share a rank', () => {
    expect(v.ranked.map((r) => [r.key, r.rank])).toEqual([['A', 1], ['B', 1], ['C', 2]])
  })
  it('names the groups it cannot tell apart', () => {
    expect(v.ranked[0].tie).toBe('not distinguishable from B')
    expect(v.ranked[1].tie).toBe('not distinguishable from A, C')
  })
  it('lists too-few groups after the ranked ones, with what is needed', () => {
    expect(v.tooFew).toEqual([{ key: 'D', n: 12, text: 'too few to tell (12 orders; 20 are needed)' }])
  })
  it('the shared axis spans the lowest low and the highest high', () => {
    expect(v.domain).toEqual([0.5, 3.6])
  })
  it('re-sorts by rank then median if an answer arrives in another order, and never shows a rank below 1', () => {
    const shuffled = describeRankPlot({ ...body, groups: [body.groups[3], body.groups[2], body.groups[0], body.groups[1]] })
    expect(shuffled.ranked.map((r) => r.key)).toEqual(['A', 'B', 'C'])
    expect(shuffled.tooFew.map((r) => r.key)).toEqual(['D'])
  })
  it('a group whose status is not "ranked" (any spelling) is too few, never ranked', () => {
    const odd = describeRankPlot({ ...body, groups: [{ ...body.groups[3], status: 'too_few' }] })
    expect(odd.ranked).toEqual([])
    expect(odd.tooFew).toHaveLength(1)
  })
  it('no groups: says so', () => {
    expect(describeRankPlot({ ...body, groups: [] }).empty).toBe('Insufficient data: no measured orders.')
  })
})

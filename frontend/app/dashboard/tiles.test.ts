import { describe, expect, it } from 'vitest'
import { kpiTiles } from './tiles'
import type { Headline } from './headline'

/**
 * Hand values (demo-moderate, served by /audit/orders-summary): total $52.0785604695634 = 11.726294159111706 bps over 245 orders,
 * of which $10.63 modelled for 11 unfilled orders; fees $13.4 at 3.0 bps (published rate). 52.0785... prints $52.08; 11.726... prints
 * 11.7 bps; 10.63 prints $10.63. A grade of 93.4056 with the band [92.5, 94.1] prints "A, 93.4" and "range 92.5 to 94.1".
 */
const headline: Headline = { orders: 245, totalUsd: 52.0785604695634, totalBps: 11.726294159111706, measuredUsd: 41.45, feesUsd: 13.4, feesNotMeasured: true, unmeasuredOrders: 0, unfilledUsd: 10.63, unfilledOrders: 11 }
const ordersBody = { shortfall: { totals: { fees: { usd: 13.4, bps: 3.0, n: 234 } } } }

describe('kpiTiles', () => {
  it('prints the four served figures in the v5 words', () => {
    const t = kpiTiles(headline, ordersBody, { kind: 'graded', letter: 'A', score: 93.4056, scoringVersion: 'v2.3.0' }, [92.5, 94.1])
    expect(t.map((x) => x.label)).toEqual(['Total cost', 'Fees', 'Unfilled orders (modelled)', 'Execution grade'])
    expect(t[0]).toMatchObject({ value: '$52.08', sub: '11.7 bps, 245 orders, includes $10.63 modelled for unfilled orders' })
    expect(t[1]).toMatchObject({ value: '$13.40', sub: 'published rate, not independently measured' })
    expect(t[2]).toMatchObject({ value: '$10.63', sub: '11 orders that never filled' })
    expect(t[3]).toMatchObject({ value: 'A, 93.4', sub: 'of 100, measured (score 2.3.0), range 92.5 to 94.1' })
  })
  it('a missing figure reads "not computed" or "insufficient data", never a zero', () => {
    const t = kpiTiles(null, null, null, null)
    expect(t[0].value).toBe('not computed')
    expect(t[1].value).toBe('insufficient data')
    expect(t[2].value).toBe('insufficient data')
    expect(t[3].value).toBe('not computed')
    for (const x of t) expect(x.value).not.toMatch(/\$0|^0/)
  })
  it('a grade that is not given keeps the server\'s sentence under "not computed"', () => {
    const t = kpiTiles(headline, ordersBody, { kind: 'none', text: 'No letter grade: fewer than 20 fills (12 so far).' }, null)
    expect(t[3]).toEqual({ id: 'grade', label: 'Execution grade', value: 'not computed', sub: 'No letter grade: fewer than 20 fills (12 so far).' })
  })
  // moved from the removed orders panel (ordersTotals.test.ts, "grammar: one unfilled order takes its, many take their"), design v5 step 6:
  // the Unfilled tile counts with the right noun: 1 order that never filled, 2 orders that never filled
  it('the unfilled tile uses the singular for one order and the plural for more', () => {
    expect(kpiTiles({ ...headline, unfilledUsd: 3.5, unfilledOrders: 1 }, ordersBody, null, null)[2].sub).toBe('1 order that never filled')
    expect(kpiTiles({ ...headline, unfilledUsd: 7, unfilledOrders: 2 }, ordersBody, null, null)[2].sub).toBe('2 orders that never filled')
  })
  it('no unfilled dollars in the total sub-line when none were modelled; a measured fee shows its bps', () => {
    const t = kpiTiles({ ...headline, unfilledUsd: null, unfilledOrders: null, feesNotMeasured: false }, ordersBody, null, null)
    expect(t[0].sub).toBe('11.7 bps, 245 orders')
    expect(t[1].sub).toBe('3.0 bps')
  })
})

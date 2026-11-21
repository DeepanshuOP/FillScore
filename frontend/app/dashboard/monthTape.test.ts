import { describe, expect, it } from 'vitest'
import { baselineShare, dayMarks, monthTicks, nearestTick } from './monthTape'
import type { OrderRow } from './ordersTable'

// Design v3 fixes B1: the height is the order's total cost in dollars (from the server's ledger, `cost.usd`); price
// improvement (a negative cost) is drawn below the baseline, on the same scale.
const row = (key: string, when: string, usd: number | null, type: OrderRow['type'] = 'Market'): OrderRow =>
  ({ key, orderId: key, symbol: 'BTCUSDT', side: 'BUY', type, status: 'FILLED', placedAt: when, firstFill: when, when, fills: 1, quantity: 1,
    notionalUsd: 100, feesUsd: 0.1, makerShare: 0, cost: usd === null ? null : { usd, bps: usd } })

const START = '2024-01-01T00:00:00.000Z'
const END = '2024-02-01T00:00:00.000Z'

describe('monthTicks', () => {
  it('places each order on the period axis and sizes it by its dollar cost, improvements below the line, one scale', () => {
    // Hand values: the period is 31 days. 16 Jan 00:00 is 15 days in: t = 15 / 31 = 0.483871.
    // Costs: b +$1 (1 Jan), c -$1 (10 Jan), a +$3 (16 Jan). Largest cost P = 3, largest improvement N = 1, span 4.
    // Shares of the span: b 1/4 = 0.25, c -1/4 = -0.25, a 3/4 = 0.75. The baseline sits P / span = 0.75 down.
    const t = monthTicks([row('a', '2024-01-16T00:00:00.000Z', 3), row('b', '2024-01-01T00:00:00.000Z', 1), row('c', '2024-01-10T00:00:00.000Z', -1)], START, END)
    expect(t.map((x) => x.key)).toEqual(['b', 'c', 'a'])     // sorted by time
    expect(t[2].t).toBeCloseTo(0.483871, 6)
    expect(t[0].t).toBe(0)
    expect(t.map((x) => x.v)).toEqual([0.25, -0.25, 0.75])
    expect(baselineShare(t)).toBe(0.75)
  })
  it('leaves out an order outside the period or with no usable time, and clamps nothing into it', () => {
    const t = monthTicks([row('in', '2024-01-31T23:59:59.000Z', 1), row('late', '2024-02-02T00:00:00.000Z', 1), row('bad', 'not a date', 1)], START, END)
    expect(t.map((x) => x.key)).toEqual(['in'])
  })
  it('an order with no measured cost still gets a mark, flagged unmeasured, never a made-up height', () => {
    const t = monthTicks([row('z', '2024-01-02T00:00:00.000Z', 0), row('n', '2024-01-03T00:00:00.000Z', null)], START, END)
    expect(t.map((x) => [x.v, x.measured])).toEqual([[0, true], [0, false]])
    expect(baselineShare(t)).toBe(1)                         // nothing to draw above or below: the line at the bottom
  })
  it('all improvements: the baseline at the top', () => {
    // -2 and -1: P = 0, N = 2, span 2: shares -1 and -0.5; baseline 0 / 2 = 0
    const t = monthTicks([row('x', '2024-01-02T00:00:00.000Z', -2), row('y', '2024-01-03T00:00:00.000Z', -1)], START, END)
    expect(t.map((x) => x.v)).toEqual([-1, -0.5])
    expect(baselineShare(t)).toBe(0)
  })
  it('an empty period gives no ticks', () => {
    expect(monthTicks([row('a', '2024-01-02T00:00:00.000Z', 5)], END, START)).toEqual([])
  })
})

describe('dayMarks', () => {
  it('one mark per UTC day start inside the period', () => {
    const d = dayMarks(START, END)
    expect(d).toHaveLength(31)
    expect(d[0]).toEqual({ day: 1, t: 0 })
    // 2 Jan is 1 day in: 1 / 31 = 0.032258
    expect(d[1].t).toBeCloseTo(0.032258, 6)
  })
})

describe('nearestTick', () => {
  it('the closest tick within the reach, else null', () => {
    const xs = [10, 50, 52]
    expect(nearestTick(xs, 49, 12)).toBe(1)
    expect(nearestTick(xs, 53, 12)).toBe(2)
    expect(nearestTick(xs, 100, 12)).toBeNull()
  })
})

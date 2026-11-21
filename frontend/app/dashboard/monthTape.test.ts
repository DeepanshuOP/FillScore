import { describe, expect, it } from 'vitest'
import { dayMarks, monthTicks, nearestTick } from './monthTape'
import type { OrderRow } from './ordersTable'

const row = (key: string, firstFill: string, notionalUsd: number, type: OrderRow['type'] = 'Market'): OrderRow =>
  ({ key, orderId: key, symbol: 'BTCUSDT', side: 'BUY', type, status: 'FILLED', placedAt: firstFill, firstFill, when: firstFill, fills: 1, quantity: 1, notionalUsd, feesUsd: 0.1, makerShare: 0 })

const START = '2024-01-01T00:00:00.000Z'
const END = '2024-02-01T00:00:00.000Z'

describe('monthTicks', () => {
  it('places each order on the period axis and sizes it by the square root of its value', () => {
    // Hand values: the period is 31 days. 16 Jan 00:00 is 15 days in: t = 15 / 31 = 0.483871.
    // Values 100 and 400: sqrt 10 and 20; the largest is 20, so the shares are 10 / 20 = 0.5 and 20 / 20 = 1.
    const t = monthTicks([row('a', '2024-01-16T00:00:00.000Z', 100), row('b', '2024-01-01T00:00:00.000Z', 400)], START, END)
    expect(t.map((x) => x.key)).toEqual(['b', 'a'])          // sorted by time
    expect(t[1].t).toBeCloseTo(0.483871, 6)
    expect(t[0].t).toBe(0)
    expect(t[1].v).toBeCloseTo(0.5, 9)
    expect(t[0].v).toBe(1)
  })
  it('leaves out an order outside the period or with no usable time, and clamps nothing into it', () => {
    const t = monthTicks([row('in', '2024-01-31T23:59:59.000Z', 1), row('late', '2024-02-02T00:00:00.000Z', 1), row('bad', 'not a date', 1)], START, END)
    expect(t.map((x) => x.key)).toEqual(['in'])
  })
  it('a zero or missing value still gets a mark (share 0), never a made-up height', () => {
    const t = monthTicks([row('z', '2024-01-02T00:00:00.000Z', 0), row('n', '2024-01-03T00:00:00.000Z', Number.NaN)], START, END)
    expect(t.map((x) => x.v)).toEqual([0, 0])
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

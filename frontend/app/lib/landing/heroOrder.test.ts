/**
 * The landing hero's order is chosen by a stated rule (orders of 2026-11-20): the demo-moderate MARKET order whose
 * execution cost is nearest that account's median market-order execution cost; ties go to the earliest order.
 * Median of an even count = the lower of the two middle values (so the median is always one order's own value).
 *
 * Hand case: costs 4, 1, 3, 2 bps (orders w, x, y, z; created in that order) -> sorted 1 2 3 4, lower middle = 2 (z),
 * so z is chosen. With 1, 3, 3 (x, y, w) the median is 3 and both y and w are at distance 0: the earlier one wins.
 * Real data (ml-service/demo_v2/out/demo-moderate, committed): 84 measured market orders; the lower middle value is
 * 0.001192804859071087 bps, the execution cost of ord-moderate-BTCUSDT-968874 (2024-01-28T20:41:40.962Z).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chooseHeroOrder, lowerMedian } from './heroOrder'
import inputs from '../../design-lab/fixtures/landing-order.inputs.json'
import replay from '../../design-lab/fixtures/landing-order.replay.json'

const o = (orderId: string, createdAt: string, executionBps: number | null, type = 'MARKET') => ({ orderId, createdAt, type, executionBps })

describe('lowerMedian', () => {
  it('odd count: the middle; even count: the lower middle', () => {
    expect(lowerMedian([3, 1, 2])).toBe(2)
    expect(lowerMedian([4, 1, 3, 2])).toBe(2)
  })
})

describe('chooseHeroOrder', () => {
  it('picks the order at the lower median', () => {
    expect(chooseHeroOrder([o('w', '2024-01-01', 4), o('x', '2024-01-02', 1), o('y', '2024-01-03', 3), o('z', '2024-01-04', 2)])?.orderId).toBe('z')
  })
  it('a tie goes to the earliest order', () => {
    expect(chooseHeroOrder([o('x', '2024-01-02', 1), o('y', '2024-01-03', 3), o('w', '2024-01-01', 3)])?.orderId).toBe('w')
  })
  it('ignores limit orders and orders without a measured execution cost', () => {
    expect(chooseHeroOrder([o('a', '2024-01-01', 9, 'LIMIT'), o('b', '2024-01-02', null), o('c', '2024-01-03', 5)])?.orderId).toBe('c')
    expect(chooseHeroOrder([])).toBeNull()
  })
  it('on the committed demo-moderate data, the rule picks the order the landing fixture holds', () => {
    const dir = resolve(__dirname, '../../../../ml-service/demo_v2/out/demo-moderate')
    const orders = JSON.parse(readFileSync(resolve(dir, 'orders.json'), 'utf8')) as Array<{ orderId: string; createdAt: string; type: string }>
    const meas = JSON.parse(readFileSync(resolve(dir, 'order_measurements.json'), 'utf8')) as Array<{ orderId: string; shortfall: { executionBps: number | null } | null }>
    const byId = new Map(orders.map((x) => [x.orderId, x]))
    const rows = meas.map((m) => { const od = byId.get(m.orderId)!; return o(m.orderId, od.createdAt, m.shortfall?.executionBps ?? null, od.type) })
    const chosen = chooseHeroOrder(rows)
    expect(rows.filter((r) => r.type === 'MARKET' && r.executionBps !== null)).toHaveLength(84)
    expect(chosen?.orderId).toBe('ord-moderate-BTCUSDT-968874')
    expect(chosen?.executionBps).toBe(0.001192804859071087)
    expect(inputs.order.orderId).toBe(chosen?.orderId)
    expect(replay.order.orderId).toBe(chosen?.orderId)
  })
  it('the landing replay figures equal the stored measurement (the fixture is not edited by hand)', () => {
    const s = inputs.measurement.shortfall
    const d = Object.fromEntries(replay.decomposition.map((f) => [f.key, f.bps]))
    expect(d.execution).toBe(s.executionBps)
    expect(d.spread).toBe(s.spreadBps)
    expect(d.impactTiming).toBe(s.impactTimingBps)
    expect(d.fees).toBe(s.feesBps)
    expect(d.total).toBe(s.totalBps)
    // total = execution + fees + unfilled: 0.001192804859071087 + 9.999998807195139 + 0 = 10.00119161205421
    expect(d.total).toBeCloseTo(0.001192804859071087 + 9.999998807195139, 12)
  })
})

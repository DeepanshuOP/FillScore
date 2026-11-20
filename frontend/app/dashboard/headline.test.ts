/**
 * Hand values for the dashboard headline (M8 part 1). The totals fixture adds up by hand:
 *   fees 41.98 + spread -0.34 + impact and timing 0.12 + unfilled orders 10.32 = 52.08 (the total)
 *   measured part of a demo account = total - fees = 52.08 - 41.98 = 10.10 (spread + impact + unfilled = -0.34 + 0.12 + 10.32 = 10.10)
 * The cost-against-expected values are those of demo-moderate: paid -0.0949 bps, expected 0.1104, difference -0.2053,
 * 90% interval -0.3369 to -0.0923, 80 orders.
 */
import { describe, expect, it } from 'vitest'
import { barRows, costInsufficientReason, costSentence, describeHeadline, gradeView, scopeFacts, unmeasuredNote } from './headline'
import type { CostVsExpected } from './scoreV2'

const term = (usd: number, n = 245) => ({ usd, bps: 1, n })
const BODY = {
  available: true,
  orders: { total: 245, filled: 240, partial: 2, unfilled: 3, open: 0 },
  shortfall: {
    n: 245, unmeasured: 2, medianBps: {},
    totals: { execution: term(-0.22), spread: term(-0.34), impactTiming: term(0.12), opportunity: term(10.32), fees: term(41.98), total: { usd: 52.08, bps: 10.6, n: 245 } },
  },
}

describe('describeHeadline', () => {
  it('a demo account: the fees are stated at the published rate, so the measured part leaves them out', () => {
    const h = describeHeadline(BODY, true)!
    expect(h.orders).toBe(245)
    expect(h.totalUsd).toBe(52.08)
    expect(h.feesUsd).toBe(41.98)
    expect(h.feesNotMeasured).toBe(true)
    expect(h.measuredUsd).toBeCloseTo(10.1, 10)
    expect(h.unmeasuredOrders).toBe(2)
  })
  it('a real account: every term is measured, so the measured part is the total and no fee line is split off', () => {
    const h = describeHeadline(BODY, false)!
    expect(h.measuredUsd).toBe(52.08)
    expect(h.feesNotMeasured).toBe(false)
  })
  it('no totals means no headline figure, never zero', () => {
    expect(describeHeadline({ available: true, orders: BODY.orders, shortfall: { n: 0, unmeasured: 0, medianBps: {}, totals: null } }, true)).toBeNull()
    expect(describeHeadline(null, true)).toBeNull()
    expect(describeHeadline({ available: false }, true)).toBeNull()
  })
})

describe('unmeasuredNote', () => {
  it('agrees in number and says nothing when every order was measured', () => {
    expect(unmeasuredNote(0)).toBe('')
    expect(unmeasuredNote(1)).toBe('1 order was not measured and is not in it.')
    expect(unmeasuredNote(2)).toBe('2 orders were not measured and are not in it.')
  })
})

describe('barRows', () => {
  it('orders the terms fees, unfilled orders, spread, impact and timing; the demo fee bar is marked not measured', () => {
    const b = barRows(BODY, true)!
    expect(b.rows.map((r) => r.label)).toEqual(['Fees', 'Unfilled orders', 'Spread paid', 'Impact and timing'])
    expect(b.rows.map((r) => r.valueLabel)).toEqual(['$41.98', '$10.32', '−$0.34', '$0.12'])
    expect(b.rows[0]).toMatchObject({ unmeasured: true, note: 'published rate' })
    expect(b.rows[1].unmeasured).toBeUndefined()
    expect(b.table.map((r) => r.value)).toEqual(['$41.98', '$10.32', '−$0.34', '$0.12', '$52.08'])
    expect(b.table[4].label).toBe('Total')
    expect(b.title).toBe('Where the $52.08 went')
  })
  it('a real account has no unmeasured bar', () => {
    expect(barRows(BODY, false)!.rows.some((r) => r.unmeasured)).toBe(false)
  })
  it('a term with no value is not drawn as zero', () => {
    const body = { ...BODY, shortfall: { ...BODY.shortfall, totals: { ...BODY.shortfall.totals, spread: null } } }
    const b = barRows(body, true)!
    expect(b.rows.map((r) => r.label)).toEqual(['Fees', 'Unfilled orders', 'Impact and timing'])
    expect(b.table.find((r) => r.label === 'Spread paid')!.value).toBe('not computed')
  })
})

describe('costSentence', () => {
  const c: CostVsExpected = { insufficient: false, n: 80, level: 0.9, paidBps: -0.09487614313794934, expectedBps: 0.1104242840781983,
    excessBps: -0.2053004272161476, lowBps: -0.3368533081366843, highBps: -0.09227359039792173, version: 'ec1.0.0', calibrationSha256: 'x' }
  it('one short sentence: difference, interval, n, with true minus signs', () => {
    expect(costSentence(c)).toBe('Market orders cost −0.09 bps against 0.11 bps expected: difference −0.21 bps, 90% interval −0.34 bps to −0.09 bps, 80 orders.')
  })
  it('a positive difference carries a plus sign', () => {
    expect(costSentence({ ...c, paidBps: 4.79, expectedBps: 1.63, excessBps: 3.16, lowBps: -0.02, highBps: 3.28 }))
      .toBe('Market orders cost 4.8 bps against 1.6 bps expected: difference +3.2 bps, 90% interval −0.02 bps to +3.3 bps, 80 orders.')
  })
  it('without an interval it says so', () => {
    expect(costSentence({ ...c, lowBps: null, highBps: null })).toContain('no interval, 80 orders')
  })
  it('insufficient data gives no sentence: the headline shows a ValueState with the reason instead', () => {
    expect(costSentence({ insufficient: true, n: 7, reason: 'x' })).toBeNull()
    expect(costSentence(undefined)).toBeNull()
  })
})

describe('costInsufficientReason', () => {
  it('names what is missing; null when there is a figure', () => {
    expect(costInsufficientReason({ insufficient: true, n: 7, reason: '7 market orders had a usable expected cost; at least 20 are needed' }))
      .toBe('7 market orders had a usable expected cost; at least 20 are needed')
    expect(costInsufficientReason(undefined)).toBe('no market context was stored for these orders')
    expect(costInsufficientReason({ insufficient: false, n: 80, level: 0.9, paidBps: 1, expectedBps: 1, excessBps: 0, lowBps: 0, highBps: 0, version: 'v', calibrationSha256: 'x' })).toBeNull()
  })
})

describe('scopeFacts', () => {
  const audit = { totalTrades: 82, totalNotional: 12345.6, breakdown: { makerRatio: 0.227 }, period: { start: '2024-01-01T00:00:00.000Z', end: '2024-02-01T00:00:00.000Z' }, exchange: 'binance' }
  it('a rebuilt account reads its present fills and orders (3 fills of $420 in 5 orders, none a maker fill)', () => {
    expect(scopeFacts(audit, { fills: 3, orders: 5, notionalUsd: 1260, makerRatio: 0 })).toEqual([
      ['Period', 'Jan 1 – Jan 31, 2024'], ['Venue', 'Binance'], ['Fills', '3, in 5 orders'], ['Value traded', '$1,260.00'], ['Maker share of fills', '0%'],
    ])
  })
  it('an account with no `current` reads the stored audit; one order reads singular', () => {
    expect(scopeFacts(audit, undefined).slice(2)).toEqual([['Fills', '82'], ['Value traded', '$12,345.60'], ['Maker share of fills', '23%']])   // 0.227 -> 23%
    expect(scopeFacts(audit, { fills: 1, orders: 1, notionalUsd: null, makerRatio: null }).slice(2)).toEqual([
      ['Fills', '1, in 1 order'], ['Value traded', 'not computed'], ['Maker share of fills', 'not computed']])
  })
})

describe('gradeView', () => {
  const ok = { scoringVersion: 'v2.3.0', integrityHash: 'abcdefgh', result: { grade: 'A', composite: 94.35, band: [90, 97], reason: null, orders: 245, fills: 300, components: {} } }
  it('a graded score gives the letter and the rounded composite', () => {
    expect(gradeView(200, ok)).toEqual({ kind: 'graded', letter: 'A', score: 94.35, scoringVersion: 'v2.3.0' })
  })
  it('no letter below the minimum sample: the reason, no letter', () => {
    const g = gradeView(200, { ...ok, result: { ...ok.result, grade: null, composite: null, reason: 'fewer than 20 fills', fills: 12 } })
    expect(g).toEqual({ kind: 'none', text: 'No letter grade: fewer than 20 fills (12 so far).' })
  })
  it('not stored yet, or unavailable', () => {
    expect(gradeView(404, { error: 'no_score' })).toEqual({ kind: 'none', text: 'No measured grade yet. It is computed after the orders are synced and measured.' })
    expect(gradeView(500, null)).toEqual({ kind: 'none', text: 'The measured grade could not be loaded.' })
    expect(gradeView(null, null)).toBeNull()
  })
})

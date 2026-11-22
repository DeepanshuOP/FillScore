/**
 * Hand values for the dashboard headline (M8 part 1). The totals fixture adds up by hand:
 *   fees 41.98 + spread -0.34 + impact and timing 0.12 + unfilled orders 10.32 = 52.08 (the total)
 *   measured part of a demo account = total - fees = 52.08 - 41.98 = 10.10 (spread + impact + unfilled = -0.34 + 0.12 + 10.32 = 10.10)
 * The cost-against-expected values are those of demo-moderate: paid -0.0949 bps, expected 0.1104, difference -0.2053,
 * 90% interval -0.3369 to -0.0923, 80 orders.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { barRows, costInsufficientReason, costSentence, describeHeadline, dotNote, gradeView, scopeFacts, totalBpsLabel, totalSentence, unmeasuredNote } from './headline'
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

// Design v3.1 fixes A1 (2026-11-22): the total includes the modelled cost of unfilled orders, which nobody paid, so the
// sentence says "cost" and names that share. Values are the server's `unfilledCost` (hand fixture in the backend test
// unfilledCost.test.ts: 2.50 + 2.00 = 4.50 over 2 orders); demo-moderate's served share is 10.63 of 52.08.
describe('totalSentence', () => {
  const withShare = (unfilledCost: unknown) => describeHeadline({ ...BODY, unfilledCost }, true)!
  it('says cost, names the unfilled share, and never says paid', () => {
    const s = totalSentence(withShare({ usd: 10.631536009963167, count: 11, measured: 11 }))
    // F2: money did not leave the account for an unfilled order, so the sentence says the market moved away from it
    expect(s).toBe('The 245 orders cost $52.08, including $10.63 the market moved away from 11 orders that never filled.')
    expect(s).not.toMatch(/paid/i)
  })
  it('hand fixture: $4.50 of $9.80, from 2 orders', () => {
    const body = { ...BODY, unfilledCost: { usd: 4.5, count: 2, measured: 2 }, shortfall: { ...BODY.shortfall, totals: { ...BODY.shortfall.totals, total: { usd: 9.8, bps: 1, n: 5 } } } }
    expect(totalSentence(describeHeadline(body, false)!)).toBe('The 5 orders cost $9.80, including $4.50 the market moved away from 2 orders that never filled.')
  })
  it('counts the orders the dollars come from: 3 unfilled, 2 measured -> "2 orders" (F2)', () => {
    expect(totalSentence(withShare({ usd: 4.5, count: 3, measured: 2 }))).toBe('The 245 orders cost $52.08, including $4.50 the market moved away from 2 orders that never filled.')
  })
  it('agrees in number for one unfilled order', () => {
    expect(totalSentence(withShare({ usd: 2.5, count: 1, measured: 1 }))).toBe('The 245 orders cost $52.08, including $2.50 the market moved away from 1 order that never filled.')
  })
  it('leaves the clause out when no order went unfilled or the share was not measured (never a zero)', () => {
    expect(totalSentence(withShare({ usd: 0, count: 0, measured: 0 }))).toBe('The 245 orders cost $52.08 in total.')
    expect(totalSentence(withShare({ usd: null, count: 3, measured: 3 }))).toBe('The 245 orders cost $52.08 in total.')
    expect(totalSentence(describeHeadline(BODY, true)!)).toBe('The 245 orders cost $52.08 in total.')
  })
  it('agrees in number', () => {
    const one = { ...BODY, shortfall: { ...BODY.shortfall, totals: { ...BODY.shortfall.totals, total: { usd: 1.5, bps: 1, n: 1 } } } }
    expect(totalSentence(describeHeadline(one, true)!)).toBe('The 1 order cost $1.50 in total.')
  })
})

// Design v3.1 fixes A3: each demo's total cost in bps is printed on the landing receipts and in the demo picker. The server
// sends it (`shortfall.totals.total.bps`, the order shortfall summed over the measured orders); nothing is computed here.
// Hand values from the offline build (ml-service/demo_v2/out/<id>/order_measurements.json): total bps = sum of
// (order bps x intended notional / 10,000) over the orders, over their summed intended notional, x 10,000:
//   demo-disciplined 20.39256125765597 / 18174.00730385158 x 1e4 = 11.2207 bps (144 orders)
//   demo-moderate    52.0785604695634  / 44411.780706606856 x 1e4 = 11.7263 bps (245 orders)
//   demo-aggressive  62.358316088748246 / 61261.90143137648 x 1e4 = 10.1790 bps (310 measured orders)
describe('totalBpsLabel', () => {
  const fixture = (id: string) => JSON.parse(readFileSync(resolve(__dirname, `../../e2e-shots/fixtures/${id}.json`), 'utf8')).ordersBody
  it.each([['demo-disciplined', 11.2207, '11.2 bps'], ['demo-moderate', 11.7263, '11.7 bps'], ['demo-aggressive', 10.179, '10.2 bps']])(
    '%s: the served total is %f bps and prints as %s', (id, bps, label) => {
      const h = describeHeadline(fixture(id), true)!
      expect(h.totalBps).toBeCloseTo(bps, 3)
      expect(totalBpsLabel(h)).toBe(label)
    })
  it('prints nothing when there is no headline (never a zero)', () => {
    expect(totalBpsLabel(null)).toBeNull()
  })
})

// A6 (2026-11-22): the note on the ruler's dot prints paid, expected and the difference as the server sent them, to three
// decimals, so the rounding reads correctly. demo-moderate (served values): paid -0.09487614313794934, expected
// 0.1104242840781983, difference -0.2053004272161476. To three decimals: -0.095, 0.110, -0.205 (and -0.095 - 0.110 = -0.205).
// At two decimals the same values print -0.09, 0.11, -0.21, and -0.09 - 0.11 = -0.20 reads as a wrong subtraction.
describe('dotNote', () => {
  const c = { paidBps: -0.09487614313794934, expectedBps: 0.1104242840781983, excessBps: -0.2053004272161476 }
  it('prints the three server values to three decimals, with a true minus sign', () => {
    expect(dotNote(c)).toBe('Paid −0.095 bps, expected 0.110 bps, difference −0.205 bps.')
  })
  it('three decimals keep the subtraction readable: paid minus expected equals the difference as printed', () => {
    expect((-0.095 - 0.110).toFixed(3)).toBe('-0.205')
  })
  it('a positive difference and a zero value', () => {
    expect(dotNote({ paidBps: 1.2346, expectedBps: 0, excessBps: 1.2346 })).toBe('Paid 1.235 bps, expected 0.000 bps, difference 1.235 bps.')
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
  // A5 (2026-11-22): the footer's order count is the orders that produced fills, from the server's orderCounts (the same
  // source as the Orders ledger). demo-moderate: 245 stored orders, 11 never filled -> 245 - 11 = 234 with fills, 607 fills.
  it('counts fill groups whose order is not stored as orders too (3 fills of 3 unstored orders: "3, in 3 orders")', () => {
    // stored orders 5, none with a fill (withFills 0); the 3 fills belong to 3 orders that are not stored (unrecorded 3): 0 + 3 = 3
    expect(scopeFacts(audit, { fills: 3, orders: 5, notionalUsd: 1260, makerRatio: 0 }, { orders: 5, withFills: 0, fills: 3, unrecorded: 3 }).find(([k]) => k === 'Fills'))
      .toEqual(['Fills', '3, in 3 orders'])
  })
  it('reads the fills and the orders with fills from the server counts: "607, in 234 orders"', () => {
    const counts = { orders: 245, withFills: 234, fills: 607, unrecorded: 0 }
    expect(scopeFacts(audit, { fills: 607, orders: 245, notionalUsd: 41976.3, makerRatio: 0.4 }, counts).find(([k]) => k === 'Fills')).toEqual(['Fills', '607, in 234 orders'])
    expect(scopeFacts(audit, { fills: 1, orders: 3, notionalUsd: 1, makerRatio: 0 }, { orders: 3, withFills: 1, fills: 1, unrecorded: 0 }).find(([k]) => k === 'Fills')).toEqual(['Fills', '1, in 1 order'])
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

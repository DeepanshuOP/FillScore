import { describe, it, expect } from 'vitest'
import { defaultOrderColumns } from './ordersTable'

// The Orders ledger's default columns by screen width (IA v4 step 7, PROPOSAL section 6). A desktop keeps the columns a reader scans
// (time, symbol, side, type, status, notional, fees); the order id, fills, quantity, maker share and the cost are one menu away.
// 390 px: time, symbol, side and cost. 320 px: time and cost, with the symbol printed under the time. False = hidden.
describe('defaultOrderColumns', () => {
  it('a desktop (1440 px): the scanned columns show; the order id, fills, quantity, maker share and cost are hidden', () => {
    expect(defaultOrderColumns(1440)).toEqual({ orderId: false, fills: false, quantity: false, makerShare: false, cost: false })
  })
  it('a tablet (640 px and up) is the same as a desktop', () => {
    expect(defaultOrderColumns(640)).toEqual(defaultOrderColumns(1440))
  })
  it('a phone (390 px): time, symbol, side and cost only', () => {
    const v = defaultOrderColumns(390)
    // visible = every column not set to false: when, symbol, side, cost
    expect(v).toEqual({ orderId: false, fills: false, quantity: false, makerShare: false, type: false, status: false, notionalUsd: false, feesUsd: false })
    expect(v.cost).toBeUndefined()
  })
  it('a small phone (320 px, up to 360): time and cost; the symbol moves under the time, and the side goes to the menu', () => {
    const v = defaultOrderColumns(320)
    expect(v.symbol).toBe(false)
    expect(v.side).toBe(false)
    expect(v.cost).toBeUndefined()
    expect(defaultOrderColumns(360).symbol).toBe(false)
    expect(defaultOrderColumns(361).symbol).toBeUndefined()
  })
})

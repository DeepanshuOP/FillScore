import { describe, it, expect } from 'vitest'
import { defaultOrderColumns } from './ordersTable'

// The Orders ledger's default columns (design v5, PROPOSAL §3.3), changed deliberately from IA v4: the measure that matters, the
// order's cost in dollars and in bps, is a default column on every width (it was one menu away on a desktop). The order id, fills,
// quantity and maker share stay one menu away. Below 640 px the page draws row cards, so no width hides a column any more.
// False = hidden; a column absent from the state shows.
describe('defaultOrderColumns', () => {
  it('a desktop (1440 px): the cost columns show; the order id, fills, quantity and maker share are hidden', () => {
    const v = defaultOrderColumns(1440)
    expect(v).toEqual({ orderId: false, fills: false, quantity: false, makerShare: false })
    expect(v.cost).toBeUndefined()
    expect(v.costBps).toBeUndefined()
  })
  it('every width has the same state (phones read row cards)', () => {
    for (const w of [320, 360, 390, 640, 1024, 1920]) expect(defaultOrderColumns(w)).toEqual(defaultOrderColumns(1440))
  })
})

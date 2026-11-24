import { describe, expect, it } from 'vitest'
import { bps, count, money, qty, share, tableTime, textTime } from './format'

// Design v5 number styles (PROPOSAL §2). Hand values; "−" is U+2212 (a true minus).
describe('v5 number formats', () => {
  it('money: two decimals, thousands comma, true minus, never -0.00', () => {
    expect(money(52.0785604695634)).toBe('$52.08')
    expect(money(41976.3020666491)).toBe('$41,976.30')
    expect(money(-0.5292776070489739)).toBe('−$0.53')
    // -0.004 rounds to 0.00: printed without a sign, and as "<$0.01" because it is not exactly zero
    expect(money(-0.004)).toBe('<$0.01')
    expect(money(0.004)).toBe('<$0.01')
    expect(money(0)).toBe('$0.00')
    expect(money(null)).toBeNull()
  })
  it('bps: one decimal and the unit, true minus, never -0.0', () => {
    expect(bps(11.726294159111706)).toBe('11.7 bps')
    expect(bps(-0.11917504739237726)).toBe('−0.1 bps')
    expect(bps(-0.0011748671013551164)).toBe('0.0 bps')   // rounds to zero: no sign
    expect(bps(9.998823256827583)).toBe('10.0 bps')
    expect(bps(undefined)).toBeNull()
  })
  it('never prints "-0.00" or "-0.0" for any value that rounds to zero (design v5 step 2)', () => {
    for (const v of [-0.004, -0.00001, -1e-9, -0.0049999, -0, -0.04, -0.049]) {
      expect(money(v), `money ${v}`).not.toMatch(/[-−]\$?0\.00/)
      expect(bps(v), `bps ${v}`).not.toMatch(/[-−]0\.0 /)
    }
    expect(bps(-0.004)).toBe('0.0 bps')
    expect(bps(-0.04)).toBe('0.0 bps')
    expect(bps(-0.05)).toBe('−0.1 bps')   // -0.05 rounds half away in toFixed(1) to -0.1 (binary 0.05 is above the half): a real minus
    expect(money(-0.004)).toBe('<$0.01')
    expect(money(-0.0)).toBe('$0.00')
  })
  it('counts name what they count; shares are whole percent, one decimal under 10%', () => {
    expect(count(245, 'order')).toBe('245 orders')
    expect(count(1, 'order')).toBe('1 order')
    expect(count(1607, 'fill')).toBe('1,607 fills')
    expect(share(0.7380560131795717)).toBe('74%')
    expect(share(0.0451)).toBe('4.5%')
  })
  it('quantities: at most 8 decimals, trailing zeros dropped', () => {
    expect(qty(0.00521521721923772)).toBe('0.00521522')
    expect(qty(0.00021)).toBe('0.00021')
    expect(qty(12)).toBe('12')
  })
  it('times: text form and table form, both UTC', () => {
    expect(textTime('2024-01-31T14:25:30.214Z')).toBe('Jan 31, 2024, 14:25 UTC')
    expect(tableTime('2024-01-31T14:25:30.214Z')).toBe('2024-01-31 14:25:30')
  })
})

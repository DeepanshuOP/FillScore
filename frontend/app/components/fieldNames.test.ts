import { describe, expect, it } from 'vitest'
import { plainFieldName } from './fieldNames'

// Design v3.1 Part B: a field path is never the visible name. Hand cases: split on "." and "_", lower case, the first
// group before a colon, the first letter capitalised.
describe('plainFieldName', () => {
  it('names a snake-case path in words', () => {
    expect(plainFieldName('liquidity.clean_market_count')).toBe('Liquidity: clean market count')
    // "opportunity" is the stored name of the unfilled-order cost; the screens never print it
    expect(plainFieldName('alpha.median_opportunity_bps_unfilled')).toBe('Alpha: median unfilled-order cost bps unfilled')
  })
  it('splits camel case and drops a trailing bps unit word', () => {
    expect(plainFieldName('shortfall.feesBps')).toBe('Shortfall: fees')
    expect(plainFieldName('shortfall.totalBps')).toBe('Shortfall: total')
  })
  it('a path with one part is just that part; an empty path stays', () => {
    expect(plainFieldName('trade_count')).toBe('Trade count')
    expect(plainFieldName('')).toBe('')
  })
})

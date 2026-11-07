import { describe, it, expect } from 'vitest'
import { skippedNotice } from './skipped'

describe('skipped trades notice (4R-0b D)', () => {
  it('renders count and reasons', () => {
    expect(skippedNotice({ count: 1, reasons: { invalid_spreadBps: 1 } })).toBe("1 trade couldn't be scored (invalid_spreadBps: 1)")
    expect(skippedNotice({ count: 3, reasons: { invalid_spreadBps: 2, missing_market_data: 1 } }))
      .toBe("3 trades couldn't be scored (invalid_spreadBps: 2, missing_market_data: 1)")
  })
  it('renders nothing for 0, and nothing for an audit stored without the field (unknown, not 0)', () => {
    expect(skippedNotice({ count: 0, reasons: {} })).toBeNull()
    expect(skippedNotice(undefined)).toBeNull()
  })
})

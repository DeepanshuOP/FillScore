/** Hand values for the lab's number formatting. Money is never coloured and never rounded to a false zero. */
import { describe, expect, it } from 'vitest'
import { formatMoney, formatScore, formatSignedBps } from './format'

describe('formatMoney', () => {
  it('two decimals from one dollar', () => {
    expect(formatMoney(52.0791)).toBe('$52.08')   // 52.0791 -> 52.08
    expect(formatMoney(1)).toBe('$1.00')
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })
  it('three decimals under one dollar, so a small real cost is not rounded away', () => {
    expect(formatMoney(0.007739437838871307)).toBe('$0.008')   // the spread of the hero order
    expect(formatMoney(0.023218313516631513)).toBe('$0.023')
    expect(formatMoney(0.0717)).toBe('$0.072')
    expect(formatMoney(-0.1342)).toBe('-$0.134')
  })
  it('a real value below $0.0005 is not shown as zero', () => {
    expect(formatMoney(0.0003)).toBe('<$0.001')
    expect(formatMoney(-0.0003)).toBe('>-$0.001')
    expect(formatMoney(0)).toBe('$0.00')
  })
  it('a value that is not a finite number is not computed, never zero', () => {
    expect(formatMoney(null)).toBe('not computed')
    expect(formatMoney(Number.NaN)).toBe('not computed')
  })
})

describe('formatScore', () => {
  it('one decimal, rounded half away like toFixed', () => {
    expect(formatScore(93.40556873724222)).toBe('93.4')
    expect(formatScore(84.80888516669383)).toBe('84.8')
    expect(formatScore(60.67469266790485)).toBe('60.7')
  })
})

describe('formatSignedBps', () => {
  it('uses a real minus sign and never "-0.0"', () => {
    expect(formatSignedBps(-0.2053004272161476)).toBe('−0.21 bps')
    expect(formatSignedBps(0.1104242840781983)).toBe('0.11 bps')
    expect(formatSignedBps(0)).toBe('0.0 bps')
    expect(formatSignedBps(-0.004)).toBe('>−0.01 bps')
    expect(formatSignedBps(4.7885075818029454)).toBe('4.8 bps')
  })
})

/**
 * Hand values for the number formatting of every rebuilt screen. Money is never coloured and never rounded to a false zero.
 *
 * The rule of formatUsd (M8 part 1, 2026-11-20, replacing the lab's formatMoney): two decimals everywhere, with
 * thousands separators; a negative value takes a true minus sign (U+2212); a value that is not zero but would read
 * "$0.00" reads "<$0.01" (or "−$0.00" if negative, design v3 fixes A3); a value that is not a finite number reads "not computed", never zero.
 */
import { describe, expect, it } from 'vitest'
import { exactTitle, formatScore, formatSignedBps, formatUsd } from './format'

describe('formatUsd', () => {
  it('two decimals at one dollar and above', () => {
    expect(formatUsd(52.0791)).toBe('$52.08')   // 52.0791 -> 52.08
    expect(formatUsd(1)).toBe('$1.00')
    expect(formatUsd(1234.5)).toBe('$1,234.50')
    expect(formatUsd(1234567.891)).toBe('$1,234,567.89')
  })
  it('two decimals below one dollar too, the same everywhere', () => {
    expect(formatUsd(0.0717)).toBe('$0.07')     // the hero order's total
    expect(formatUsd(0.5)).toBe('$0.50')
    expect(formatUsd(0.0123)).toBe('$0.01')
    expect(formatUsd(0.005)).toBe('$0.01')      // 0.005 rounds to 0.01 at two decimals, so it is not "below a cent" by display
  })
  it('a real non-zero value that would read $0.00 reads below a cent', () => {
    expect(formatUsd(0.004)).toBe('<$0.01')
    expect(formatUsd(0.007739437838871307)).toBe('$0.01')   // 0.0077 rounds to 0.01
    expect(formatUsd(0.0003)).toBe('<$0.01')
    expect(formatUsd(-0.004)).toBe('−$0.00')     // design v3 fixes A3: a tiny negative reads −$0.00; the exact value goes in the title
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(-0)).toBe('$0.00')
  })
  it('a negative value has a true minus sign', () => {
    expect(formatUsd(-1.5)).toBe('−$1.50')
    expect(formatUsd(-0.1342)).toBe('−$0.13')
    expect(formatUsd(-1234.5)).toBe('−$1,234.50')
  })
  it('a value that is not a finite number is not computed, never zero', () => {
    expect(formatUsd(null)).toBe('not computed')
    expect(formatUsd(undefined)).toBe('not computed')
    expect(formatUsd(Number.NaN)).toBe('not computed')
    expect(formatUsd(Infinity)).toBe('not computed')
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
    expect(formatSignedBps(-0.004)).toBe('−0.00 bps')   // A3: tiny negative
    expect(formatSignedBps(0.004)).toBe('<0.01 bps')    // A3: tiny positive keeps "<0.01"
    expect(formatSignedBps(4.7885075818029454)).toBe('4.8 bps')
    expect(formatSignedBps(-12.34)).toBe('−12.3 bps')
  })
})

describe('exactTitle (design v3 fixes A3: the exact value of a figure below display precision)', () => {
  it('is null for a figure the display shows in full, and for zero or a missing value', () => {
    expect(exactTitle(12.34, 'bps')).toBeNull()
    expect(exactTitle(0.01, 'usd')).toBeNull()       // reads $0.01
    expect(exactTitle(0.005, 'usd')).toBeNull()      // rounds to $0.01 at two decimals
    expect(exactTitle(0, 'bps')).toBeNull()
    expect(exactTitle(null, 'usd')).toBeNull()
  })
  it('gives the value to four significant figures with its unit and a true minus sign', () => {
    expect(exactTitle(-0.004, 'bps')).toBe('Exactly −0.004000 bps')
    expect(exactTitle(0.0006, 'bps')).toBe('Exactly 0.0006000 bps')
    expect(exactTitle(-0.0042137, 'usd')).toBe('Exactly −$0.004214')
    expect(exactTitle(0.0003, 'usd')).toBe('Exactly $0.0003000')
  })
  it('below one millionth it says so in words, never in exponent form', () => {
    expect(exactTitle(-1.11e-15, 'bps')).toBe('A negative value smaller than 0.000001 bps')
    expect(exactTitle(1e-7, 'usd')).toBe('A positive value smaller than $0.000001')
  })
})

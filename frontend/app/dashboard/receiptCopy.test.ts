import { describe, expect, it } from 'vitest'
import { BARS_NOTE, CHART_NOTE, NO_COST_TERMS, NO_FILLS, expectedLine } from './receiptCopy'

// Design v3 fixes A5 (2026-11-21): on the receipt, explanatory sentences are in sentence case; only the printed labels
// (ORDER, MARKET, FILLS, COSTS, TOTAL, SOURCE) are uppercase. Figures come from the replay API through formatSignedBps.
describe('receipt sentences', () => {
  it('expected cost, modelled: past tense, sentence case, the range when the API sent one', () => {
    expect(expectedLine({ expectedBps: 3.21, lowBps: 1.04, highBps: 5.5, level: 0.9, reason: null }))
      .toBe('Orders like it were modelled to cost 3.2 bps (90% range 1.0 bps to 5.5 bps).')
    expect(expectedLine({ expectedBps: -0.5, lowBps: null, highBps: null, level: 0.9, reason: null }))
      .toBe('Orders like it were modelled to cost −0.50 bps.')
  })
  it('expected cost, insufficient data: the stored reason verbatim, or says none was stored', () => {
    expect(expectedLine({ expectedBps: null, lowBps: null, highBps: null, level: 0.9, reason: 'limit order: no expected cost model' }))
      .toBe('Expected cost: insufficient data (limit order: no expected cost model).')
    expect(expectedLine({ expectedBps: null, lowBps: null, highBps: null, level: 0.9, reason: null }))
      .toBe('Expected cost: insufficient data (no reason was stored).')
  })
  it('the fixed sentences are sentence case, not printed labels', () => {
    for (const s of [BARS_NOTE, CHART_NOTE, NO_COST_TERMS, NO_FILLS]) {
      expect(s.charAt(0)).toBe(s.charAt(0).toUpperCase())
      expect(s).not.toMatch(/\b(?!SHA)[A-Z]{4,}\b/)   // no word in capitals (SHA-256 is a name)
    }
    expect(BARS_NOTE).toBe('SHA-256 of the order record. The bars draw it; they are not a scannable code.')
    expect(CHART_NOTE).toBe('Fills only; the public prints are in the source file.')
  })
})

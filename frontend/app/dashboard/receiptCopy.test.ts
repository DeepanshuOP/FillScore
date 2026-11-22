import { describe, expect, it } from 'vitest'
import { BARS_NOTE, CHART_NOTE, NO_COST_TERMS, NO_FILLS, PRINTS_LEGEND, expectedLine, unfilledLineNote } from './receiptCopy'

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
  it('the unfilled line note says the market moved away and that no money left the account (F2)', () => {
    const n = unfilledLineNote(3.3102)!
    expect(n).toBe('Unfilled orders, $3.31: the market moved away from the part that never filled. No money left the account for it.')
    expect(n).not.toMatch(/paid/i)
    expect(unfilledLineNote(0)).toBeNull()      // nothing to explain
    expect(unfilledLineNote(null)).toBeNull()   // not computed: no note, never a made-up figure
  })
  it('the fixed sentences are sentence case, not printed labels', () => {
    for (const s of [BARS_NOTE, CHART_NOTE, NO_COST_TERMS, NO_FILLS, PRINTS_LEGEND]) {
      expect(s.charAt(0)).toBe(s.charAt(0).toUpperCase())
      expect(s).not.toMatch(/\b(?!SHA)[A-Z]{4,}\b/)   // no word in capitals (SHA-256 is a name)
    }
    expect(BARS_NOTE).toBe('SHA-256 of the order record. The bars draw it; they are not a scannable code.')
    expect(CHART_NOTE).toBe('Fills only; the public prints are in the source file.')
    expect(PRINTS_LEGEND).toMatch(/^A filled tick up is a buyer-initiated public print/)
    expect(PRINTS_LEGEND).not.toMatch(/\b(because|due to|caused|should|could save|route)\b/i)   // past-tense findings only
  })
})

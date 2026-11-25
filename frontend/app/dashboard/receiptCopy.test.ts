import { describe, expect, it } from 'vitest'
import { BARS_NOTE, CHART_NOTE, FEE_LINE, NO_COST_TERMS, NO_FILLS, PRINTS_LEGEND, costLineLabel, costTermsState, expectedLine, unfilledLineNote } from './receiptCopy'

// Design v5, PROPOSAL §4 row 9: a receipt with no cost terms says which of two things it is. An order with no stored measurement is
// measured after the next sync; an order that was measured and could not be costed says the stored reason, already a plain sentence.
// The receipt keeps NOT COMPUTED on its total line either way (DESIGN §2.8).
describe('costTermsState', () => {
  it('no stored measurement: "measured after the next sync"', () => {
    expect(costTermsState(['Insufficient data: this order has no stored measurement.'])).toBe('Not measured yet: the next sync measures this order.')
  })
  it('a stored reason: the reason, as stored', () => {
    expect(costTermsState(["Not measured: no fresh print before the order's arrival time."])).toBe("Not measured: no fresh print before the order's arrival time.")
    expect(costTermsState(['Not measured: no reason was stored.'])).toBe('Not measured: no reason was stored.')
  })
  it('anything else keeps the generic line', () => {
    expect(costTermsState([])).toBe(NO_COST_TERMS)
    expect(costTermsState(['Delay cost: 1.2 bps.'])).toBe(NO_COST_TERMS)
  })
})

// Deepanshu's decision 2026-11-23: a fee line says on the line that the rate is the published one; the unfilled line says modelled.
describe('receipt cost line labels', () => {
  it('fees read "Fees (published rate)", unfilled "Unfilled orders (modelled)", the rest as the server named them', () => {
    expect(costLineLabel({ key: 'fees', label: 'Fees' })).toBe(FEE_LINE)
    expect(FEE_LINE).toBe('Fees (published rate)')
    expect(costLineLabel({ key: 'unfilled', label: 'Unfilled orders' })).toBe('Unfilled orders (modelled)')
    expect(costLineLabel({ key: 'spread', label: 'Spread' })).toBe('Spread')
    expect(costLineLabel({ label: 'Fees' })).toBe('Fees (published rate)')   // an API row without a key is still the fee line by its label
  })
})

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
      .toBe('Cost estimate: insufficient data (limit order: no expected cost model).')   // design v5 words: "Against the cost estimate"
    expect(expectedLine({ expectedBps: null, lowBps: null, highBps: null, level: 0.9, reason: null }))
      .toBe('Cost estimate: insufficient data (no reason was stored).')
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
    // design v5 words (PROPOSAL §1): public trades, not prints or a tape
    expect(CHART_NOTE).toBe('Fills only; the public trades are in the source file.')
    expect(PRINTS_LEGEND).toMatch(/^The triangles are buyer-initiated public trades/)
    expect(PRINTS_LEGEND).not.toMatch(/\b(because|due to|caused|should|could save|route)\b/i)   // past-tense findings only
  })
})

import { describe, expect, it } from 'vitest'
import { FILLS_TITLE, fillsColumns, fillsCountLine, hiddenMeasures, notComputedLine, type FillMeasures } from './fillsView'

// A2 (orders of 2026-11-23): the Fills page. A column whose every loaded row is not computed is hidden and one line says
// which measures are not computed and why. A column with any computed value keeps its per-cell states.
const none: FillMeasures = { slippageBps: null, fillScore: null, fillGrade: null }

describe('Fills wording', () => {
  it('heading and count line say fills, not executions', () => {
    expect(FILLS_TITLE).toBe('Fills')
    expect(fillsCountLine(721, 'Binance')).toBe('721 fills on Binance')
    expect(fillsCountLine(1, 'Binance')).toBe('1 fill on Binance')
  })
})

describe('hiddenMeasures', () => {
  it('demo data: every row not computed hides slippage, score, grade and the average score tile', () => {
    expect(hiddenMeasures([none, none, none])).toEqual({ slippage: true, score: true, grade: true })
  })
  it('one computed value keeps its column (hand case: 1 of 3 rows has a score 80, slippage 1.5, grade B)', () => {
    const one: FillMeasures = { slippageBps: 1.5, fillScore: 80, fillGrade: 'B' }
    expect(hiddenMeasures([none, one, none])).toEqual({ slippage: false, score: false, grade: false })
  })
  it('each column is judged alone (slippage computed, score and grade not; a stored 0 is a measurement)', () => {
    expect(hiddenMeasures([{ ...none, slippageBps: 0 }, none])).toEqual({ slippage: false, score: true, grade: true })
  })
  it('nothing loaded says nothing: no column is hidden for an empty list', () => {
    expect(hiddenMeasures([])).toEqual({ slippage: false, score: false, grade: false })
  })
})

describe('notComputedLine', () => {
  const all = { slippage: true, score: true, grade: true }
  // design v5 (D8 class (a), PROPOSAL §4 row 1), changed deliberately: an account without v1 per-fill measures (v1Computed false,
  // audit.ts:139-142) gets no sentence; the columns are not drawn. The intent, never a zero standing in for a missing value, is kept.
  it('v1Computed false: no sentence at all (the columns are left out instead)', () => {
    expect(notComputedLine(all, false)).toBeNull()
  })
  it('names the measures when the account does carry v1 fields but no loaded fill has a value', () => {
    expect(notComputedLine(all, true)).toBe('Not computed for this data: slippage, score, grade and the average score. No loaded fill carries a value for them.')
  })
  it('a single hidden measure is named alone; the average score goes with the score only', () => {
    expect(notComputedLine({ slippage: false, score: false, grade: true }, true))
      .toBe('Not computed for this data: grade. No loaded fill carries a value for it.')
    expect(notComputedLine({ slippage: true, score: true, grade: false }, true))
      .toBe('Not computed for this data: slippage, score and the average score. No loaded fill carries a value for them.')
  })
  it('nothing hidden: no line', () => {
    expect(notComputedLine({ slippage: false, score: false, grade: false }, false)).toBeNull()
  })
})

describe('fillsColumns', () => {
  it('full table: time in UTC, symbol in full, the measure columns in their places', () => {
    expect(fillsColumns({ slippage: false, score: false, grade: false })).toEqual(
      ['No.', 'Time (UTC)', 'Symbol', 'Venue', 'Side', 'Notional', 'Price', 'Fee', 'Slippage', 'Order', 'Score', 'Grade'])
  })
  it('demo data: the three measure columns are gone', () => {
    expect(fillsColumns({ slippage: true, score: true, grade: true }))
      .toEqual(['No.', 'Time (UTC)', 'Symbol', 'Venue', 'Side', 'Notional', 'Price', 'Fee', 'Order'])
  })
})

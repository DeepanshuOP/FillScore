/**
 * The Fills page's view rules (orders of 2026-11-23, A2). Pure, so the rules are tested without a browser.
 *
 * A column whose every loaded row is not computed is hidden, and one line under the count says which measures are not
 * computed and why. A column with any computed value stays, and its empty cells keep their ValueState.
 */
export const FILLS_TITLE = 'Fills'

export interface FillMeasures { slippageBps: number | null; fillScore: number | null; fillGrade: string | null }
export interface HiddenMeasures { slippage: boolean; score: boolean; grade: boolean }

export function fillsCountLine(total: number, venue: string): string {
  return `${total} ${total === 1 ? 'fill' : 'fills'} on ${venue}`
}

/** Nothing loaded says nothing (no column is hidden): "not computed" is a finding about rows, and there are none. */
export function hiddenMeasures(rows: readonly FillMeasures[]): HiddenMeasures {
  if (rows.length === 0) return { slippage: false, score: false, grade: false }
  return {
    slippage: rows.every((r) => r.slippageBps == null),
    score: rows.every((r) => r.fillScore == null),
    grade: rows.every((r) => !r.fillGrade),
  }
}

/**
 * Why a measure is not computed, from the code that decides it. `v1Computed` is the trades route's flag
 * (`backend/src/routes/audit.ts:139-142`, `v1Flag` at `:146`): false for a demo account none of whose trades carries a v1
 * score, because the v1 enrichment "needed invented arrival prices" (comment at `:139-141`) and none were invented.
 * Otherwise no loaded fill simply carries a value.
 */
export function notComputedLine(hidden: HiddenMeasures, v1Computed: boolean | undefined): string | null {
  // design v5, D8 class (a) (PROPOSAL §4 row 1): an account whose trades never carried the v1 per-fill measures does not get a
  // "not computed" sentence: the columns are simply not drawn. The per-fill v1 score is frozen with v1 and was never stored for it.
  if (v1Computed === false) return null
  const names: string[] = []
  if (hidden.slippage) names.push('slippage')
  if (hidden.score) names.push('score')
  if (hidden.grade) names.push('grade')
  if (hidden.score) names.push('the average score')   // the tile that averages the score goes with it
  if (names.length === 0) return null
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  const why = `No loaded fill carries a value for ${names.length === 1 ? 'it' : 'them'}.`
  return `Not computed for this data: ${list}. ${why}`
}

/** The ledger's column labels in order, with the all-not-computed measure columns left out. */
export function fillsColumns(hidden: HiddenMeasures): string[] {
  return [
    'No.', 'Time (UTC)', 'Symbol', 'Venue', 'Side', 'Notional', 'Price', 'Fee',
    ...(hidden.slippage ? [] : ['Slippage']), 'Order', ...(hidden.score ? [] : ['Score']), ...(hidden.grade ? [] : ['Grade']),
  ]
}

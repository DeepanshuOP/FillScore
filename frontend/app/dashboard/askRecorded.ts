/**
 * Recorded answers of the Ask agent on a demo account (sixth order of 2026-11-23, step 3). A demo account runs no model on
 * request, so Home plays answers recorded from the real agent (ml-service/scripts/record_ask_fixture.py), verbatim and labelled.
 * Pure: the view of each answer is the production `describeAsk`, so a recorded answer reads like a live one.
 */
import { describeAsk, type AskApi, type AskView } from './askView'

export interface RecordedDoc {
  recorded: boolean
  label: string
  recordedAt: string
  account: string
  runs: Array<{ question: string; result: AskApi; models: string[]; recordedAt?: string }>
}

export interface RecordedAnswer {
  question: string
  view: AskView
  /** Who wrote what: the model's name only for an answer that passed; a code-built answer credits no model. */
  credit: string
  /** YYYY-MM-DD. */
  recordedOn: string
}

/** The chips' order: answers that passed first, a degraded one last, each group in the order it was recorded. */
export function recordedAnswers(doc: RecordedDoc): RecordedAnswer[] {
  return doc.runs
    .map((r, i) => ({ r, i }))
    .sort((a, b) => Number(a.r.result.degraded) - Number(b.r.result.degraded) || a.i - b.i)
    .map(({ r }) => {
      const view = describeAsk(200, r.result)
      const recordedOn = (r.recordedAt ?? doc.recordedAt).slice(0, 10)
      const models = [...new Set(r.models)].join(', ')
      const credit = models && view.byModel ? `Answered by ${models}, recorded ${recordedOn}.`
        : models && view.byClaims ? `Claims chosen by ${models}, recorded ${recordedOn}.` : `Recorded ${recordedOn}.`
      return { question: r.question, view, recordedOn, credit }
    })
}

/** The line of scope printed on every slip, placed by code: the period and the number of orders. */
export function scopeLine(periodLabel: string, orders: number): string {
  return `${periodLabel}, ${orders.toLocaleString('en-US')} order${orders === 1 ? '' : 's'}`
}

/**
 * Data of the IA v4 prototype (design lab only). Every figure is read by code from committed fixtures, never typed in:
 *  - e2e-shots/fixtures/demo-*.json: the API answers cut from the offline demo build (e2e-shots/cut-fixtures.ts);
 *  - fixtures/ask-recorded.json: the real Ask agent's answers on demo-moderate, recorded by
 *    ml-service/scripts/record_ask_fixture.py and never edited.
 * The production model functions build the views (describeHeadline, totalSentence, describeStrip, describeAsk), so the lab shows
 * what production would show for the same answers. Server-side only: the fixtures are not sent to the browser.
 */
import moderate from '../../../e2e-shots/fixtures/demo-moderate.json'
import disciplined from '../../../e2e-shots/fixtures/demo-disciplined.json'
import aggressive from '../../../e2e-shots/fixtures/demo-aggressive.json'
import recorded from './fixtures/ask-recorded.json'
import { describeHeadline, totalSentence, type Headline } from '../../dashboard/headline'
import { describeStrip, type StripView } from '../../dashboard/costStrip'
import { describeAsk, type AskApi, type AskView } from '../../dashboard/askView'
import { formatScore, formatUsd } from '../../ui/format'
import { monthLabel } from '../../utils/periodLabel'
import { DEMO_PROFILES } from '../../utils/demoProfiles'

type Fixture = { ordersBody: unknown; v2Body: { scoringVersion: string; result: { grade?: string; composite?: number; band?: [number, number] } }; current: { orders: number; fills: number } }
const FIXTURES: Record<string, Fixture> = {
  'demo-moderate': moderate as unknown as Fixture,
  'demo-disciplined': disciplined as unknown as Fixture,
  'demo-aggressive': aggressive as unknown as Fixture,
}

/** The demo build's period (real January 2024 prints; docs/HANDOFF.md "Demo data"), as the API serves it to the e2e mock. */
export const DEMO_PERIOD = { start: '2024-01-01T00:00:00.000Z', end: '2024-02-01T00:00:00.000Z' }
export const PROVENANCE = 'Synthetic trader, real prices'

export interface KeyFigures {
  headline: Headline | null
  totalText: string | null
  totalSentence: string | null
  grade: { letter: string; score: number; scoreText: string; bandText: string | null; version: string } | null
  strip: StripView | null
  periodLabel: string
  provenance: string
}

export function keyFigures(id: string): KeyFigures {
  const f = FIXTURES[id]
  const headline = describeHeadline(f.ordersBody, true)
  const r = f.v2Body.result
  const grade = r.grade && typeof r.composite === 'number'
    ? { letter: r.grade, score: r.composite, scoreText: formatScore(r.composite), version: f.v2Body.scoringVersion,
        bandText: r.band ? `${formatScore(r.band[0])} to ${formatScore(r.band[1])}` : null }
    : null
  return {
    headline,
    totalText: headline ? formatUsd(headline.totalUsd) : null,
    totalSentence: headline ? totalSentence(headline) : null,
    grade,
    strip: describeStrip(f.ordersBody, !!headline?.feesNotMeasured),
    periodLabel: monthLabel(DEMO_PERIOD.start, DEMO_PERIOD.end),
    provenance: PROVENANCE,
  }
}

export interface DemoTrader { id: string; name: string; tagline: string; orders: number; fills: number }

export function demoTraders(): DemoTrader[] {
  return DEMO_PROFILES.map((p) => ({ id: p.id, name: p.archetype, tagline: p.tagline, orders: FIXTURES[p.id].current.orders, fills: FIXTURES[p.id].current.fills }))
}

export interface RecordedRun { question: string; view: AskView; models: string[] }
export interface Recorded { recorded: boolean; label: string; recordedAt: string; account: string; runs: RecordedRun[] }

export function recordedAsk(): Recorded {
  const doc = recorded as unknown as { recorded: boolean; label: string; recordedAt: string; account: string; runs: Array<{ question: string; result: AskApi; models: string[] }> }
  return {
    recorded: doc.recorded, label: doc.label, recordedAt: doc.recordedAt, account: doc.account,
    runs: doc.runs.map((x) => ({ question: x.question, models: x.models, view: describeAsk(200, x.result) })),
  }
}

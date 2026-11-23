import { describe, it, expect } from 'vitest'
import { recordedAnswers, scopeLine, type RecordedDoc } from './askRecorded'

// Recorded answers of the Ask agent on a demo account (sixth order, step 3). The chips list the answers that passed first and a
// degraded one last, each in the order it was recorded. Hand-built three-run document: costs (passed), costliest (degraded),
// score (passed) -> the chips read costs, score, costliest.
const run = (question: string, degraded: boolean, over: Record<string, unknown> = {}) => ({
  question, models: ['groq/qwen/qwen3.8-27b', 'groq/qwen/qwen3.8-27b'],
  result: { answer: `answer to ${question}`, tools_used: ['costs'], n_calls: 2, degraded, fallback: degraded ? 'the answer looked forward' : null, values: [] },
  ...over,
})
const doc: RecordedDoc = {
  recorded: true, label: 'Recorded answers', recordedAt: '2026-11-22T17:00:00+00:00', account: 'demo-moderate',
  runs: [run('costliest?', true, { recordedAt: '2026-11-22T20:42:02+00:00' }), run('costs?', false), run('score?', false)],
}

describe('recordedAnswers', () => {
  it('lists the answers that passed first and the degraded one last, keeping the recorded order inside each group', () => {
    expect(recordedAnswers(doc).map((a) => a.question)).toEqual(['costs?', 'score?', 'costliest?'])
  })
  it('a degraded answer is code-built: no model credit, the one-line note, the meta line; a passed one is by the model', () => {
    const [costs, , costliest] = recordedAnswers(doc)
    expect(costs.view.byModel).toBe(true)
    expect(costs.credit).toBe('Answered by groq/qwen/qwen3.8-27b, recorded 2026-11-22.')
    expect(costliest.view.byModel).toBe(false)
    expect(costliest.view.note).toBe("The model's answer did not pass the checks, so code wrote this sentence from the measured values.")
    expect(costliest.view.meta).toBe('Model calls: 2 · answer not used')
    expect(costliest.credit).toBe('Recorded 2026-11-22.')
    expect(costliest.credit).not.toContain('groq')
  })
  it('a claims answer credits the model for choosing the claims, not for the sentence', () => {
    const d: RecordedDoc = { ...doc, runs: [run('costs?', false, { result: { answer: 'The measured orders cost $16.00 in total.', tools_used: ['costs'], n_calls: 2, degraded: false, fallback: null, values: [], answer_kind: 'claims' } })] }
    const [a] = recordedAnswers(d)
    expect(a.view.byModel).toBe(false)
    expect(a.credit).toBe('Claims chosen by groq/qwen/qwen3.8-27b, recorded 2026-11-22.')
  })
  it('a run carries its own recording date when it has one (a re-recorded question), else the document date', () => {
    const [costs, , costliest] = recordedAnswers(doc)
    expect(costs.recordedOn).toBe('2026-11-22')
    expect(costliest.recordedOn).toBe('2026-11-22')
    const d2: RecordedDoc = { ...doc, runs: [run('a?', false, { recordedAt: '2026-12-01T01:00:00+00:00' })] }
    expect(recordedAnswers(d2)[0].recordedOn).toBe('2026-12-01')
  })
})

describe('scopeLine', () => {
  it('the period and the order count, placed by code', () => {
    expect(scopeLine('January 2024', 245)).toBe('January 2024, 245 orders')
    expect(scopeLine('January 2024', 1)).toBe('January 2024, 1 order')
    expect(scopeLine('January 2024', 1234)).toBe('January 2024, 1,234 orders')
  })
})

import { describe, expect, it } from 'vitest'
import { demoTraders, keyFigures, recordedAsk, DEMO_PERIOD } from './data'

/**
 * IA v4 prototype data (fifth order of 2026-11-22, step 3). Every figure is read from committed fixtures by code:
 * e2e-shots/fixtures/demo-*.json (cut from the offline demo build) and fixtures/ask-recorded.json (the real Ask agent's
 * recorded output). Hand values below are from docs/STATUS.md ("Current v2 demo grades") and the fixture.
 */
describe('key figures of demo-moderate', () => {
  const k = keyFigures('demo-moderate')

  it('the total: 245 orders, $52.0785604695634 printed $52.08 (cents)', () => {
    expect(k.headline?.orders).toBe(245)
    expect(k.headline?.totalUsd).toBeCloseTo(52.0785604695634, 10)
    expect(k.totalText).toBe('$52.08')
  })

  it('the grade: v2.3.0, A, 93.40556873724222 printed 93.4, band 92.5 to 94.1', () => {
    expect(k.grade).toMatchObject({ letter: 'A', version: 'v2.3.0' })
    expect(k.grade?.score).toBeCloseTo(93.40556873724222, 10)
    expect(k.grade?.scoreText).toBe('93.4')
    expect(k.grade?.bandText).toBe('92.5 to 94.1')
  })

  it('the strip: fees 0.7979 and unfilled orders 0.2021 of the width; the server shares, not recomputed', () => {
    const byKey = Object.fromEntries((k.strip?.parts ?? []).map((p) => [p.key, p]))
    // server shares 0.7979096575973992 and 0.20209034240260085; describeStrip prints width to 3 decimals:
    // 79.79096575973992 -> 79.791, 20.209034240260085 -> 20.209
    expect(byKey.fees.width).toBe('79.791%')
    expect(byKey.missed.width).toBe('20.209%')
  })

  it('the period is January 2024 (the demo build), the provenance is synthetic', () => {
    expect(DEMO_PERIOD).toEqual({ start: '2024-01-01T00:00:00.000Z', end: '2024-02-01T00:00:00.000Z' })
    expect(k.periodLabel).toBe('January 2024')
    expect(k.provenance).toBe('Synthetic trader, real prices')
  })
})

describe('demo traders for the demo entry', () => {
  it('orders and fills per trader, from the fixtures: 144/385, 245/607, 311/721 (docs/STATUS.md)', () => {
    expect(demoTraders().map((t) => [t.id, t.orders, t.fills])).toEqual([
      ['demo-disciplined', 144, 385],
      ['demo-moderate', 245, 607],
      ['demo-aggressive', 311, 721],
    ])
  })
})

describe('recorded Ask answers', () => {
  const r = recordedAsk()

  it('is labelled as recorded, four questions, two model calls each', () => {
    expect(r.recorded).toBe(true)
    expect(r.label).toMatch(/^Recorded answers of the Ask agent on demo data/)
    expect(r.runs).toHaveLength(4)
    expect(r.runs.every((x) => x.view.meta?.endsWith('Used 2 model calls.'))).toBe(true)
  })

  it("the recorded total equals the fixture's total ($52.08): the answer and the figures come from the same data", () => {
    const total = r.runs.find((x) => x.question === 'What did my orders cost in total?')!
    expect(total.view.answer).toContain(keyFigures('demo-moderate').totalText)
  })

  it('a degraded run carries the code-built note', () => {
    const costliest = r.runs.find((x) => x.question === 'Which orders cost the most?')!
    expect(costliest.view.note).toBe("Written by code from the measured values, because the model's answer was empty after the checks.")
  })
})

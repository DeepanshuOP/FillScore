import { describe, it, expect } from 'vitest'
import { buildComponentCards, cardVisual, NO_SCORES_TOOLTIP } from './componentCards'

const base = { avgSlippageBps: 2.5, makerRatio: 0.4, bestHour: 10 }

describe('dashboard component cards', () => {
  it('render the engine componentMeans', () => {
    const cards = buildComponentCards({ ...base, componentMeans: { slippage: 50, fees: 100, timing: 70, spread: 88 } })
    expect(cards.map(c => c.score)).toEqual(['50', '100', '70', '88'])
  })
  it('SPREAD card never shows fee drag and nothing says "Exchange spread cost"', () => {
    const cards = buildComponentCards({ ...base, avgFeeDragBps: 10, componentMeans: { slippage: 50, fees: 100, timing: 70, spread: 88 } } as any)
    const spread = cards.find(c => c.key === 'exchange')!
    expect(spread.value).not.toMatch(/drag|bps/i)
    expect(JSON.stringify(cards)).not.toContain('Exchange spread cost')
    expect(JSON.stringify(cards)).not.toContain('avgFeeDragBps')
  })
  it('a null component has no bar and no worst-case colour; a real 0 still does', () => {
    const [slip, fees] = buildComponentCards({ ...base, componentMeans: { slippage: null, fees: 0, timing: 70, spread: 88 } })
    expect(cardVisual(slip)).toEqual({ hasBar: false, barPct: 0, colorScore: null })
    expect(cardVisual(fees)).toEqual({ hasBar: true, barPct: 0, colorScore: 0 })
  })
  it('missing componentMeans shows "—" with the re-run tooltip, never an invented score', () => {
    const cards = buildComponentCards({ ...base, componentMeans: null })
    for (const c of cards) { expect(c.score).toBe('—'); expect(c.tooltip).toBe(NO_SCORES_TOOLTIP) }
  })
  it('fee component is labelled "Liquidity provision"', () => {
    expect(buildComponentCards(base).find(c => c.key === 'fees')!.label.toLowerCase()).toBe('liquidity provision')
  })
})

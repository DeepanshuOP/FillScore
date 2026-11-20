import { describe, expect, it } from 'vitest'
import replay from './fixtures/landing-order.replay.json'
import { formatPct, formatSignedBps, formatUsd, heroCosts, heroEntries } from './heroData'

// The landing page states these figures in its hero and at the end of the story (DESIGN.md: no number is typed by hand).
// Expected strings, read from the replay fixture and the proposal's README: total $0.25 at 10.0 bps, and fees were
// 99.99% of the total (the spread was under a cent; impact and timing $0.00).
describe('landing hero data', () => {
  it('the tape has the 38 public prints, one arrival quote and the two fills', () => {
    const e = heroEntries()
    expect(e.filter((x) => x.kind === 'print')).toHaveLength(38)
    expect(e.filter((x) => x.kind === 'quote')).toHaveLength(1)
    expect(e.filter((x) => x.kind === 'fill')).toHaveLength(2)
    for (let i = 1; i < e.length; i++) expect(e[i].ts).toBeGreaterThanOrEqual(e[i - 1].ts)
  })
  it('the printed figures are the replay\'s, formatted by the canonical helpers', () => {
    const total = replay.decomposition.find((d) => d.key === 'total')!
    expect(heroCosts.total.usd).toBe(total.usd)
    expect(formatUsd(heroCosts.total.usd)).toBe('$0.25')
    expect(formatSignedBps(heroCosts.total.bps)).toBe('10.0 bps')
    expect(formatPct(heroCosts.feeShare)).toBe('99.99%')
  })
})

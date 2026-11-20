import { describe, expect, it } from 'vitest'
import { account, heroCosts, heroEntries, heroOrder, monthTotals, orders, termTotals } from './data'

// The lab must show the product's numbers, not new ones. The month fixture (every order through the production
// buildOrderReplay) has to add up to the totals the API serves for the same account (dashboard-mock.json).
describe('design v3 lab data', () => {
  it('has every January 2024 order of demo-moderate', () => {
    // dashboard-mock.json totals.orders = 245
    expect(orders.length).toBe(account.totals.orders)
    expect(orders.every((o) => o.order.createdAt.startsWith('2024-01'))).toBe(true)
  })

  it('adds up to the served account totals', () => {
    const all = monthTotals('all')
    // served: usd 52.0785604695634, notional 44411.780706606856, bps 11.726294159111706
    expect(all.usd).toBeCloseTo(account.totals.usd, 9)
    expect(all.notional).toBeCloseTo(account.totals.notionalUsd, 6)
    expect(all.bps as number).toBeCloseTo(account.totals.bps, 9)
  })

  it('splits by order type without losing an order', () => {
    // 84 MARKET + 161 LIMIT (150 filled, 11 canceled) = 245
    const m = monthTotals('MARKET'), l = monthTotals('LIMIT')
    expect(m.orders + l.orders).toBe(245)
    expect(m.usd + l.usd).toBeCloseTo(account.totals.usd, 9)
  })

  it('term totals match the served terms', () => {
    const t = termTotals('all')
    expect(t.fees).toBeCloseTo(account.terms.fees, 9)
    expect(t.spread).toBeCloseTo(account.terms.spread, 9)
    expect(t.impactTiming).toBeCloseTo(account.terms.impactTiming, 9)
    expect(t.unfilled).toBeCloseTo(account.terms.unfilled, 9)
  })

  it('the hero tape holds the 38 real prints, one quote and the 2 fills, in time order', () => {
    const e = heroEntries()
    expect(e.filter((x) => x.kind === 'print')).toHaveLength(38)
    expect(e.filter((x) => x.kind === 'quote')).toHaveLength(1)
    expect(e.filter((x) => x.kind === 'fill')).toHaveLength(2)
    for (let i = 1; i < e.length; i++) expect(e[i].ts).toBeGreaterThanOrEqual(e[i - 1].ts)
  })

  it('the hero receipt is the replay of the month fixture for the same order', () => {
    // replay total 0.2504630325883372 USD, 10.00119161205421 bps
    const t = heroOrder.decomposition.find((d) => d.key === 'total')!
    expect(t.usd).toBeCloseTo(heroCosts.total.usd as number, 12)
    // fees 0.25043316079566713 / total 0.2504630325883372 = 0.99988073...
    expect(heroCosts.feeShare as number).toBeCloseTo(0.99988073, 7)
  })
})

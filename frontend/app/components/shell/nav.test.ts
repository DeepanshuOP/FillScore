import { describe, expect, it } from 'vitest'
import { accountLabel, looksLikeOrderId, sectionOfPath, SECTIONS, viewHref } from './nav'

describe('viewHref', () => {
  it('a demo account carries its id; Home is /app, each section its own path', () => {
    expect(viewHref('home', 'demo-moderate', false)).toBe('/app?userId=demo-moderate')
    expect(viewHref('costs', 'demo-moderate', false)).toBe('/app/costs?userId=demo-moderate')
    expect(viewHref('orders', 'demo-moderate', false)).toBe('/app/orders?userId=demo-moderate')
  })
  it('signed in, a demo needs sample=1; the own account carries no id', () => {
    expect(viewHref('flagged', 'demo-aggressive', true)).toBe('/app/flagged?userId=demo-aggressive&sample=1')
    expect(viewHref('flagged', null, true)).toBe('/app/flagged')
    expect(viewHref('home', null, true)).toBe('/app')
  })
  it('extra parameters (an order to open, the Fills tab)', () => {
    expect(viewHref('orders', 'demo-moderate', false, { order: 'ord-moderate-BTCUSDT-968874' }))
      .toBe('/app/orders?userId=demo-moderate&order=ord-moderate-BTCUSDT-968874')
    expect(viewHref('fills', 'demo-moderate', false, { symbol: 'ETHUSDT' })).toBe('/app/fills?userId=demo-moderate&symbol=ETHUSDT')
  })
})

describe('sections, accountLabel, looksLikeOrderId', () => {
  it('nine nouns, each with a gloss and a group, in the order of the sidebar (design v5, D1 and D13)', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(['Home', 'Costs', 'Orders', 'Fills', 'Flagged orders', 'Comparisons', 'AI review', 'Reports', 'Check an exchange export'])
    expect(SECTIONS.map((s) => s.group)).toEqual(['main', 'main', 'main', 'main', 'review', 'review', 'review', 'tools', 'tools'])
    for (const s of SECTIONS) expect(s.gloss.length).toBeGreaterThan(10)
  })
  it('a pathname maps to its section', () => {
    expect(sectionOfPath('/app')).toBe('home')
    expect(sectionOfPath('/app/')).toBe('home')
    expect(sectionOfPath('/app/fills')).toBe('fills')
    expect(sectionOfPath('/app/settings')).toBeNull()
    expect(sectionOfPath('/methodology')).toBeNull()
  })
  it('labels', () => {
    expect(accountLabel('demo-disciplined')).toBe('Demo: limit orders, daytime') // A3: the name states what differs, not a quality
    expect(accountLabel(null)).toBe('Your account')
  })
  it('order ids', () => {
    expect(looksLikeOrderId('ord-moderate-BTCUSDT-968874')).toBe(true)
    expect(looksLikeOrderId('  3456789 ')).toBe(true)
    expect(looksLikeOrderId('orders')).toBe(false)
  })
})

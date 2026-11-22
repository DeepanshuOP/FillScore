import { describe, expect, it } from 'vitest'
import { accountLabel, looksLikeOrderId, sectionOfPath, SECTIONS, viewHref } from './nav'

describe('viewHref', () => {
  it('a demo account carries its id; Home is /app, each section its own path', () => {
    expect(viewHref('home', 'demo-moderate', false)).toBe('/app?userId=demo-moderate')
    expect(viewHref('overview', 'demo-moderate', false)).toBe('/app/overview?userId=demo-moderate')
    expect(viewHref('orders', 'demo-moderate', false)).toBe('/app/orders?userId=demo-moderate')
  })
  it('signed in, a demo needs sample=1; the own account carries no id', () => {
    expect(viewHref('rules', 'demo-aggressive', true)).toBe('/app/rules?userId=demo-aggressive&sample=1')
    expect(viewHref('rules', null, true)).toBe('/app/rules')
    expect(viewHref('home', null, true)).toBe('/app')
  })
  it('extra parameters (an order to open, the Fills tab)', () => {
    expect(viewHref('orders', 'demo-moderate', false, { order: 'ord-moderate-BTCUSDT-968874' }))
      .toBe('/app/orders?userId=demo-moderate&order=ord-moderate-BTCUSDT-968874')
    expect(viewHref('fills', 'demo-moderate', false, { tab: 'patterns' })).toBe('/app/fills?userId=demo-moderate&tab=patterns')
  })
})

describe('sections, accountLabel, looksLikeOrderId', () => {
  it('nine nouns, each with a gloss, in the order of the sidebar', () => {
    expect(SECTIONS.map((s) => s.label)).toEqual(['Home', 'Overview', 'Orders', 'Rules', 'Rankings', 'Council', 'Evidence', 'Fills', 'Check a broker file'])
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

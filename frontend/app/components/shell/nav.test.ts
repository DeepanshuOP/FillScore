import { describe, expect, it } from 'vitest'
import { accountLabel, looksLikeOrderId, parseView, viewHref } from './nav'

describe('viewHref', () => {
  it('a demo account carries its id; the overview has no view parameter', () => {
    expect(viewHref('overview', 'demo-moderate', false)).toBe('/dashboard?userId=demo-moderate')
    expect(viewHref('orders', 'demo-moderate', false)).toBe('/dashboard?userId=demo-moderate&view=orders')
  })
  it('signed in, a demo needs sample=1; the own account carries no id', () => {
    expect(viewHref('rules', 'demo-aggressive', true)).toBe('/dashboard?userId=demo-aggressive&sample=1&view=rules')
    expect(viewHref('rules', null, true)).toBe('/dashboard?view=rules')
    expect(viewHref('overview', null, true)).toBe('/dashboard')
  })
  it('extra parameters (an order to open)', () => {
    expect(viewHref('orders', 'demo-moderate', false, { order: 'ord-moderate-BTCUSDT-968874' }))
      .toBe('/dashboard?userId=demo-moderate&view=orders&order=ord-moderate-BTCUSDT-968874')
  })
})

describe('parseView, accountLabel, looksLikeOrderId', () => {
  it('unknown views fall back to the overview', () => {
    expect(parseView('rankings')).toBe('rankings')
    expect(parseView('nope')).toBe('overview')
    expect(parseView(null)).toBe('overview')
  })
  it('labels', () => {
    expect(accountLabel('demo-disciplined')).toBe('Disciplined demo')
    expect(accountLabel(null)).toBe('Your account')
  })
  it('order ids', () => {
    expect(looksLikeOrderId('ord-moderate-BTCUSDT-968874')).toBe(true)
    expect(looksLikeOrderId('  3456789 ')).toBe(true)
    expect(looksLikeOrderId('orders')).toBe(false)
  })
})

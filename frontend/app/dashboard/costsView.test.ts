import { describe, expect, it } from 'vitest'
import { costEstimateView } from './costsView'

// Hand values: paid 4.0 bps against an estimate of 3.2 bps is a difference of 0.8 bps; level 0.9 prints "90% interval".
describe('costEstimateView', () => {
  it('figures from the served values, difference and interval in bps', () => {
    const v = costEstimateView({ insufficient: false, n: 48, level: 0.9, paidBps: 4.0, expectedBps: 3.2, excessBps: 0.8, lowBps: -0.4, highBps: 2.0, version: 'ec1.0.0', calibrationSha256: 'x' })
    expect(v).toEqual({ kind: 'figures', paid: '4.0 bps', estimate: '3.2 bps', difference: '0.8 bps', interval: '90% interval −0.4 bps to 2.0 bps', orders: '48 market orders' })
  })
  it('fewer than the floor: the designed state names the floor and the account\'s count, both from the server', () => {
    expect(costEstimateView({ insufficient: true, n: 12, reason: 'fewer than 20 usable market orders' }))
      .toEqual({ kind: 'state', text: 'Needs 20 market orders; this account has 12.' })
  })
  it('another reason is stated in words, never a zero or a blank', () => {
    expect(costEstimateView({ insufficient: true, n: 0, reason: 'no market context' })).toEqual({ kind: 'state', text: 'Insufficient data: no market context.' })
    expect(costEstimateView(undefined)).toEqual({ kind: 'state', text: 'Insufficient data: no market context was stored for these orders.' })
  })
  it('no interval is said so', () => {
    const v = costEstimateView({ insufficient: false, n: 20, level: 0.9, paidBps: 1, expectedBps: 1, excessBps: 0, lowBps: null, highBps: null, version: 'v', calibrationSha256: 'x' })
    expect(v).toMatchObject({ kind: 'figures', interval: 'no interval', difference: '0.0 bps' })
  })
})

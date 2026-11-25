import { describe, expect, it } from 'vitest'
import { BPS_GLOSS, costEstimateView } from './costsView'
import { findAdviceTerms } from '../../../backend/src/constants/adviceTerms'

// Reviewer item (design v5 step 5): bps is glossed once at its first use on Home, Costs and Orders, with the "0.01%" a reader can check:
// 1 bp = 0.01%, so 10 bps = 0.1% (10 x 0.01%).
describe('BPS_GLOSS', () => {
  it('says what a basis point is, with 0.01%, and 10 bps as 0.1%', () => {
    expect(BPS_GLOSS).toBe('bps: basis points. One basis point is 0.01% of an order’s value, so 10 bps is 0.1%.')
    expect(findAdviceTerms(BPS_GLOSS)).toEqual([])
  })
})

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

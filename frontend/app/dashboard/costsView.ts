import type { CostVsExpected } from './scoreV2'
import { bps, count } from '../lib/format'

/**
 * "Against the cost estimate" on Costs (design v5; was "Cost against expected"). Wording and selection of served values only.
 * With fewer market orders than the model's floor the card is a designed state that names both numbers, the floor and the account's
 * count, as the server sent them (PROPOSAL §4 row 10): "Needs 20 market orders; this account has 12." A true finding about the
 * data, not an error.
 */
export type CostEstimateView =
  | { kind: 'figures'; paid: string; estimate: string; difference: string; interval: string; orders: string }
  | { kind: 'state'; text: string }

export function costEstimateView(c: CostVsExpected | undefined): CostEstimateView {
  if (!c) return { kind: 'state', text: 'Insufficient data: no market context was stored for these orders.' }
  if (c.insufficient) {
    const floor = /fewer than (\d+)/.exec(c.reason)?.[1]
    return { kind: 'state', text: floor ? `Needs ${floor} market orders; this account has ${c.n}.` : `Insufficient data: ${c.reason}.` }
  }
  const interval = c.lowBps !== null && c.highBps !== null ? `${Math.round(c.level * 100)}% interval ${bps(c.lowBps)} to ${bps(c.highBps)}` : 'no interval'
  return { kind: 'figures', paid: bps(c.paidBps) ?? '', estimate: bps(c.expectedBps) ?? '', difference: bps(c.excessBps) ?? '', interval, orders: count(c.n, 'market order') }
}

/** The one line a "Total cost" explanation needs: what bps means, once per page (PROPOSAL §1). */
export const BPS_GLOSS = 'bps: basis points. One basis point is 0.01% of an order’s value, so 10 bps is 0.1%.'

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

interface Term { usd: number }
interface ByType { total?: { n?: number } | null; execution?: Term | null; opportunity?: Term | null; fees?: Term | null }
export interface TypeRowView { type: string; execution: number; unfilled: number; fees: number; orders: number }

/**
 * The order-type totals the server serves (`byType.market`, `byType.limit`), copied: the browser adds nothing up. A type with no
 * measured orders, or one of whose three parts the server did not send, is left out: a missing total is absent, never a zero.
 * (Moved from CostsView, design v5 step 6, where the "totals the API did not send are absent, not zero" test of the removed
 * orders panel now lives.)
 */
export function typeRows(ordersBody: unknown): TypeRowView[] {
  const bt = (ordersBody as { byType?: Record<string, ByType | undefined> } | null)?.byType
  if (!bt) return []
  return (['market', 'limit'] as const).flatMap((k) => {
    const t = bt[k]
    const n = t?.total?.n ?? 0
    if (!t || !n || !t.execution || !t.opportunity || !t.fees) return []
    return [{ type: k === 'market' ? 'Market orders' : 'Limit orders', execution: t.execution.usd, unfilled: t.opportunity.usd, fees: t.fees.usd, orders: n }]
  })
}

/** The one line a "Total cost" explanation needs: what bps means, once per page (PROPOSAL §1). */
export const BPS_GLOSS = 'bps: basis points. One basis point is 0.01% of an order’s value, so 10 bps is 0.1%.'

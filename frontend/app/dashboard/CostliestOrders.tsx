'use client'

import { Card } from '../ui/blocks'
import { bps, money, textTime } from '../lib/format'
import { costliest, useLedger } from './useLedger'
import { isUnfilled, type OrderRow } from './ordersTable'

type Json = { status: number; body: unknown }

/**
 * "Costliest orders": the five orders with the highest cost the server measured (an ordering of served values; an unfilled order's
 * cost is modelled, not paid, and says so). A row opens the order's receipt. It replaces the 245-bar chart of the prototype: the
 * server serves no per-order distribution yet, and the browser never bins or sums orders.
 */
export function CostliestOrders({ request, query, onOpenOrder, className }: {
  request: (path: string) => Promise<Json>; query: string; onOpenOrder: (row: OrderRow, origin: DOMRect | null) => void; className?: string
}) {
  const rows = useLedger(request, query)
  const top = Array.isArray(rows) ? costliest(rows) : []
  return (
    <Card title="Costliest orders" sentence="The five orders with the highest cost. Select one to open its receipt." id="top" className={className}
      source="Your orders, measured against Binance public trades." testid="costliest-orders">
      {rows === null ? <div className="flex flex-col gap-2" aria-hidden="true">{[0, 1, 2].map((n) => <div key={n} className="h-12 rounded-lg bg-ui-overlay" />)}</div>
        : rows === 'error' ? <p className="text-[14px] text-ui-graphite">The orders could not be loaded.</p>
        : top.length === 0 ? <p className="text-[14px] text-ui-graphite">No order has a measured cost yet. Costs appear after the orders are synced and measured.</p>
        : (
          <ul className="flex flex-col divide-y divide-ui-rule">
            {top.map((o) => (
              <li key={o.key}>
                <button type="button" disabled={!o.orderId} data-testid="costliest-row" onClick={(e) => onOpenOrder(o, e.currentTarget.getBoundingClientRect())}
                  className="flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left hover:bg-ui-overlay pointer-coarse:min-h-14">
                  <span className="min-w-0">
                    <span className="block font-medium text-ui-ink">{o.symbol}, {o.side === 'BUY' ? 'buy' : 'sell'} {o.type.toLowerCase()}</span>
                    <span className="block text-[13px] text-ui-graphite">{textTime(o.when)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-ui-ink">{money(o.cost?.usd ?? null)}</span>
                    <span className="block text-[13px] text-ui-graphite">{isUnfilled(o) ? 'modelled, not paid' : bps(o.cost?.bps ?? null)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
    </Card>
  )
}

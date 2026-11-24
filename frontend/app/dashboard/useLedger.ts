'use client'

import { useEffect, useState } from 'react'
import { ledgerRows, withParams, type OrderRow } from './ordersTable'

type Json = { status: number; body: unknown }

/**
 * The account's orders as the server sends them (`GET /audit/orders-ledger`), newest first, for the pages that list a few of them
 * (Home and Costs: "Costliest orders"). `null` while loading, 'error' when the request failed. The state is set only in the answer.
 */
export function useLedger(request: (path: string) => Promise<Json>, query: string): OrderRow[] | 'error' | null {
  const [rows, setRows] = useState<{ query: string; rows: OrderRow[] | 'error' } | null>(null)
  useEffect(() => {
    let live = true
    request(withParams('/audit/orders-ledger', query))
      .then((res) => { if (live) setRows({ query, rows: res.status === 200 && res.body ? (ledgerRows(res.body) ?? []) : 'error' }) })
      .catch(() => { if (live) setRows({ query, rows: 'error' }) })
    return () => { live = false }
  }, [request, query])
  return rows && rows.query === query ? rows.rows : null
}

/** The `limit` orders with the highest served cost in dollars (an ordering of served values; an unfilled order counts its modelled cost). */
export function costliest(rows: OrderRow[], limit = 5): OrderRow[] {
  return rows.filter((r) => r.cost !== null).sort((a, b) => (b.cost as { usd: number }).usd - (a.cost as { usd: number }).usd).slice(0, limit)
}

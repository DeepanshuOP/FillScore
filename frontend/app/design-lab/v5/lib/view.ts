import { describeHeadline } from '../../../dashboard/headline'
import { describeStrip } from '../../../dashboard/costStrip'
import type { Account } from './data'
import { bps, count, money } from './format'

/**
 * Shared page values for the v5 prototype, from the production view models (`describeHeadline`, `describeStrip`, both tested
 * in `app/dashboard/`) over the served bodies. Formatting and selection only; no figure is computed here.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (iso: string) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }

export function pageValues(a: Account) {
  const demo = a.dataSource === 'synthetic-demo'
  const headline = describeHeadline(a.ordersBody, demo)
  const strip = describeStrip(a.ordersBody, headline?.feesNotMeasured ?? false)
  // the ledger is served newest first: its last and first rows are the period's first and last orders
  const first = a.ledger.orders[a.ledger.orders.length - 1]?.placedAt, last = a.ledger.orders[0]?.placedAt
  const period = first && last ? `${day(first)} – ${day(last)}, ${new Date(last).getUTCFullYear()}` : 'All stored orders'
  const t = a.ordersBody.shortfall.totals
  const g = a.v2.result
  const month = last ? new Date(last).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''
  return {
    demo, headline, strip, period, month,
    tiles: {
      total: { value: money(headline?.totalUsd ?? null) ?? 'insufficient data', sub: headline ? `${bps(headline.totalBps)} · ${count(headline.orders, 'order')}` : undefined },
      fees: { value: money(t.fees.usd) ?? 'insufficient data', sub: headline?.feesNotMeasured ? 'published rate, not independently measured' : bps(t.fees.bps) ?? undefined },
      unfilled: { value: money(headline?.unfilledUsd ?? null) ?? 'insufficient data', sub: headline?.unfilledOrders != null ? `${count(headline.unfilledOrders, 'order')} that never filled` : undefined },
      grade: { value: `${g.grade} · ${g.composite.toFixed(1)}`, sub: `of 100 · range ${g.band[0].toFixed(1)} to ${g.band[1].toFixed(1)}` },
    },
  }
}

export const ordersSentence = (a: Account, period: string) =>
  `What the ${count(a.ordersBody.counts.orders, 'order')} and ${count(a.ordersBody.counts.fills, 'fill')} cost, ${period}, measured against Binance public trades.`

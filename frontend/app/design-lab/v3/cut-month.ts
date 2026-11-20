/**
 * Design v3 lab (2026-11-20): cuts the month tape fixture for demo-moderate, January 2024, from the offline demo build
 * only (ml-service/demo_v2/out): no network, no database, no Atlas. Every order goes through the production
 * `buildOrderReplay` (backend/src/services/orderReplay.ts), the function GET /api/audit/orders/:id/replay serves, so the
 * receipts in the lab show the product's own numbers. Trader behaviour is synthetic; prices are real (dataSource
 * synthetic-demo).
 *
 * Run from backend/:  npx tsx ../frontend/app/design-lab/v3/cut-month.ts
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildOrderReplay } from '../../../../backend/src/services/orderReplay'

const BUILD = resolve(__dirname, '../../../../ml-service/demo_v2/out/demo-moderate')
const OUT = resolve(__dirname, 'fixtures/month-orders.json')
const read = <T>(p: string): T => JSON.parse(readFileSync(resolve(BUILD, p), 'utf8')) as T

type RawOrder = { orderId: string; symbol: string; exchange: string; type?: string; side: string; origQty: number; executedQty: number; status: string; restingMs?: number | null; createdAt: string; updatedAt: string }
type Fill = { orderId: string; tradeId: string; executedAt: string; executionPrice: number; quantity: number; feeUsd?: number | null; isMaker?: boolean }
type M = Record<string, unknown> & { orderId: string }

const orders = read<RawOrder[]>('orders.json')
const fills = read<Fill[]>('trades.json')
const measurements = read<M[]>('order_measurements.json')

const rows = [...orders].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map((o) => {
  const m = measurements.find((x) => x.orderId === o.orderId) ?? null
  const r = buildOrderReplay({
    order: { orderId: o.orderId, symbol: o.symbol, exchange: o.exchange, type: o.type ?? null, side: o.side, origQty: o.origQty, executedQty: o.executedQty,
      status: o.status, restingMs: o.restingMs ?? null, createdAt: new Date(o.createdAt), updatedAt: new Date(o.updatedAt) },
    fills: fills.filter((f) => f.orderId === o.orderId).map((f) => ({ tradeId: f.tradeId, executionPrice: f.executionPrice, quantity: f.quantity,
      executedAt: new Date(f.executedAt), feeUsd: f.feeUsd ?? null, isMaker: f.isMaker ?? null })),
    measurement: m ? ({ version: m.version, arrivalMid: m.arrivalMid, endMid: m.endMid, endBasis: m.endBasis, unmeasuredReason: m.unmeasuredReason,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      shortfall: m.shortfall ?? null, expectedCost: m.expectedCost ?? null, marketDataRefs: m.marketDataRefs ?? [] } as any) : null,
  }) as unknown as {
    order: Record<string, unknown>
    fills: Array<{ time: string; price: number; quantity: number; notional: number; feeUsd: number | null; isMaker: boolean | null }>
    decomposition: Array<{ key: string; label: string; bps: number | null; usd: number | null; reason?: string | null }>
    expectedCost: { applies: boolean; expectedBps?: number | null; lowBps?: number | null; highBps?: number | null; reason?: string | null } | null
    sources: Array<{ label: string; sha256?: string | null }>
    notes: string[]
  }
  const sf = (m?.shortfall ?? null) as { intendedNotional?: number } | null
  return {
    order: r.order,
    // The summary's bps denominator (orderSummary.termTotals): the order's intended notional, filled or not.
    intendedNotional: typeof sf?.intendedNotional === 'number' ? sf.intendedNotional : null,
    fills: r.fills.map((f) => ({ time: f.time, price: f.price, quantity: f.quantity, notional: f.notional, feeUsd: f.feeUsd, isMaker: f.isMaker })),
    decomposition: r.decomposition.map((d) => ({ key: d.key, label: d.label, bps: d.bps, usd: d.usd, reason: d.reason ?? null })),
    expectedCost: r.expectedCost ? { applies: r.expectedCost.applies, expectedBps: r.expectedCost.expectedBps ?? null, lowBps: r.expectedCost.lowBps ?? null,
      highBps: r.expectedCost.highBps ?? null, reason: r.expectedCost.reason ?? null } : null,
    sources: r.sources.map((s) => ({ label: s.label, sha256: s.sha256 ?? null })),
    notes: r.notes,
  }
})

writeFileSync(OUT, JSON.stringify({ account: 'demo-moderate', dataSource: 'synthetic-demo', period: '2024-01',
  note: 'demo-moderate, January 2024: every order through the production buildOrderReplay over the offline demo build. Trader behaviour is synthetic; prices are real.',
  orders: rows }))
console.log(`wrote ${rows.length} orders to ${OUT}`)

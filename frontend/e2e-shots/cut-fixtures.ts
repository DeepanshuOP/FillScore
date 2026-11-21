/**
 * Cuts the API answers the screenshots of M8 part 1 replace (2026-11-20), for demo-moderate and demo-disciplined, from the
 * offline demo build only (ml-service/demo_v2/out): no network, no database, no Atlas. The order summary is the output of the
 * production function `summariseOrders` over the build's orders and order measurements; the v2 body is the one
 * GET /api/audit/v2 serves for a rebuilt demo (routes/audit.ts); `current` is what GET /api/audit/score adds for a rebuilt demo.
 *
 * Run from backend/:  npx tsx ../frontend/e2e-shots/cut-fixtures.ts   (ts-node fails on the ESM import since Node 26)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { summariseOrders } from '../../backend/src/services/orderSummary'
// Design v2 (2026-11-20): the rankings come from the production rankWithNoise (the part 1 fixture numbered groups i + 1 with a
// min-max interval and wrote status "too_few", which is why its screenshots showed ranks 2, 3, 4 and no rank 1), and the
// fills and order replays are added so the order drawer can be reviewed offline (buildOrderReplay, as the route maps them).
import { rankWithNoise } from '../../backend/src/services/rankWithNoise'
import { buildOrderReplay } from '../../backend/src/services/orderReplay'
import { buildOrderLedger, orderCounts } from '../../backend/src/services/orderLedger'

const OUT = resolve(__dirname, 'fixtures')
const BUILD = resolve(__dirname, '../../ml-service/demo_v2/out')
// The locked published v1 grades (CLAUDE.md rule 5), as the dashboard shows them.
const V1: Record<string, { grade: string; score: number }> = {
  'demo-moderate': { grade: 'B', score: 84.80888516669383 },
  'demo-disciplined': { grade: 'A', score: 95.88542572161496 },
  'demo-aggressive': { grade: 'C', score: 60.67469266790485 },
}
const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

mkdirSync(OUT, { recursive: true })
interface GradeEntry { scoringVersion: string; versionFileSha256: string; measureVersion: string; integrityHash: string; result: unknown; costVsExpected: unknown }
interface Trade { notional?: number; price: number; quantity: number; isMaker?: boolean }
type Orders = Parameters<typeof summariseOrders>[0]
type Measurements = Parameters<typeof summariseOrders>[1]
const grades = read<Record<string, GradeEntry>>(resolve(BUILD, 'grades_v2.json'))
for (const id of Object.keys(V1)) {
  const orders = read<Orders>(resolve(BUILD, id, 'orders.json'))
  const measurements = read<Measurements>(resolve(BUILD, id, 'order_measurements.json'))
  const trades = read<Trade[]>(resolve(BUILD, id, 'trades.json'))
  const g = grades[id]
  const notional = trades.reduce((s, t) => s + (t.notional ?? t.price * t.quantity), 0)
  const maker = trades.filter((t) => t.isMaker === true).length
  // The Explain panel's answers for the screenshots. They are built from the same measurements but are NOT the production
  // exception rules or bootstrap (the screenshots review layout): the finding sentence is a plain restatement of two fields,
  // and a ranking's interval is the min and max of its orders.
  const rows: Array<{ orderId: string; symbol: string; bps: number; usd: number }> = []
  for (const m of measurements) {
    const sf = m.shortfall
    if (sf && typeof sf.totalBps === 'number' && sf.intendedNotional > 0) {
      rows.push({ orderId: m.orderId, symbol: m.symbol ?? '', bps: sf.totalBps, usd: (sf.totalBps * sf.intendedNotional) / 1e4 })
    }
  }
  const top = [...rows].sort((a, b) => b.usd - a.usd).slice(0, 5)
  const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2 }
  // The rankings rank execution cost (shortfall.executionBps), as GET /audit/rankings does (routes/explain.ts), not the
  // total with fees: an earlier cut ranked totalBps, so the plot showed about 10 bps under an "Execution cost" title.
  const bySymbol = new Map<string, number[]>()
  for (const m of measurements) {
    const e = m.shortfall?.executionBps
    if (typeof e === 'number' && Number.isFinite(e)) bySymbol.set(m.symbol ?? '', [...(bySymbol.get(m.symbol ?? '') ?? []), e])
  }
  const groups = rankWithNoise([...bySymbol.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, values]) => ({ key, values })))
  // Fills as GET /api/audit/trades returns them, and one replay per order (keyed symbol:orderId).
  type Fill = { orderId: string; symbol: string; side: string; orderType?: string; isMaker?: boolean; executedAt: string; executionPrice: number; quantity: number; notional?: number; feeUsd?: number | null; tradeId: string }
  const fills = read<Fill[]>(resolve(BUILD, id, 'trades.json'))
  const apiTrades = [...fills].sort((a, b) => (a.executedAt < b.executedAt ? 1 : -1))
    .map((t) => ({ ...t, notionalValue: t.notional ?? t.executionPrice * t.quantity, feePaid: t.feeUsd ?? null, slippageBps: null }))
  type RawOrder = { orderId: string; symbol: string; exchange: string; type?: string; side: string; origQty: number; executedQty: number; status: string; restingMs?: number | null; createdAt: string; updatedAt: string }
  const replays: Record<string, unknown> = {}
  // Only the orders a reviewer can reach: the 60 newest (the first page of the orders table) and the queued ones (keeps the file small).
  const reach = new Set([...(orders as unknown as RawOrder[])].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 60).map((o) => o.orderId))
  for (const r of top) reach.add(r.orderId)
  // Design v3 fixes A1: the ledger lists unfilled orders too; their receipts must open offline.
  for (const o of orders as unknown as RawOrder[]) if (!(o.executedQty > 0)) reach.add(o.orderId)
  for (const o of (orders as unknown as RawOrder[]).filter((x) => reach.has(x.orderId))) {
    const m = (measurements as unknown as Array<Record<string, unknown> & { orderId: string }>).find((x) => x.orderId === o.orderId)
    if (!m) continue
    replays[`${o.symbol}:${o.orderId}`] = buildOrderReplay({
      order: { orderId: o.orderId, symbol: o.symbol, exchange: o.exchange, type: o.type ?? null, side: o.side, origQty: o.origQty, executedQty: o.executedQty,
        status: o.status, restingMs: o.restingMs ?? null, createdAt: new Date(o.createdAt), updatedAt: new Date(o.updatedAt) },
      fills: fills.filter((f) => f.orderId === o.orderId).map((f) => ({ tradeId: f.tradeId, executionPrice: f.executionPrice, quantity: f.quantity,
        executedAt: new Date(f.executedAt), feeUsd: f.feeUsd ?? null, isMaker: f.isMaker ?? null })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      measurement: { version: m.version, arrivalMid: m.arrivalMid, endMid: m.endMid, endBasis: m.endBasis, unmeasuredReason: m.unmeasuredReason,
        shortfall: m.shortfall ?? null, expectedCost: m.expectedCost ?? null, marketDataRefs: m.marketDataRefs ?? [] } as any,
    })
  }
  const explain = {
    exceptions: { items: top.map((r) => ({ orderId: r.orderId, symbol: r.symbol, rules: ['high-total-cost'], finding: `Total cost ${r.bps.toFixed(1)} bps against a 90th percentile of ${median(rows.map((x) => x.bps)).toFixed(1)} bps for the account.`, usd: r.usd, totalBps: r.bps, state: 'open' })),
      total: top.length, checked: rows.length, skipped: 0, thresholds: { minOrders: 20, p90TotalBps: median(rows.map((r) => r.bps)) }, note: null, reviewCounts: { open: top.length, reviewed: 0, dismissed: 0 } },
    rankings: { by: 'symbol', level: 0.9, minOrders: 20, groups },
    venues: { note: 'Only one venue in this account, so there is nothing to compare.', buckets: [] },
  }
  const body = {
    explain,
    trades: { v1Computed: false, trades: apiTrades, total: apiTrades.length, page: 1, pages: 1 },
    replays,
    // counts and the ledger: the production functions GET /audit/orders-summary and GET /audit/orders-ledger call.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ordersBody: { available: true, ...summariseOrders(orders, measurements), counts: orderCounts(orders as any, fills as any) },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ledger: { available: true, ...buildOrderLedger(orders as any, fills as any, measurements as any) },
    v2Body: {
      label: 'v2 (measured)', scoringVersion: g.scoringVersion, versionFileSha256: g.versionFileSha256, measureVersion: g.measureVersion,
      integrityHash: g.integrityHash, computedAt: null, result: g.result, costVsExpected: g.costVsExpected,
      demo: { dataSource: 'synthetic-demo', basis: 'offline build (ml-service/scripts/build_demo_v2.py): real January 2024 prints, synthetic trading behaviour' },
    },
    v1: V1[id],
    current: { fills: trades.length, orders: orders.length, notionalUsd: notional, makerRatio: trades.length ? maker / trades.length : null },
  }
  writeFileSync(resolve(OUT, `${id}.json`), JSON.stringify(body) + '\n')   // compact: the fills make the file large
  console.log(id, 'orders', orders.length, 'fills', trades.length, 'notional', notional.toFixed(2))
}

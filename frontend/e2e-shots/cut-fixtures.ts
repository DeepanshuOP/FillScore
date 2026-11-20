/**
 * Cuts the API answers the screenshots of M8 part 1 replace (2026-11-20), for demo-moderate and demo-disciplined, from the
 * offline demo build only (ml-service/demo_v2/out): no network, no database, no Atlas. The order summary is the output of the
 * production function `summariseOrders` over the build's orders and order measurements; the v2 body is the one
 * GET /api/audit/v2 serves for a rebuilt demo (routes/audit.ts); `current` is what GET /api/audit/score adds for a rebuilt demo.
 *
 * Run from backend/:  npx ts-node --transpile-only ../frontend/e2e-shots/cut-fixtures.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { summariseOrders } from '../../backend/src/services/orderSummary'

const OUT = resolve(__dirname, 'fixtures')
const BUILD = resolve(__dirname, '../../ml-service/demo_v2/out')
// The locked published v1 grades (CLAUDE.md rule 5), as the dashboard shows them.
const V1: Record<string, { grade: string; score: number }> = {
  'demo-moderate': { grade: 'B', score: 84.80888516669383 },
  'demo-disciplined': { grade: 'A', score: 95.88542572161496 },
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
  const bySymbol = new Map<string, number[]>()
  for (const r of rows) bySymbol.set(r.symbol, [...(bySymbol.get(r.symbol) ?? []), r.bps])
  const groups = [...bySymbol.entries()].sort((a, b) => median(b[1]) - median(a[1])).map(([key, v], i) => v.length >= 20
    ? { key, n: v.length, median: median(v), low: Math.min(...v), high: Math.max(...v), status: 'ranked', rank: i + 1, tiedWith: [] as string[] }
    : { key, n: v.length, median: null, low: null, high: null, status: 'too_few', rank: null, tiedWith: [] as string[] })
  const explain = {
    exceptions: { items: top.map((r) => ({ orderId: r.orderId, symbol: r.symbol, rules: ['high-total-cost'], finding: `Total cost ${r.bps.toFixed(1)} bps against a 90th percentile of ${median(rows.map((x) => x.bps)).toFixed(1)} bps for the account.`, usd: r.usd, totalBps: r.bps, state: 'open' })),
      total: top.length, checked: rows.length, skipped: 0, thresholds: { minOrders: 20, p90TotalBps: median(rows.map((r) => r.bps)) }, note: null, reviewCounts: { open: top.length, reviewed: 0, dismissed: 0 } },
    rankings: { by: 'symbol', level: 0.9, minOrders: 20, groups },
    venues: { note: 'Only one venue in this account, so there is nothing to compare.', buckets: [] },
  }
  const body = {
    explain,
    ordersBody: { available: true, ...summariseOrders(orders, measurements) },
    v2Body: {
      label: 'v2 (measured)', scoringVersion: g.scoringVersion, versionFileSha256: g.versionFileSha256, measureVersion: g.measureVersion,
      integrityHash: g.integrityHash, computedAt: null, result: g.result, costVsExpected: g.costVsExpected,
      demo: { dataSource: 'synthetic-demo', basis: 'offline build (ml-service/scripts/build_demo_v2.py): real January 2024 prints, synthetic trading behaviour' },
    },
    v1: V1[id],
    current: { fills: trades.length, orders: orders.length, notionalUsd: notional, makerRatio: trades.length ? maker / trades.length : null },
  }
  writeFileSync(resolve(OUT, `${id}.json`), JSON.stringify(body, null, 1) + '\n')
  console.log(id, 'orders', orders.length, 'fills', trades.length, 'notional', notional.toFixed(2))
}

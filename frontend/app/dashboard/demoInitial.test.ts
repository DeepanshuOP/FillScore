import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDemoInitial } from './demoInitial'

// Design v5 step 7: the first figures of a demo account are fetched on the server and sent in the page, so they do not wait for the
// browser to start, resolve the session and make three requests in a row. Only the three public demo ids use it: a signed-in account's
// figures keep the browser path (the session is not forwarded to the server, and no test covers forwarding it).
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const routes = (over: Record<string, Response | Error> = {}) => vi.fn(async (url: string) => {
  const path = new URL(url).pathname.replace(/^\/api/, '')
  const hit = over[path]
  if (hit instanceof Error) throw hit
  if (hit) return hit
  if (path === '/audit/score') return json({ userId: 'demo-aggressive', totalTrades: 3 })
  if (path === '/audit/v2') return json({ scoringVersion: 'v2.3.0', result: { grade: 'A', composite: 94.3497 } })
  if (path === '/audit/orders-summary') return json({ available: true, orders: { total: 5 } })
  return json(null, 404)
})
const vars = { BACKEND_PROXY_URL: 'http://api.test' }

afterEach(() => { vi.restoreAllMocks() })

describe('loadDemoInitial', () => {
  it('returns the three served bodies of a demo account, unchanged, asked for with its id', async () => {
    const f = routes()
    const r = await loadDemoInitial('demo-aggressive', f as never, vars)
    expect(r).toEqual({
      userId: 'demo-aggressive',
      audit: { userId: 'demo-aggressive', totalTrades: 3 },
      v2: { status: 200, body: { scoringVersion: 'v2.3.0', result: { grade: 'A', composite: 94.3497 } } },
      orders: { available: true, orders: { total: 5 } },
    })
    expect(f.mock.calls.map((c) => c[0]).sort()).toEqual([
      'http://api.test/api/audit/orders-summary?userId=demo-aggressive',
      'http://api.test/api/audit/score?userId=demo-aggressive',
      'http://api.test/api/audit/v2?userId=demo-aggressive',
    ])
  })

  it('asks for fresh answers every time: a cached copy would show a demo\'s old figures after its data changes', async () => {
    const f = routes()
    await loadDemoInitial('demo-moderate', f as never, vars)
    for (const call of f.mock.calls as unknown as Array<[string, RequestInit]>) expect(call[1].cache).toBe('no-store')
  })

  it('is null, and calls nothing, for an id that is not a visible demo account (a real account never loads on the server)', async () => {
    const f = routes()
    expect(await loadDemoInitial('demo-bybit', f as never, vars)).toBeNull()      // hidden demos stay hidden
    expect(await loadDemoInitial('someone-real', f as never, vars)).toBeNull()
    expect(await loadDemoInitial(null, f as never, vars)).toBeNull()
    expect(await loadDemoInitial(undefined, f as never, vars)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('is null when the score does not load (the page then loads in the browser as before), however the other two answer', async () => {
    expect(await loadDemoInitial('demo-moderate', routes({ '/audit/score': json({ error: 'x' }, 500) }) as never, vars)).toBeNull()
    expect(await loadDemoInitial('demo-moderate', routes({ '/audit/score': new Error('network') }) as never, vars)).toBeNull()
  })

  it('a missing measured score or orders summary never blocks the page: v2 keeps its status, orders become null', async () => {
    const r = await loadDemoInitial('demo-moderate', routes({ '/audit/v2': json({ error: 'no_v2_score' }, 404), '/audit/orders-summary': new Error('network') }) as never, vars)
    expect(r?.v2).toEqual({ status: 404, body: { error: 'no_v2_score' } })
    expect(r?.orders).toBeNull()
    expect(r?.audit).toEqual({ userId: 'demo-aggressive', totalTrades: 3 })
  })
})

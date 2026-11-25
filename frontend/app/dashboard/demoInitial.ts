import { serverApiBase } from '../lib/serverApiBase'
import { isAllowedDemoId } from '../utils/dashboardMode'
import { buildQuery } from '../utils/queryBuilder'

/**
 * The first figures of a demo account, fetched on the server (design v5 step 7). The three requests are the ones the browser makes
 * (`/audit/score`, `/audit/v2`, `/audit/orders-summary`), public for the three visible demo accounts, so no credential is involved.
 * Only those ids load here: any other id, a hidden demo or a real account returns null and the browser path runs as before. A score that
 * does not load returns null (the browser then fetches); a missing v2 or orders summary never blocks the page, as in the browser.
 */
export interface DemoInitial {
  userId: string
  audit: unknown
  v2: { status: number | null; body: unknown }
  orders: unknown
}

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>
const TIMEOUT_MS = 4000

export async function loadDemoInitial(
  userId: string | null | undefined,
  fetcher: Fetcher = fetch,
  vars: Record<string, string | undefined> = process.env,
): Promise<DemoInitial | null> {
  if (!isAllowedDemoId(userId ?? null)) return null
  const base = serverApiBase(vars)
  const q = buildQuery('demo', userId!)
  // no-store: the browser path never cached these answers, and a cached copy would show a demo's old figures after its data changes
  const get = (path: string) => fetcher(`${base}${path}${q}`, { cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) })
  try {
    const [score, v2, orders] = await Promise.all([
      get('/audit/score'),
      get('/audit/v2').then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch(() => ({ status: 500, body: null })),
      get('/audit/orders-summary').then(async (r) => (r.ok ? await r.json().catch(() => null) : null)).catch(() => null),
    ])
    if (!score.ok) return null
    return { userId: userId!, audit: await score.json(), v2, orders }
  } catch {
    return null
  }
}

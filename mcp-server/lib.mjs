// The tools of the read-only FillScore MCP server. Each one makes exactly one GET request to the FillScore API, with the user's own
// access token (or a demo account id, which needs none), and returns the API's text unchanged. Nothing here computes a number,
// predicts or advises: every figure was stored by FillScore's deterministic measurement code. See README.md.
import { z } from 'zod';

export const TOOL_NAMES = [
  'fillscore_score', 'fillscore_orders_summary', 'fillscore_exceptions',
  'fillscore_order_replay', 'fillscore_rankings', 'fillscore_venue_comparison',
];

const READ_ONLY = 'Read-only: it reads FillScore\'s stored measurements of past executions and changes nothing.';
const symbol = z.string().regex(/^[A-Za-z0-9]{3,20}$/, 'a symbol such as BTCUSDT').transform((s) => s.toUpperCase());
const MAX_ERROR_TEXT = 500;

function checkApiUrl(apiUrl) {
  let u;
  try { u = new URL(apiUrl); } catch { throw new Error('FILLSCORE_API_URL is not a URL'); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) {
    throw new Error('FILLSCORE_API_URL must use https (http is allowed for localhost only), so the token is never sent in the clear');
  }
  return u.origin + u.pathname.replace(/\/+$/, '');
}

export function createTools({ apiUrl, token, demoUser, fetchFn = fetch }) {
  const base = checkApiUrl(apiUrl);
  if (!token && !demoUser) throw new Error('a token or a demo account is required: set FILLSCORE_TOKEN to your access token, or FILLSCORE_DEMO_USER to a demo-* account id');
  if (!token && !String(demoUser).startsWith('demo-')) throw new Error('FILLSCORE_DEMO_USER must be a demo-* account id');

  async function get(path, params = {}) {
    const url = new URL(base + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    if (!token) url.searchParams.set('userId', demoUser);
    const headers = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    let res;
    try {
      res = await fetchFn(url, { method: 'GET', headers, redirect: 'error' });   // a redirect never carries the token to another host
    } catch {
      return { isError: true, content: [{ type: 'text', text: 'Could not reach FillScore. Nothing was read.' }] };
    }
    const text = await res.text();
    if (!res.ok) {
      return { isError: true, content: [{ type: 'text', text: `FillScore answered ${res.status}: ${text.slice(0, MAX_ERROR_TEXT)}` }] };
    }
    return { content: [{ type: 'text', text }] };
  }

  return [
    { name: 'fillscore_score', description: `The measured score (v2) of the account, with its version and integrity hash, and the cost against the modelled expectation of its market orders, with its interval or "insufficient data". ${READ_ONLY}`,
      inputSchema: {}, handler: async () => get('/api/audit/v2') },
    { name: 'fillscore_orders_summary', description: `How the account's orders ended, the resting time of limit orders and the shortfall totals per term in USD and basis points. ${READ_ONLY}`,
      inputSchema: {}, handler: async () => get('/api/audit/orders-summary') },
    { name: 'fillscore_exceptions', description: `The orders that met a stated rule (cost above the expected interval, an unfilled order above the account's own 90th percentile, a high total cost), each with a one-line finding built from stored numbers, and their review state. ${READ_ONLY}`,
      inputSchema: { includeDismissed: z.boolean().optional() },
      handler: async ({ includeDismissed } = {}) => get('/api/audit/exceptions', { includeDismissed: includeDismissed ? '1' : undefined }) },
    { name: 'fillscore_order_replay', description: `One past order: its fills, each cost term in basis points and USD with the stored field it came from, and the public market-data files (with SHA-256) behind it. ${READ_ONLY}`,
      inputSchema: { orderId: z.string().min(1).max(128), symbol: symbol.optional() },
      handler: async ({ orderId, symbol: sym }) => get(`/api/audit/orders/${encodeURIComponent(orderId)}/replay`, { symbol: sym }) },
    { name: 'fillscore_rankings', description: `Execution cost by symbol or by hour of the day over past orders; a group with fewer than 20 orders is "too few to tell" and groups that cannot be told apart share a rank. ${READ_ONLY}`,
      inputSchema: { by: z.enum(['symbol', 'hour']) }, handler: async ({ by }) => get('/api/audit/rankings', { by }) },
    { name: 'fillscore_venue_comparison', description: `The account's own past fills compared across venues, matched by symbol and size bucket; "insufficient data" when only one venue has measured fills. ${READ_ONLY}`,
      inputSchema: {}, handler: async () => get('/api/audit/venue-comparison') },
  ];
}

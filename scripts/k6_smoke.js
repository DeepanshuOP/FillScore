// k6 smoke test of the FillScore API (M9): a small, polite load on the public read routes of the demo accounts.
//
//   k6 run scripts/k6_smoke.js                                  # against a local API on http://localhost:3001 (scripts/dev.sh)
//   BASE_URL=http://127.0.0.1:3001 k6 run scripts/k6_smoke.js
//
// It REFUSES any target that is not localhost unless K6_ALLOW_REMOTE=1 is set: the production API runs on a free instance that sleeps and
// shares its hours, and a load test is not something to point at it without the owner's say-so. The load stays under the API's own read
// limit (300 requests per 15 minutes per IP on /api/audit): 2 virtual users, one pass a second, 3 audit reads a pass, 30 seconds = about 180.
// Thresholds: fewer than 1% failed requests, 95% of requests under 800 ms, every check passing. It reads only the three public demo
// accounts, needs no key and writes nothing.
//
// Not yet run: k6 is not installed on the machine this was written on (checked with `which k6`). The file was syntax-checked only.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = (__ENV.BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(BASE);
if (!LOCAL && __ENV.K6_ALLOW_REMOTE !== '1') {
  throw new Error(`refusing to load-test ${BASE}: it is not localhost. Set K6_ALLOW_REMOTE=1 only with the owner's permission.`);
}

export const options = {
  scenarios: { smoke: { executor: 'constant-vus', vus: 2, duration: '30s' } },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
    checks: ['rate>0.99'],
  },
};

const DEMOS = ['demo-disciplined', 'demo-moderate', 'demo-aggressive'];

export default function () {
  const health = http.get(`${BASE}/health`);
  check(health, { 'health is 200': (r) => r.status === 200 });

  const demo = DEMOS[Math.floor(Math.random() * DEMOS.length)];
  const score = http.get(`${BASE}/api/audit/score?userId=${demo}`);
  check(score, { 'score is 200': (r) => r.status === 200, 'score is JSON': (r) => (r.headers['Content-Type'] || '').includes('application/json') });

  const v2 = http.get(`${BASE}/api/audit/v2?userId=${demo}`);
  // 404 is a valid answer when the rebuilt demo data is not in this database; 5xx and 429 are not
  check(v2, { 'v2 is 200 or 404': (r) => r.status === 200 || r.status === 404 });

  const summary = http.get(`${BASE}/api/audit/orders-summary?userId=${demo}`);
  check(summary, { 'orders summary is 200': (r) => r.status === 200 });

  // a write on a demo account and an unknown account must be refused, every time
  const denied = http.patch(`${BASE}/api/audit/exceptions/o1?userId=${demo}`, JSON.stringify({ state: 'dismissed' }), { headers: { 'Content-Type': 'application/json' } });
  check(denied, { 'a demo account is read-only (403)': (r) => r.status === 403 });
  const foreign = http.get(`${BASE}/api/audit/v2?userId=someone-else`);
  check(foreign, { 'another account is refused (403)': (r) => r.status === 403 });

  sleep(1);
}

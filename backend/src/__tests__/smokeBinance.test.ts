import { describe, it, expect, afterEach } from 'vitest';
import http from 'http';
import path from 'path';
import { execFile } from 'child_process';
import { AddressInfo } from 'net';

/**
 * Fifth order of 2026-11-22, step 0c: smoke_prod.sh's "backend reaches Binance" line says where a 418 came from and how
 * long the pause still runs, instead of a bare FAIL. A fake backend answers /api/preflight/exchanges with a fixed body.
 */
function serve(binance: Record<string, unknown>): Promise<http.Server> {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.url === '/api/preflight/exchanges') res.end(JSON.stringify({ checkedAt: 'x', cached: false, exchanges: [{ exchange: 'binance', ...binance }] }));
      else res.end('{}');
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}
const url = (s: http.Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const script = path.resolve(__dirname, '../../../scripts/smoke_prod.sh');

function binanceLine(base: string): Promise<{ line: string; code: number }> {
  return new Promise((resolve) => {
    execFile('bash', [script, base, base, base], { env: { ...process.env, SMOKE_WAKE_TIMEOUT: '2', SMOKE_TIMEOUT: '2' } }, (e, stdout) =>
      resolve({ line: stdout.split('\n').find((l) => l.includes('backend reaches Binance')) ?? '', code: (e as { code?: number } | null)?.code ?? 0 }));
  });
}

describe('smoke_prod.sh: the Binance reachability line', () => {
  let s: http.Server;
  afterEach(() => s?.close());

  it('a fresh 418 from Binance: FAIL, source binance_sent, Retry-After 600 s as received, 600 s pause, non-zero exit', async () => {
    s = await serve({ status: 'rate_limited', httpStatus: 418, source: 'binance_sent', pauseRemainingS: 600, retryAfterS: 600 });
    const { line, code } = await binanceLine(url(s));
    expect(line).toMatch(/^FAIL\s+backend reaches Binance\s+status rate_limited, HTTP 418 from Binance just now \(binance_sent\), Retry-After 600 s as received, pause 600 s left$/);
    expect(code).not.toBe(0);
  }, 60000);

  it('a governor pause: FAIL, nothing sent (governor_paused), 90 s left, the earlier Retry-After 120 s', async () => {
    s = await serve({ status: 'rate_limited', httpStatus: 418, source: 'governor_paused', pauseRemainingS: 90, retryAfterS: 120 });
    const { line } = await binanceLine(url(s));
    expect(line).toMatch(/^FAIL\s+backend reaches Binance\s+status rate_limited, HTTP 418 received earlier, nothing sent \(governor_paused\), Retry-After 120 s as received, pause 90 s left$/);
  }, 60000);

  it('a 418 without Retry-After: "Retry-After absent"', async () => {
    s = await serve({ status: 'rate_limited', httpStatus: 418, source: 'binance_sent', pauseRemainingS: 120, retryAfterS: null });
    const { line } = await binanceLine(url(s));
    expect(line).toMatch(/HTTP 418 from Binance just now \(binance_sent\), Retry-After absent, pause 120 s left$/);
  }, 60000);

  it('a backend older than step 0c (no source field): the bare status, and says the source is not reported', async () => {
    s = await serve({ status: 'rate_limited', httpStatus: 418 });
    const { line } = await binanceLine(url(s));
    expect(line).toMatch(/^FAIL\s+backend reaches Binance\s+status rate_limited, HTTP 418, source not reported by this backend$/);
  }, 60000);

  it('reachable: PASS unchanged', async () => {
    s = await serve({ status: 'reachable', httpStatus: 200, source: 'binance_sent', pauseRemainingS: 0, retryAfterS: null });
    const { line } = await binanceLine(url(s));
    expect(line).toMatch(/^PASS\s+backend reaches Binance\s+status reachable, HTTP 200$/);
  }, 60000);
});

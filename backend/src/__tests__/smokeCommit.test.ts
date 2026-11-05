import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import path from 'path';
import { execFile } from 'child_process';
import { AddressInfo } from 'net';

// Fake service answering /version (and /frontend-version) with a fixed commit.
function serve(commit: string): Promise<http.Server> {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ version: '1', commit }));
    });
    s.listen(0, '127.0.0.1', () => resolve(s));
  });
}
const url = (s: http.Server) => `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
const script = path.resolve(__dirname, '../../../scripts/smoke_prod.sh');

function run(args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('bash', [script, ...args], { env: { ...process.env, SMOKE_WAKE_TIMEOUT: '2', SMOKE_TIMEOUT: '2' } },
      (_e, stdout) => resolve(stdout));
  });
}

describe('smoke_prod.sh commit check', () => {
  let a: http.Server, b: http.Server, c: http.Server;
  beforeAll(async () => { a = await serve('30d08b1aaaa'); b = await serve('30d08b1aaaa'); c = await serve('deadbeefbbbb'); });
  afterAll(() => { a.close(); b.close(); c.close(); });

  it('prints each service commit without an expected sha', async () => {
    const out = await run([url(a), url(b), url(c)]);
    expect(out).toMatch(/PASS\s+backend commit\s+30d08b1/);
    expect(out).toMatch(/PASS\s+ml commit\s+30d08b1/);
    expect(out).toMatch(/PASS\s+frontend commit\s+deadbee/);
  }, 60000);

  it('FAILs a service whose short sha differs from EXPECTED_SHA', async () => {
    const out = await run([url(a), url(b), url(c), '30d08b1ffffffff']);
    expect(out).toMatch(/PASS\s+backend commit\s+30d08b1/);
    expect(out).toMatch(/FAIL\s+frontend commit\s+live deadbee, expected 30d08b1/);
  }, 60000);
});

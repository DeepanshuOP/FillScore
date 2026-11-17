import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_NAMES } from '../lib.mjs';

// End to end: the real server process, spoken to with the SDK's own client over stdio, against a stub FillScore API on localhost.
const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server.mjs');

function stubApi() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    res.setHeader('content-type', 'application/json');
    if (req.url.startsWith('/api/audit/v2')) return res.end(JSON.stringify({ scoringVersion: 'v2.3.0', result: { grade: 'A' } }));
    if (req.url.startsWith('/api/audit/orders/missing/replay')) { res.statusCode = 404; return res.end(JSON.stringify({ error: 'order_not_found' })); }
    res.end(JSON.stringify({ ok: true }));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

async function withClient(env, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH, ...env } });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  try { return await fn(client); } finally { await client.close(); }
}

test('lists exactly the read-only tools, and calling one reads from the API with the token', async () => {
  const api = await stubApi();
  try {
    await withClient({ FILLSCORE_API_URL: api.url, FILLSCORE_TOKEN: 'tok-xyz' }, async (client) => {
      const { tools } = await client.listTools();
      assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
      const r = await client.callTool({ name: 'fillscore_score', arguments: {} });
      assert.equal(r.isError, undefined);
      assert.equal(JSON.parse(r.content[0].text).result.grade, 'A');
      const miss = await client.callTool({ name: 'fillscore_order_replay', arguments: { orderId: 'missing' } });
      assert.equal(miss.isError, true);
      assert.match(miss.content[0].text, /404/);
    });
    assert.ok(api.seen.length >= 2);
    assert.ok(api.seen.every((s) => s.method === 'GET'), 'only GET requests reached the API');
    assert.ok(api.seen.every((s) => s.auth === 'Bearer tok-xyz'));
  } finally { api.server.close(); }
});

test('an invalid argument never reaches the API', async () => {
  const api = await stubApi();
  try {
    await withClient({ FILLSCORE_API_URL: api.url, FILLSCORE_TOKEN: 't' }, async (client) => {
      let rejected = false, errored = false;
      try { const r = await client.callTool({ name: 'fillscore_rankings', arguments: { by: 'planet' } }); errored = r.isError === true; } catch { rejected = true; }
      assert.ok(rejected || errored);
    });
    assert.equal(api.seen.length, 0);
  } finally { api.server.close(); }
});

test('a demo account needs no token', async () => {
  const api = await stubApi();
  try {
    await withClient({ FILLSCORE_API_URL: api.url, FILLSCORE_DEMO_USER: 'demo-moderate' }, async (client) => {
      await client.callTool({ name: 'fillscore_score', arguments: {} });
    });
    assert.equal(api.seen[0].url, '/api/audit/v2?userId=demo-moderate');
    assert.equal(api.seen[0].auth, undefined);
  } finally { api.server.close(); }
});

test('without configuration the server exits with 2 and says why on stderr, never on stdout', () => {
  const r = spawnSync(process.execPath, [SERVER], { encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 20000 });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /fillscore-mcp:/);
  assert.equal(r.stdout, '');
});

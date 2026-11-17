import test from 'node:test';
import assert from 'node:assert/strict';
import { createTools, TOOL_NAMES } from '../lib.mjs';

// M5: the read-only FillScore MCP server. Its tools only read: every request is a GET to the FillScore API, with the user's own token
// (or a demo id without one). The tools return what the API stored; nothing here computes, predicts or advises.
const API = 'https://api.example.test';
const json = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

function harness(opts = {}, reply = () => json({ ok: true })) {
  const calls = [];
  const fetchFn = async (url, init) => { calls.push({ url: String(url), init }); return reply(url, init); };
  return { calls, tools: createTools({ apiUrl: API, token: 'tok-123', fetchFn, ...opts }) };
}
const byName = (tools, n) => tools.find((t) => t.name === n);

test('the server has exactly these tools', () => {
  const { tools } = harness();
  assert.deepEqual(tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
  assert.deepEqual([...TOOL_NAMES].sort(), ['fillscore_exceptions', 'fillscore_order_replay', 'fillscore_orders_summary', 'fillscore_rankings', 'fillscore_score', 'fillscore_venue_comparison']);
});

test('every tool makes exactly one GET request, never another method, to the expected path', async () => {
  const cases = [
    ['fillscore_score', {}, '/api/audit/v2'],
    ['fillscore_orders_summary', {}, '/api/audit/orders-summary'],
    ['fillscore_exceptions', {}, '/api/audit/exceptions'],
    ['fillscore_exceptions', { includeDismissed: true }, '/api/audit/exceptions?includeDismissed=1'],
    ['fillscore_order_replay', { orderId: 'o22', symbol: 'BTCUSDT' }, '/api/audit/orders/o22/replay?symbol=BTCUSDT'],
    ['fillscore_rankings', { by: 'hour' }, '/api/audit/rankings?by=hour'],
    ['fillscore_venue_comparison', {}, '/api/audit/venue-comparison'],
  ];
  for (const [name, args, path] of cases) {
    const { tools, calls } = harness();
    await byName(tools, name).handler(args);
    assert.equal(calls.length, 1, name);
    assert.equal(calls[0].init.method, 'GET', name);
    assert.equal(calls[0].init.body, undefined, name);
    assert.equal(calls[0].url, API + path, name);
  }
});

test('a redirect is an error, so the token is never re-sent to another host (review)', async () => {
  const { tools, calls } = harness();
  await byName(tools, 'fillscore_score').handler({});
  assert.equal(calls[0].init.redirect, 'error');
});

test('the user\'s own token is sent as a bearer token and nowhere else', async () => {
  const { tools, calls } = harness();
  await byName(tools, 'fillscore_score').handler({});
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok-123');
  assert.ok(!calls[0].url.includes('tok-123'));
});

test('a demo id works without a token (the demo accounts are public and read-only) and sends no Authorization header', async () => {
  const { tools, calls } = harness({ token: undefined, demoUser: 'demo-moderate' });
  await byName(tools, 'fillscore_score').handler({});
  assert.equal(calls[0].url, `${API}/api/audit/v2?userId=demo-moderate`);
  assert.equal(calls[0].init.headers.Authorization, undefined);
});

test('it refuses to start without a token or a demo id, with a demo id that is not a demo, and with an insecure URL', () => {
  assert.throws(() => createTools({ apiUrl: API, fetchFn: async () => json({}) }), /token or a demo/i);
  assert.throws(() => createTools({ apiUrl: API, demoUser: 'someone', fetchFn: async () => json({}) }), /demo-/);
  assert.throws(() => createTools({ apiUrl: 'http://api.example.test', token: 't', fetchFn: async () => json({}) }), /https/i);
  assert.doesNotThrow(() => createTools({ apiUrl: 'http://localhost:3001', token: 't', fetchFn: async () => json({}) }));
  assert.doesNotThrow(() => createTools({ apiUrl: 'http://127.0.0.1:3001', token: 't', fetchFn: async () => json({}) }));
});

test('an order id is encoded into the path, so it cannot change the path', async () => {
  const { tools, calls } = harness();
  await byName(tools, 'fillscore_order_replay').handler({ orderId: '../../x?y=1' });
  assert.equal(calls[0].url, `${API}/api/audit/orders/..%2F..%2Fx%3Fy%3D1/replay`);
});

test('the answer is the API\'s own text, unchanged', async () => {
  const body = { items: [{ orderId: 'o1', finding: 'This order\'s total cost was 20.0 bps.' }] };
  const { tools } = harness({}, () => json(body));
  const r = await byName(tools, 'fillscore_exceptions').handler({});
  assert.equal(r.isError, undefined);
  assert.equal(r.content[0].text, JSON.stringify(body));
});

test('an error answer is reported as an error with its status, and never carries the token', async () => {
  const { tools } = harness({}, () => json({ error: 'order_not_found' }, 404));
  const r = await byName(tools, 'fillscore_order_replay').handler({ orderId: 'nope' });
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /404/);
  assert.ok(!r.content[0].text.includes('tok-123'));
});

test('a network failure is an error result, not a crash, and does not leak the token or a stack trace', async () => {
  const { tools } = harness({}, () => { throw new Error('connect ECONNREFUSED with Bearer tok-123'); });
  const r = await byName(tools, 'fillscore_score').handler({});
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /could not reach FillScore/i);
  assert.ok(!r.content[0].text.includes('tok-123'));
  assert.ok(!r.content[0].text.includes('    at '));
});

test('a very long error body is cut', async () => {
  const { tools } = harness({}, () => ({ ok: false, status: 500, text: async () => 'x'.repeat(5000) }));
  const r = await byName(tools, 'fillscore_score').handler({});
  assert.ok(r.content[0].text.length < 700);
});

test('every description says the tool is read-only and about past executions, and has no advice or causal word', () => {
  const { tools } = harness();
  const bad = /\b(should|recommend\w*|consider|better to|ought|must|opportunit\w*|could (have|save)|would (have|save)|saved|savings?|because|due to|caused by|compliant|compliance)\b/i;
  for (const t of tools) {
    assert.match(t.description, /read-only/i, t.name);
    assert.match(t.description, /past/i, t.name);
    assert.doesNotMatch(t.description, bad, t.name);
  }
});

test('input is validated: a bad `by` or symbol is refused by the tool schema', () => {
  const { tools } = harness();
  const rank = byName(tools, 'fillscore_rankings').inputSchema.by;
  assert.equal(rank.safeParse('symbol').success, true);
  assert.equal(rank.safeParse('planet').success, false);
  const sym = byName(tools, 'fillscore_order_replay').inputSchema.symbol;
  assert.equal(sym.safeParse('BTCUSDT').success, true);
  assert.equal(sym.safeParse('btc usdt').success, false);
  assert.equal(sym.safeParse(undefined).success, true);
});

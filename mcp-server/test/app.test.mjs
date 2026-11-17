// The MCP App (M7): an interactive scorecard that an AI client shows inside the conversation. It is the view of the existing read-only tool
// `fillscore_score`: the numbers are the ones that tool returns (stored by FillScore's deterministic code); the page arranges them and says
// "insufficient data" for what was not measured. It makes no request of its own, loads nothing from the network, and renders text only.
//
// Protocol facts (MCP Apps specification 2026-01-26, https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx):
// the resource is `ui://...` with MIME type `text/html;profile=mcp-app`; the tool names it in `_meta.ui.resourceUri`; the view sends
// `ui/initialize` (params appCapabilities, appInfo, protocolVersion) and then the notification `ui/notifications/initialized`; the host sends
// `ui/notifications/tool-result` with the tool's result (content, structuredContent, _meta).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describeScorecard } from '../ui/scorecardView.mjs';
import { buildScorecardHtml, SCORECARD_URI, APP_MIME, PROTOCOL_VERSION } from '../app.mjs';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server.mjs');

const api = (over = {}) => ({
  label: 'v2 (measured)', scoringVersion: 'v2.3.0', measureVersion: '1.0.0', integrityHash: 'ab12cd34ef567890' + '0'.repeat(48),
  result: {
    components: { execution: { score: 92.4, measured: 25, unmeasured: 0, reason: null }, fees: { score: 88.0, measured: 30, unmeasured: 2, reason: null },
      unfilled: { score: null, measured: 0, unmeasured: 4, reason: 'insufficient data' } },
    composite: 90.2, grade: 'A', band: [88.1, 92.0], reason: null, orders: 30, fills: 55,
  },
  costVsExpected: { insufficient: false, n: 25, paidBps: 1.25, expectedBps: 0.5, excessBps: 0.75, lowBps: 0.1, highBps: 1.4, level: 0.9 },
  ...over,
});

test('the scorecard states grade, version, counts, components and cost vs expected from the tool result only', () => {
  const m = describeScorecard(api());
  assert.equal(m.headline, 'A · 90 / 100');
  assert.deepEqual(m.lines.slice(0, 2), ['Score band 88.1 to 92.0.', 'Scoring version v2.3.0, measurement version 1.0.0. Based on 30 orders and 55 fills.']);
  assert.deepEqual(m.components, [
    'Execution: 92 (25 measured)', 'Fees: 88 (30 measured, 2 not measured)', 'Unfilled: insufficient data (0 measured, 4 not measured)']);
  assert.match(m.cost, /^Market orders cost 1\.3 bps against 0\.50 bps, the modelled cost of a taker event of the same size in the hour before the order/);
  assert.match(m.cost, /difference \+0\.75 bps; 90% interval \+0\.10 bps to \+1\.4 bps, a bootstrap over orders that leaves out the model's own error; 25 orders\)\.$/);
  assert.equal(m.integrity, 'Integrity hash ab12cd34ef567890… (FillScore can recompute it from the stored inputs).');
});

test('a score without a letter says why, and cost vs expected is "insufficient data" when absent or too small', () => {
  const none = describeScorecard(api({ result: { components: {}, composite: null, grade: null, band: [60, 70], reason: 'fewer than 20 measured fills', orders: 5, fills: 5 }, costVsExpected: undefined }));
  assert.equal(none.headline, 'No letter grade');
  assert.ok(none.lines.includes('Fewer than 20 measured fills (5 so far).') || none.lines.includes('fewer than 20 measured fills'));
  assert.equal(none.cost, 'Cost vs expected: insufficient data.');
  const few = describeScorecard(api({ costVsExpected: { insufficient: true, n: 3, reason: 'fewer than 20 market orders have an expected cost (found 3)' } }));
  assert.equal(few.cost, 'Cost vs expected: insufficient data (fewer than 20 market orders have an expected cost (found 3)).');
});

test('a demo account is labelled, and an unreadable result is "insufficient data", not a number', () => {
  assert.match(describeScorecard(api({ demo: { dataSource: 'synthetic-demo' } })).note, /Demo account: the trading behaviour is synthetic/);
  const bad = describeScorecard('not json');
  assert.equal(bad.headline, 'The scorecard could not be read.');
  assert.deepEqual(bad.components, []);
  assert.equal(describeScorecard({ error: 'no_v2_score', message: 'No measured score yet.' }).headline, 'No measured score yet.');
});

test('the copy is past tense and advice-free', () => {
  const m = describeScorecard(api());
  const text = [m.headline, ...m.lines, ...m.components, m.cost, m.integrity].join(' ');
  assert.doesNotMatch(text, /\b(should|could save|you must|recommend|will likely|because|caused|due to)\b/i);
});

const html = buildScorecardHtml();

test('the page loads nothing from the network, uses no markup injection and no eval', () => {
  assert.doesNotMatch(html, /https?:\/\//i);
  assert.doesNotMatch(html, /<script[^>]*\ssrc=|<link[^>]*href=|<img|<iframe|@import|url\(/i);
  assert.doesNotMatch(html, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/);
  assert.ok(html.includes('ui/initialize') && html.includes('ui/notifications/tool-result'));
});

function runView() {
  const sent = [], listeners = [];
  const el = (tag) => ({ tag, children: [], textContent: '', className: '', appendChild(c) { this.children.push(c); return c; }, replaceChildren(...c) { this.children = c; } });
  const root = el('div');
  const parent = { postMessage: (m, origin) => sent.push({ m, origin }) };
  const window = { parent, addEventListener: (t, f) => { if (t === 'message') listeners.push(f); } };
  const document = { getElementById: () => root, createElement: el };
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  vm.runInNewContext(script, { window, document, JSON, Math, String, Number, Array, Object, console });
  const deliver = (data, source = parent) => listeners.forEach((f) => f({ data, source }));
  const texts = () => { const out = []; const walk = (n) => { if (n.textContent) out.push(n.textContent); n.children.forEach(walk); }; walk(root); return out; };
  return { sent, deliver, texts, parent };
}

test('the view starts the handshake, reports itself initialized, and shows the tool result it is sent by the host', () => {
  const v = runView();
  assert.equal(v.sent[0].m.method, 'ui/initialize');
  assert.equal(v.sent[0].m.id, 0);
  assert.equal(v.sent[0].m.params.protocolVersion, PROTOCOL_VERSION);
  assert.equal(v.sent[0].m.params.appInfo.name, 'FillScore scorecard');
  v.deliver({ jsonrpc: '2.0', id: 0, result: { hostContext: {}, hostCapabilities: {}, hostInfo: {} } });
  assert.deepEqual(JSON.parse(JSON.stringify(v.sent[1].m)), { jsonrpc: '2.0', method: 'ui/notifications/initialized' });   // JSON: the object was made inside the vm context
  v.deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: JSON.stringify(api()) }] } });
  const t = v.texts().join('\n');
  assert.match(t, /A · 90 \/ 100/);
  assert.match(t, /Execution: 92 \(25 measured\)/);
});

test('the view ignores messages that do not come from the host window and messages it does not know', () => {
  const v = runView();
  v.deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: JSON.stringify(api()) }] } }, { other: true });
  assert.deepEqual(v.texts(), []);
  v.deliver({ jsonrpc: '2.0', method: 'something/else', params: {} });
  v.deliver('a string');
  v.deliver(null);
  assert.deepEqual(v.texts(), []);
});

test('hostile text in the result is shown as text, never as markup', () => {
  const v = runView();
  v.deliver({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: { content: [{ type: 'text', text: JSON.stringify(api({ scoringVersion: '<img src=x onerror=alert(1)>' })) }] } });
  assert.ok(v.texts().join('\n').includes('<img src=x onerror=alert(1)>'));      // present as a text node's content, not parsed
});

function stub() {
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(api())); });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

test('the real server offers the view for fillscore_score only, as a ui:// resource with the MCP App MIME type', async () => {
  const s = await stub();
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], env: { PATH: process.env.PATH, FILLSCORE_API_URL: s.url, FILLSCORE_TOKEN: 't' } }));
  try {
    const { tools } = await client.listTools();
    for (const t of tools) {
      if (t.name === 'fillscore_score') assert.equal(t._meta?.ui?.resourceUri, SCORECARD_URI);
      else assert.equal(t._meta?.ui, undefined, t.name);
    }
    const { resources } = await client.listResources();
    assert.deepEqual(resources.map((r) => [r.uri, r.mimeType]), [[SCORECARD_URI, APP_MIME]]);
    const read = await client.readResource({ uri: SCORECARD_URI });
    assert.equal(read.contents[0].mimeType, APP_MIME);
    assert.equal(read.contents[0].text, html);
    assert.deepEqual(read.contents[0]._meta?.ui?.csp ?? {}, {}, 'no external origin is requested: the default CSP stays closed');
  } finally { await client.close(); s.server.close(); }
});

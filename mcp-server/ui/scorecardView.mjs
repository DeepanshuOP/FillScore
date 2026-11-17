// Pure view model of the scorecard (MCP App). Input: the parsed JSON of GET /api/audit/v2 (what the tool `fillscore_score` returns).
// Every number comes from that JSON, where deterministic code stored it; the sentences only arrange it, in past tense, and say
// "insufficient data" for what was not measured. No advice, no cause. This file is also inlined, with its `export` keywords removed, into
// the page that the host shows (app.mjs), so it must stay plain JavaScript with no imports.

function formatBps(v) {
  if (typeof v !== 'number' || !isFinite(v)) return 'insufficient data';
  if (v === 0) return '0.0 bps';
  var a = Math.abs(v);
  if (a < 0.01) return v > 0 ? '<0.01 bps' : '>-0.01 bps';
  return v.toFixed(a >= 1 ? 1 : 2) + ' bps';
}

function signedBps(v) {
  return (typeof v === 'number' && v > 0 ? '+' : '') + formatBps(v);
}

function capitalise(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function costLine(c) {
  if (!c || typeof c !== 'object') return 'Cost vs expected: insufficient data.';
  if (c.insufficient) return 'Cost vs expected: insufficient data (' + String(c.reason) + ').';
  var interval = typeof c.lowBps === 'number' && typeof c.highBps === 'number'
    ? Math.round(c.level * 100) + '% interval ' + signedBps(c.lowBps) + ' to ' + signedBps(c.highBps) + ", a bootstrap over orders that leaves out the model's own error"
    : 'no interval';
  return 'Market orders cost ' + formatBps(c.paidBps) + ' against ' + formatBps(c.expectedBps)
    + ', the modelled cost of a taker event of the same size in the hour before the order (fitted on January 2024) (difference '
    + signedBps(c.excessBps) + '; ' + interval + '; ' + c.n + ' orders).';
}

export function describeScorecard(api) {
  var unreadable = { headline: 'The scorecard could not be read.', lines: [], components: [], cost: '', integrity: '', note: '' };
  if (!api || typeof api !== 'object' || Array.isArray(api)) return unreadable;
  if (typeof api.error === 'string' && !api.result) return { headline: typeof api.message === 'string' ? api.message : 'The scorecard could not be read.', lines: [], components: [], cost: '', integrity: '', note: '' };
  var r = api.result;
  if (!r || typeof r !== 'object') return unreadable;

  var lines = [];
  if (Array.isArray(r.band) && typeof r.band[0] === 'number' && typeof r.band[1] === 'number') lines.push('Score band ' + r.band[0].toFixed(1) + ' to ' + r.band[1].toFixed(1) + '.');
  if (typeof r.reason === 'string' && r.reason) {
    var starts = r.reason.indexOf('fewer than') === 0;
    lines.push(starts ? capitalise(r.reason) + ' (' + r.fills + ' so far).' : capitalise(r.reason) + '.');
  }
  lines.push('Scoring version ' + api.scoringVersion + ', measurement version ' + api.measureVersion + '. Based on ' + r.orders + ' orders and ' + r.fills + ' fills.');

  var comps = [];
  var cs = r.components && typeof r.components === 'object' ? r.components : {};
  Object.keys(cs).forEach(function (k) {
    var c = cs[k] || {};
    var score = typeof c.score === 'number' ? String(Math.round(c.score)) : 'insufficient data';
    comps.push(capitalise(k) + ': ' + score + ' (' + c.measured + ' measured' + (c.unmeasured ? ', ' + c.unmeasured + ' not measured' : '') + ')');
  });

  var graded = r.grade && typeof r.composite === 'number';
  return {
    headline: graded ? r.grade + ' · ' + Math.round(r.composite) + ' / 100' : 'No letter grade',
    lines: lines,
    components: comps,
    cost: costLine(api.costVsExpected),
    integrity: typeof api.integrityHash === 'string' ? 'Integrity hash ' + api.integrityHash.slice(0, 16) + '… (FillScore can recompute it from the stored inputs).' : '',
    note: api.demo ? 'Demo account: the trading behaviour is synthetic; every fill price comes from real public prints.' : '',
  };
}

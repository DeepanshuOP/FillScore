/**
 * View models for the M4 panels: the exception queue, the rankings and the order replay. Pure. Every number shown comes
 * from the API, which reads stored measurements; the sentences here only arrange them, in past tense. A value that was not
 * computed reads "not computed" or "insufficient data", never zero.
 */
import { formatSignedBps as formatBps, formatUsd } from '../ui/format';

/** The fixed headings of the panel. Tested against the advice and causal terms. */
export const PANEL_COPY = {
  queueTitle: 'Orders that met a rule',
  rankingsTitle: 'Execution cost, ranked only where there are enough orders',
  venuesTitle: 'Venues, from the account\'s own fills matched by symbol and size',
  showDismissed: 'Show dismissed',
} as const;

const usd = formatUsd;

// The shapes of the API answers (backend/src/routes/explain.ts), as far as this view reads them.
export interface QueueItemApi { orderId: string; symbol: string; rules: string[]; finding: string; usd: number; totalBps: number; state: string }
export interface QueueApi {
  items: QueueItemApi[]; total: number; checked: number; skipped: number; thresholds: { minOrders: number; p90TotalBps: number } | null;
  note: string | null; reviewCounts?: { open: number; reviewed: number; dismissed: number };
}
export interface RankGroupApi { key: string; n: number; median: number | null; low: number | null; high: number | null; status: string; rank: number | null; tiedWith: string[] }
export interface RankingsApi { by: string; level: number; minOrders: number; groups: RankGroupApi[] }
export interface ReplayApi {
  fills: Array<{ time: string; price: number; quantity: number; notional: number; feeUsd: number | null }>;
  decomposition: Array<{ label: string; bps: number | null; usd: number | null; partOf?: string; source: { field: string } }>;
  expectedCost: { expectedBps: number | null; lowBps: number | null; highBps: number | null; level: number; reason: string | null } | null;
  sources: Array<{ label: string; url: string | null; sha256: string }>;
  notes: string[];
}
export interface VenueApi {
  note: string | null;
  buckets: Array<{ symbol: string; bucket: string; note: string | null; venues: RankGroupApi[] }>;
}

const RULE_LABELS: Record<string, string> = {
  'above-expected-interval': 'Above the expected interval',
  'unfilled-cost': 'Unfilled order',
  'high-total-cost': 'High total cost',
};
const STATE_LABELS: Record<string, string> = { open: 'Open', reviewed: 'Reviewed', dismissed: 'Dismissed' };

export interface QueueItemView { orderId: string; symbol: string; finding: string; usd: string; ruleLabels: string[]; state: string; stateLabel: string }
export interface QueueView {
  kind: 'items' | 'empty' | 'insufficient' | 'error';
  summary: string | null;
  threshold: string | null;
  note: string | null;
  items: QueueItemView[];
  counts: string | null;
}

export function describeQueue(status: number, body: unknown): QueueView {
  const none = { summary: null, threshold: null, note: null, items: [], counts: null };
  if (status !== 200 || !body) return { kind: 'error', ...none, note: 'The exception queue could not be loaded.' };
  const b = body as QueueApi;
  const skipped = b.skipped > 0 ? ` (${b.skipped} order${b.skipped === 1 ? '' : 's'} without a measurement ${b.skipped === 1 ? 'was' : 'were'} not checked)` : '';
  const summary = `${b.total} of ${b.checked} measured orders met a rule${skipped}.`;
  const threshold = b.thresholds
    ? `The 90th percentile of the account's own total cost was ${formatBps(b.thresholds.p90TotalBps)}; rules that use it need ${b.thresholds.minOrders} measured orders.` : null;
  const counts = b.reviewCounts ? `Open: ${b.reviewCounts.open}, reviewed: ${b.reviewCounts.reviewed}, dismissed: ${b.reviewCounts.dismissed}` : null;
  const items: QueueItemView[] = b.items.map(i => ({
    orderId: i.orderId, symbol: i.symbol, finding: i.finding, usd: usd(i.usd), ruleLabels: i.rules.map(r => RULE_LABELS[r] ?? r),
    state: i.state, stateLabel: STATE_LABELS[i.state] ?? i.state,
  }));
  if (b.note) return { kind: 'insufficient', summary, threshold, note: b.note, items, counts };
  return { kind: items.length ? 'items' : 'empty', summary, threshold, note: null, items, counts };
}

/** The buttons for an order's review state: none on a demo account (read-only). */
export function nextStates(state: string, readOnly: boolean): Array<[string, string]> {
  if (readOnly) return [];
  if (state === 'open') return [['reviewed', 'Mark reviewed'], ['dismissed', 'Dismiss']];
  if (state === 'reviewed') return [['open', 'Reopen'], ['dismissed', 'Dismiss']];
  return [['open', 'Reopen']];
}

export function describeRankings(body: RankingsApi): { rows: string[] } {
  if (!body.groups.length) return { rows: ['Insufficient data: no measured orders.'] };
  const pct = Math.round(body.level * 100);
  return {
    rows: body.groups.map(g => {
      if (g.status !== 'ranked') return `${g.key}: too few to tell (${g.n} orders; ${body.minOrders} are needed).`;
      const tie = g.tiedWith.length ? `; not distinguishable from ${g.tiedWith.join(', ')}` : '';
      return `${g.key}: median ${formatBps(g.median)} (${pct}% interval ${formatBps(g.low)} to ${formatBps(g.high)}), ${g.n} orders, rank ${g.rank}${tie}.`;   // a ranked group always has its numbers
    }),
  };
}

export interface ReplayView {
  error: string | null;
  figures: Array<{ label: string; value: string; source: string; indent: boolean }>;
  expected: string | null;
  sources: Array<{ label: string; url: string | null; hash: string }>;
  notes: string[];
  fills: Array<{ time: string; text: string }>;
}

export function describeReplay(status: number, bodyIn: unknown): ReplayView {
  const body = bodyIn as ReplayApi | null;
  const empty = { figures: [], expected: null, sources: [], notes: [], fills: [] };
  if (status === 404) return { error: 'This order was not found for this account.', ...empty };
  if (status !== 200 || !body) return { error: 'The replay could not be loaded.', ...empty };
  const figures = body.decomposition.map(f => ({
    label: f.label,
    value: f.bps === null ? 'not computed' : `${formatBps(f.bps)}${f.usd === null ? '' : `, ${usd(f.usd)}`}`,
    source: String(f.source.field), indent: !!f.partOf,
  }));
  const ec = body.expectedCost;
  const expected = !ec ? null : ec.expectedBps === null
    ? `Expected cost: insufficient data (${ec.reason ?? 'no reason was stored'}).`
    : `Modelled cost of a taker event of the same size in the hour before the order: ${formatBps(ec.expectedBps)}`
      + (ec.lowBps !== null && ec.highBps !== null ? ` (${Math.round(ec.level * 100)}% interval ${formatBps(ec.lowBps)} to ${formatBps(ec.highBps)} for one event).` : ` (${ec.reason ?? 'no interval'}).`);
  return {
    error: null, figures, expected,
    sources: body.sources.map(s => ({ label: s.label, url: s.url, hash: `${String(s.sha256).slice(0, 8)}…${String(s.sha256).slice(-4)}` })),
    notes: body.notes ?? [],
    fills: body.fills.map(f => ({ time: f.time, text: `${f.quantity} at ${f.price} (${usd(f.notional)})${f.feeUsd === null ? '' : `, fee ${usd(f.feeUsd)}`}` })),
  };
}

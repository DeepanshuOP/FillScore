/**
 * View model for the measured order views (GET /api/audit/orders-summary): how orders ended, how long limit orders
 * rested, the implementation shortfall and the cost of unfilled orders. Pure: every number is copied from the API,
 * which computed it from stored documents. A block that was not measured is null, never zero.
 */
import { formatSignedBps, formatUsd } from '../ui/format';

interface Median { execution: number | null; spread: number | null; impactTiming: number | null; opportunity: number | null; total: number | null }
/** Total over all measured orders for one term: USD, bps of the intended notional of the orders that have it, their count. */
interface Term { usd: number; bps: number; n: number }
interface Totals { execution: Term | null; spread: Term | null; impactTiming: Term | null; opportunity: Term | null; fees: Term | null; total: Term | null }
export interface OrdersBody {
  available?: boolean;
  orders?: { total: number; filled: number; partial: number; unfilled: number; open: number };
  restingMs?: { n: number; medianMs: number | null; p90Ms: number | null } | null;
  shortfall?: { n: number; unmeasured: number; medianBps: Median; totals?: Totals | null } | null;
  unfilled?: { n: number; medianOpportunityBps: number | null } | null;
}
export interface OrdersView {
  outcomes: Array<[string, string]>;
  resting: { median: string; p90: string; n: string } | null;
  shortfall: Array<[string, string]> | null;
  totals: Array<{ label: string; usd: string; bps: string; n: string }> | null;
  shortfallNote: string | null;
  unfilledNote: string | null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function formatMs(ms: number | null | undefined): string {
  if (!isNum(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${(ms / 60_000).toFixed(1)} min`;
}

const bps = formatSignedBps;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const TERM_LABELS: Array<[keyof Totals, string]> = [
  ['execution', 'Execution cost'], ['spread', 'Spread paid'], ['impactTiming', 'Impact and timing'],
  ['opportunity', 'Unfilled orders'], ['fees', 'Fees'], ['total', 'Total'],
];

const LEAD = ['Execution cost', 'Unfilled orders', 'Fees', 'Total'];

/** The cost lines that lead the measured-score panel, beside the letter: the shortfall terms the score is made of, in
 *  dollars and bps of intended notional. null when the orders were not measured (never zeros). */
export function leadBreakdown(body: unknown): Array<{ label: string; usd: string; bps: string; n: string }> | null {
  const t = describeOrders(body)?.totals;
  if (!t) return null;
  return LEAD.map(l => t.find(r => r.label === l)!);
}

export function describeOrders(body: unknown): OrdersView | null {
  const b = body as OrdersBody | null;
  if (!b || b.available !== true || !b.orders) return null;
  const o = b.orders;
  const m = b.shortfall?.medianBps;
  return {
    outcomes: [['Orders', String(o.total)], ['Filled', String(o.filled)], ['Partly filled', String(o.partial)],
      ['Unfilled', String(o.unfilled)], ['Still open', String(o.open)]],
    resting: b.restingMs ? { median: formatMs(b.restingMs.medianMs), p90: formatMs(b.restingMs.p90Ms),
      n: `${b.restingMs.n} limit orders with a fill` } : null,
    shortfall: m ? [['Execution cost', bps(m.execution)], ['Spread paid', bps(m.spread)], ['Impact and timing', bps(m.impactTiming)],
      ['Unfilled part', bps(m.opportunity)], ['Total', bps(m.total)]] : null,
    totals: b.shortfall?.totals
      ? TERM_LABELS.map(([k, label]) => {
        const t = b.shortfall!.totals![k];
        return t ? { label, usd: formatUsd(t.usd), bps: bps(t.bps), n: plural(t.n, 'order', 'orders') }
          : { label, usd: 'not computed', bps: 'not computed', n: '' };
      })
      : null,
    shortfallNote: b.shortfall
      ? `Median of ${plural(b.shortfall.n, 'measured order', 'measured orders')}${b.shortfall.unmeasured > 0
        ? `; ${plural(b.shortfall.unmeasured, 'order was', 'orders were')} not measured` : ''}.`
      : null,
    unfilledNote: b.unfilled
      ? `${plural(b.unfilled.n, 'unfilled order', 'unfilled orders')}; ${b.unfilled.n === 1 ? 'its' : 'their'} median cost of not filling: ${bps(b.unfilled.medianOpportunityBps)}.`
      : null,
  };
}

/**
 * View model for the measured score (Scoring v2, GET /api/audit/v2). Pure: every number shown comes from the API,
 * which comes from deterministic ml-service code. No letter is ever shown below the minimum sample.
 */
import { formatBpsDisplay as formatBps } from '../utils/formatBps';   // display only: a true minus (U+2212)

export interface V2Component { score: number | null; measured: number; unmeasured: number; reason: string | null }
/** What the market orders cost against what taker events of the same size cost in the same hour (ml-service
 *  expected_cost.aggregate.cost_vs_expected). Beside the result, never inside it: it is not part of the score. */
export type CostVsExpected =
  | { insufficient: true; n: number; reason: string; excluded?: Record<string, number> }
  | { insufficient: false; n: number; level: number; paidBps: number; expectedBps: number; excessBps: number;
      lowBps: number | null; highBps: number | null; version: string; calibrationSha256: string; excluded?: Record<string, number> };

export interface V2Response {
  label: string;
  scoringVersion: string;
  versionFileSha256: string;
  measureVersion: string;
  integrityHash: string;
  computedAt: string | null;
  /** Present only for a rebuilt demo account (M2): its grade comes from the offline build, not a stored score. */
  demo?: { dataSource: 'synthetic-demo'; basis: string };
  costVsExpected?: CostVsExpected;
  result: {
    components: Record<string, V2Component>;
    composite: number | null;
    grade: string | null;
    band: [number, number] | null;
    reason: string | null;
    orders: number;
    fills: number;
    /** v2.3.0 and later: timing is reported, never scored. */
    timing?: { scored: false; fills: number; fillsAboveFloor: number; meanExcessBps: number | null; message: string };
  };
}

export interface V2Message { kind: 'demo' | 'pending' | 'error'; message: string }
export interface V2Scored {
  kind: 'graded' | 'band';
  label: string;
  headline: string;
  detail: string | null;
  range: string | null;
  components: Array<{ key: string; name: string; value: string; counts: string }>;
  version: string;
  hashShort: string;
  computedAt: string | null;
  /** Provenance note for a rebuilt demo account; null for a real account. */
  note: string | null;
  /** v2.3.0 and later: what the audit found about the hour of the day (information, not scored); null before. */
  timingNote: string | null;
  /** v2.3.0 and later: market-order cost against the expected cost, with its interval, or "insufficient data"; null before. */
  costVsExpected: string | null;
}

const signed = (v: number) => (v > 0 ? '+' : '') + formatBps(v);

/** The line beside the letter. Every number comes from the API; the sentence only arranges them, in past tense. */
export function costVsExpectedLine(c: CostVsExpected | undefined): string {
  if (!c) return 'Cost vs expected: insufficient data (no market context was stored for these orders).';
  if (c.insufficient) return `Cost vs expected: insufficient data (${c.reason}).`;
  // The benchmark is a fitted model evaluated at the order's hour context, not an observed cost; the interval is a bootstrap
  // over the account's orders and does not contain the model's own error (which is wider): the sentence says both.
  const interval = c.lowBps !== null && c.highBps !== null
    ? `${Math.round(c.level * 100)}% interval ${signed(c.lowBps)} to ${signed(c.highBps)}, a bootstrap over orders that leaves out the model's own error` : 'no interval';
  return `Market orders cost ${formatBps(c.paidBps)} against ${formatBps(c.expectedBps)}, the modelled cost of a taker event of the same size in the hour before the order `
    + `(fitted on January 2024) (difference ${signed(c.excessBps)}; ${interval}; ${c.n} orders).`;
}

export const DEMO_NOTE = 'Demo trader: the trading behaviour is synthetic; every fill price comes from real public prints '
  + 'of January 2024. Its fees were generated at the published rate, so the fee component is not independently measured.';
export type V2View = V2Message | V2Scored;

export function isScored(v: V2View): v is V2Scored {
  return v.kind === 'graded' || v.kind === 'band';
}

const ORDER: Array<[string, string]> = [['slippage', 'Slippage'], ['fees', 'Fees'], ['timing', 'Timing'], ['spread', 'Spread']];
/** v2.3.0 (ADR-0014): the scored components are the terms of the implementation shortfall, named as on the cost panel. */
const SHORTFALL_ORDER: Array<[string, string]> = [['execution', 'Execution cost'], ['fees', 'Fees'], ['unfilled', 'Unfilled orders']];

export function describeV2(status: number, body: unknown): V2View {
  if (status === 404) {
    const err = (body as { error?: string } | null)?.error;
    if (err === 'v2_not_available_for_demo') {
      return { kind: 'demo', message: 'The measured score (v2) is not available for demo accounts yet. They are being rebuilt from real market prints.' };
    }
    return { kind: 'pending', message: 'No measured score yet. It is computed after your trades are synced and measured.' };
  }
  if (status !== 200 || !body) return { kind: 'error', message: 'The measured score could not be loaded.' };
  const b = body as V2Response;
  const r = b.result;
  const range = r.band ? `95% range ${Math.round(r.band[0])}–${Math.round(r.band[1])}` : null;
  const isDemo = !!b.demo;
  const components = ('execution' in r.components ? SHORTFALL_ORDER : ORDER).map(([key, name]) => {
    const c = r.components[key];
    const shown = c && c.score !== null ? String(Math.round(c.score)) : 'insufficient data';
    return {
      key, name,
      value: isDemo && key === 'fees' && c && c.score !== null ? `${shown} (not independently measured)` : shown,
      counts: c ? `${c.measured} measured, ${c.unmeasured} not measured` : '0 measured',
    };
  });
  const common = {
    label: 'v2 · measured', range, components, version: b.scoringVersion,
    hashShort: `${b.integrityHash.slice(0, 8)}…${b.integrityHash.slice(-4)}`, computedAt: b.computedAt,
    note: isDemo ? DEMO_NOTE : null,
    timingNote: r.timing ? `Timing, not scored: ${r.timing.message}` : null,
    costVsExpected: 'execution' in r.components ? costVsExpectedLine(b.costVsExpected) : null,
  };
  if (r.grade && r.composite !== null) {
    return { kind: 'graded', headline: `${r.grade} · ${Math.round(r.composite)} / 100`, detail: null, ...common };
  }
  const detail = r.reason?.startsWith('fewer than')
    ? `${r.reason.charAt(0).toUpperCase()}${r.reason.slice(1)} (${r.fills} so far).`
    : 'At least one component had insufficient data, so no overall score was computed.';
  return { kind: 'band', headline: 'No letter grade', detail, ...common };
}

/** The badge beside the hash. "Verified" is earned only by a verify answer of 200 with match true in this session. */
export function verifyBadge(status: number | null, body: unknown, verifiable: boolean): { label: string; tone: 'good' | 'bad' | 'neutral' } {
  if (!verifiable) return { label: 'Offline build, hash recorded', tone: 'neutral' };
  if (status === 200) {
    return (body as { match?: boolean } | null)?.match === true ? { label: 'Verified', tone: 'good' } : { label: 'Verification failed', tone: 'bad' };
  }
  return { label: 'Not checked', tone: 'neutral' };
}

export function describeVerify(status: number, body: unknown): string {
  if (status === 200) {
    return (body as { match?: boolean } | null)?.match
      ? 'Integrity check passed: the hash was recomputed from the stored inputs and matched.'
      : 'Integrity check failed: the recomputed hash did not match the stored one.';
  }
  if (status === 404) return 'No measured score is stored yet, so there was nothing to verify.';
  return 'The verification service was unavailable. Nothing was checked.';
}

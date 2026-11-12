/**
 * View model for the measured score (Scoring v2, GET /api/audit/v2). Pure: every number shown comes from the API,
 * which comes from deterministic ml-service code. No letter is ever shown below the minimum sample.
 */
export interface V2Component { score: number | null; measured: number; unmeasured: number; reason: string | null }
export interface V2Response {
  label: string;
  scoringVersion: string;
  versionFileSha256: string;
  measureVersion: string;
  integrityHash: string;
  computedAt: string | null;
  /** Present only for a rebuilt demo account (M2): its grade comes from the offline build, not a stored score. */
  demo?: { dataSource: 'synthetic-demo'; basis: string };
  result: {
    components: Record<string, V2Component>;
    composite: number | null;
    grade: string | null;
    band: [number, number] | null;
    reason: string | null;
    orders: number;
    fills: number;
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
}

export const DEMO_NOTE = 'Demo trader: the trading behaviour is synthetic; every fill price comes from real public prints '
  + 'of January 2024. Its fees were generated at the published rate, so the fee component is not independently measured.';
export type V2View = V2Message | V2Scored;

export function isScored(v: V2View): v is V2Scored {
  return v.kind === 'graded' || v.kind === 'band';
}

const ORDER: Array<[string, string]> = [['slippage', 'Slippage'], ['fees', 'Fees'], ['timing', 'Timing'], ['spread', 'Spread']];

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
  const components = ORDER.map(([key, name]) => {
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
  };
  if (r.grade && r.composite !== null) {
    return { kind: 'graded', headline: `${r.grade} · ${Math.round(r.composite)} / 100`, detail: null, ...common };
  }
  const detail = r.reason?.startsWith('fewer than')
    ? `${r.reason.charAt(0).toUpperCase()}${r.reason.slice(1)} (${r.fills} so far).`
    : 'At least one component had insufficient data, so no overall score was computed.';
  return { kind: 'band', headline: 'No letter grade', detail, ...common };
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

export interface CouncilFinding {
  action_type: 'maker_instead_of_taker' | 'exclude_hours' | 'venue_shift' | 'smaller_clips';
  params: Record<string, unknown>;
  text: string;
  effect_usd: number;
  effect_bps: number;
  n_trades_affected: number;
  method: string;
  verified: boolean;
}

export interface CouncilObservation {
  action_type: 'none' | 'general';
  text: string;
}

export interface CouncilGrounding {
  violations_first_pass: number;
  regenerations: number;
  redactions: { agent: string; field: string; sentence_index: number; n_tokens: number; kinds: string[] }[];
  numbers_checked: number;
  faithfulness_first_pass: number | null;
  faithfulness_after: number | null;
  per_agent: Record<string, unknown>;
}

export interface CouncilVerification {
  proposed: number;
  passed: number;
  observations: number;
  rejected: { action: string; params: unknown; reason: string }[];
  re_reasoned: number;
  dropped: { action: string; params: unknown; reason: string }[];
}

function withCommas(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Deterministic, Intl-free USD formatting: $1,330.00 / -$2.95. */
export function formatEffectUsd(x: number): string {
  const fixed = Math.abs(x).toFixed(2);
  const [i, d] = fixed.split('.');
  const neg = x < 0 && Number(fixed) !== 0;
  return `${neg ? '-' : ''}$${withCommas(i)}.${d}`;
}

export function formatEffectBps(x: number): string {
  return `${x.toFixed(1)} bps`;
}

export function groundingLine(g: CouncilGrounding | null | undefined): string {
  if (!g) return '';
  const n = g.numbers_checked;
  let s = `${n} ${n === 1 ? 'number' : 'numbers'} checked, ${g.violations_first_pass} flagged`;
  const removed = g.redactions?.length ?? 0;
  if (removed > 0) s += `, ${removed} removed`;
  return s;
}

export function verificationLine(v: CouncilVerification | null | undefined): string {
  if (!v) return '';
  const dropped = v.dropped?.length ?? 0;
  const replayable = v.proposed + v.re_reasoned - v.observations;   // observations have no effect to replay
  if (replayable <= 0) return '';
  return `${v.passed} of ${replayable} proposed findings verified by replaying your trades${
    dropped ? `; ${dropped} dropped` : ''
  }`;
}

export const NO_FINDINGS_MESSAGE =
  'No counterfactual passed the materiality threshold (≥ max($1, 0.5% of fees)).'; // wording fixed by the brief; the gate itself is strict (>), see verification.py

/** The empty-state line for a complete (non-degraded) run whose verified findings list is empty, else ''. */
export function noFindingsLine(
  synthesis: { degraded?: boolean; findings?: CouncilFinding[] } | null | undefined,
): string {
  if (!synthesis || synthesis.degraded) return '';
  return splitFindings(synthesis).findings.length === 0 ? NO_FINDINGS_MESSAGE : '';
}

/** Only verified findings with a finite recomputed effect are ever shown with a dollar value. */
export function splitFindings(
  synthesis: { findings?: CouncilFinding[]; observations?: CouncilObservation[] } | null | undefined,
): { findings: CouncilFinding[]; observations: CouncilObservation[] } {
  const findings = (synthesis?.findings ?? []).filter(
    (f) => f && f.verified === true && typeof f.effect_usd === 'number' && Number.isFinite(f.effect_usd),
  );
  return { findings, observations: synthesis?.observations ?? [] };
}

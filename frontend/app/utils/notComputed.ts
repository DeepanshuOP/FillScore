/**
 * Decision 11 (2026-11-13): a value that was never computed reads "not computed for this data": never 0, and never a
 * blank that looks like zero. The rebuilt demos have no per-trade v1 fields; the API marks those views
 * (`v1Computed: false`, `notComputed: true`, or slippage `null`) and these helpers show them honestly.
 */
export const NOT_COMPUTED = 'not computed for this data';

interface SlippageFields { slippageBps?: number | null; arrivalSlippageBps?: number | null; vwapSlippageBps?: number | null }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The trade's slippage in bps, or null when it was never computed. A stored 0 is a measurement and stays 0. */
export function tradeSlippageBps(t: SlippageFields): number | null {
  for (const v of [t.slippageBps, t.arrivalSlippageBps, t.vwapSlippageBps]) if (isNum(v)) return v;
  return null;
}

export function formatBpsOrNotComputed(v: number | null | undefined): string {
  return isNum(v) ? v.toFixed(1) : NOT_COMPUTED;
}

/** True for an API body that says its v1 view was not computed (analytics, exchange comparison, coach, whale). */
export function isNotComputed(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false;
  const b = body as { notComputed?: unknown; reason?: unknown };
  return b.notComputed === true || b.reason === 'not_computed_for_this_data';
}

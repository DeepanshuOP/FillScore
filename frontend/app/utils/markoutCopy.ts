// Copy for the "Post-trade markouts" card. Past-tense findings only: what the price did after the fills.
// Sign convention: positive markout = the price moved in the trader's favour after the fill.
export interface MarkoutHorizon {
  horizonS: number;
  n: number;
  meanBps: number | null;
  maker: { n: number; meanBps: number | null };
  taker: { n: number; meanBps: number | null };
}

export const MARKOUT_EMPTY_COPY =
  "Post-trade price data has not been computed for this account's fills, so no markouts are shown.";

const fmt = (x: number) => Math.abs(x).toFixed(1);

export function markoutSentence(label: 'maker' | 'taker', horizonS: number, meanBps: number | null, n: number): string | null {
  if (meanBps === null || n === 0) return null;
  const dir = Math.round(meanBps * 10) === 0 ? 'did not move' : meanBps > 0 ? 'moved in your favour' : 'moved against you';
  const amount = Math.round(meanBps * 10) === 0 ? '' : ` by ${fmt(meanBps)} bps`;
  return `Prices ${dir}${amount} ${horizonS} s after your ${label} fills (${n} fills).`;
}

export function markoutSentences(rows: MarkoutHorizon[], horizonS = 60): string[] {
  const h = rows.find((r) => r.horizonS === horizonS);
  if (!h) return [];
  return [
    markoutSentence('maker', horizonS, h.maker.meanBps, h.maker.n),
    markoutSentence('taker', horizonS, h.taker.meanBps, h.taker.n),
  ].filter((s): s is string => s !== null);
}

export const hasMarkouts = (rows?: MarkoutHorizon[] | null) => !!rows && rows.some((r) => r.n > 0);

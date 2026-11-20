/**
 * View model for the broker-file check (M6 §1). Pure. Every number comes from POST /ml/csv/check, where deterministic code compared each
 * fill with the public price at its second; the sentences only arrange them, in past tense, and state what could not be compared. An error
 * shows a fixed sentence; the server's text is shown only for the four codes whose messages hold counts and column names, never file rows.
 */
import { formatSignedBps as formatBps, formatUsd } from '../ui/format';

export const CSV_COPY = {
  title: 'Check a broker file against public prices',
  hint: 'Choose a trade-history CSV from Kraken, or map the columns of another broker\'s file. Each fill is compared with the public price at its second. '
    + 'The file is read once to make this check and is not stored.',
  button: 'Check the file',
} as const;

export interface CsvFillApi {
  txid: string; order_id: string; symbol: string | null; side: number; ts_ms: number; price: number; qty: number; cost: number;
  fee_bps: number | null; fee_usd: number | null; taker: boolean | null; mid: number | null; quote_quality: string | null;
  eff_half_bps: number | null; total_bps: number | null; cost_usd: number | null; unmeasured_reason: string | null; market_data: unknown[];
}
export interface CsvCheckApi {
  format: 'kraken' | 'mapped'; provenance: string; fee_known: boolean; stored: false;
  summary: { fills: number; measured: number; unmeasured: number; unmeasured_reasons: Record<string, number>; median_eff_half_bps: number | null;
    weighted_eff_half_bps: number | null; total_eff_cost_usd: number | null; total_fee_usd: number | null; weighted_fee_bps: number | null };
  fills: CsvFillApi[]; skipped: Array<{ row: number; reason: string }>; assumptions: string[];
  limits: { max_fills: number; max_chars: number; market_data_deadline_s: number };
}
export interface CsvRow { key: string; time: string; symbol: string; side: string; price: string; quantity: string; cost: string; fee: string; note: string }
export interface CsvCheckView {
  error: string | null; headline: string | null; lines: string[]; rows: CsvRow[]; unmeasured: string[]; skipped: string[];
  provenance: string | null; assumptions: string[];
}

const NO_FEE_LINE = 'The file has no fee column, so fees were not part of this check.';
const SHOWN_ERROR_CODES = new Set(['too_many_fills', 'no_fills', 'not_readable', 'unknown_format']);

const usd = formatUsd;
const num = (v: number): string => String(Number(v.toPrecision(10)));
const when = (ms: number): string => `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const empty = { headline: null, lines: [], rows: [], unmeasured: [], skipped: [], provenance: null, assumptions: [] };

export function describeCsvCheck(status: number, body: unknown): CsvCheckView {
  const err = (error: string): CsvCheckView => ({ error, ...empty });
  if (status === 401) return err('Sign in to check a file.');
  if (status === 403) return err('Sample accounts cannot check a file. Sign in with your own account.');
  if (status === 429) {
    const code = (body as { detail?: { code?: string } } | null)?.detail?.code;
    if (code === 'csv_check_busy') return err('A check is already running, or the service is busy with other checks. Wait a minute, then try again.');
    return err('At most 6 checks an hour and 20 a day. Try again later.');
  }
  if (status === 503) return err('The public market-data source asked for a pause. Try again in a few minutes.');
  if (status === 413) return err('The file is too large. Split it by date and check each part.');
  if (status === 400) {
    const d = (body as { detail?: { code?: string; message?: string } } | null)?.detail;
    if (d?.code && SHOWN_ERROR_CODES.has(d.code) && typeof d.message === 'string') return err(d.message);
  }
  if (status !== 200 || !body) return err('The file could not be checked. Please try again.');

  const b = body as CsvCheckApi;
  const s = b.summary;
  const lines: string[] = [];
  if (s.measured > 0) {
    lines.push(`Median cost against the mid-price just before each fill: ${formatBps(s.median_eff_half_bps)} (weighted by size: ${formatBps(s.weighted_eff_half_bps)}).`);
    if (s.total_eff_cost_usd !== null) lines.push(`Together, the fills cost ${usd(s.total_eff_cost_usd)} against the mid-price.`);
    if (b.fee_known && s.total_fee_usd !== null) lines.push(`Fees stated in the file: ${usd(s.total_fee_usd)} (${formatBps(s.weighted_fee_bps)} of the traded value, weighted).`);
  }
  if (!b.fee_known) lines.push(NO_FEE_LINE);

  const rows: CsvRow[] = b.fills.map((f, i) => ({
    key: `${f.txid}:${i}`, time: when(f.ts_ms), symbol: f.symbol ?? 'no reference market', side: f.side > 0 ? 'buy' : 'sell',
    price: num(f.price), quantity: num(f.qty),
    cost: f.eff_half_bps === null ? 'insufficient data' : formatBps(f.eff_half_bps),
    fee: !b.fee_known || f.fee_bps === null ? 'not in the file' : formatBps(f.fee_bps),
    note: f.unmeasured_reason ?? '',
  }));

  const unmeasured = Object.entries(s.unmeasured_reasons).map(([why, n]) => `${plural(n, 'fill', 'fills')}: ${why}`);
  const groups = new Map<string, number[]>();
  for (const k of b.skipped) groups.set(k.reason, [...(groups.get(k.reason) ?? []), k.row]);
  const skipped = [...groups].map(([why, r]) => `${plural(r.length, 'row', 'rows')} skipped: ${why} (${r.length === 1 ? 'row' : 'rows'} ${r.join(', ')})`);

  const headline = s.measured > 0
    ? `${s.measured} of ${s.fills} ${s.fills === 1 ? 'fill was' : 'fills were'} compared with the public price at their second.`
    : 'Insufficient data: no fill could be compared with the public price.';
  return { error: null, headline, lines, rows, unmeasured, skipped, provenance: b.provenance, assumptions: b.assumptions };
}

/** The service refuses a file of more than 200,000 characters; the page does not send one. */
export const MAX_FILE_CHARS = 200_000;
export const fileIsTooLarge = (text: string): boolean => text.length > MAX_FILE_CHARS;

export type MappingInputs = Partial<Record<'time' | 'pair' | 'base' | 'quote' | 'side' | 'price' | 'quantity' | 'fee' | 'fee_currency' | 'id' | 'time_format', string>>;

export function buildCsvRequest(format: 'kraken' | 'mapped', csv: string, inputs: MappingInputs) {
  if (format === 'kraken') return { format, csv } as const;
  const mapping: Record<string, string> = {};
  for (const [k, v] of Object.entries(inputs)) if (typeof v === 'string' && v.trim()) mapping[k] = v.trim();
  return { format, csv, mapping } as const;
}

import { describe, it, expect } from 'vitest';
import { describeCsvCheck, describeSampleCheck, plainReason, SAMPLE_LABEL, buildCsvRequest, fileIsTooLarge, CSV_COPY, type CsvCheckApi } from './csvCheckView';
import { findAdviceTerms } from '../../../backend/src/constants/adviceTerms';

/**
 * Hand-computed from the ml-service fixture (tests/csv_import/test_service.py): two fills, a buy of 1.0 at 100.02 and a sell of 1.0 at
 * 99.98, the mid before each 100.00, so 2.0 bps each against the mid and fees of 16.0 bps; cost against the mid 0.04 and fees 0.32 in USD.
 */
const fill = (o: Record<string, unknown> = {}) => ({
  txid: 'T1', order_id: 'O1', symbol: 'BTCUSDT', side: 1, ts_ms: 1705327201123, price: 100.02, qty: 1, cost: 100.02, fee_bps: 16, fee_usd: 0.160032,
  taker: true, mid: 100, quote_quality: 'both_sides', eff_half_bps: 2, total_bps: 18, cost_usd: 0.020004, unmeasured_reason: null, market_data: [], ...o,
});
const api = (o: Partial<CsvCheckApi> = {}): CsvCheckApi => ({
  format: 'kraken', provenance: 'Read with the column layout of Kraken\'s documented Trades export. That reading is built from Kraken\'s documentation and is not yet checked against a real file.',
  fee_known: true, stored: false,
  summary: { fills: 2, measured: 2, unmeasured: 0, unmeasured_reasons: {}, median_eff_half_bps: 2, weighted_eff_half_bps: 2, total_eff_cost_usd: 0.04, total_fee_usd: 0.32, weighted_fee_bps: 16 },
  fills: [fill(), fill({ txid: 'T2', side: -1, ts_ms: 1705327211123, price: 99.98, cost: 99.98, fee_usd: 0.159968, cost_usd: 0.019996 })],
  skipped: [], assumptions: ['The reference market is Binance\'s USDT market. That is an assumption.'], limits: { max_fills: 200, max_chars: 200000, market_data_deadline_s: 60 }, ...o,
} as CsvCheckApi);

describe('describeCsvCheck', () => {
  it('states what was compared, in past tense, with the numbers of the API', () => {
    const v = describeCsvCheck(200, api());
    expect(v.error).toBeNull();
    expect(v.headline).toBe('2 of 2 fills were compared with the public price at their second.');
    expect(v.lines).toEqual([
      'Median cost against the mid-price just before each fill: 2.0 bps (weighted by size: 2.0 bps).',
      'Together, the fills cost $0.04 against the mid-price.',
      'Fees stated in the file: $0.32 (16.0 bps of the traded value, weighted).',
    ]);
    expect(v.rows).toHaveLength(2);
    expect(v.rows[0]).toMatchObject({ time: '2024-01-15 14:00:01 UTC', symbol: 'BTCUSDT', side: 'buy', price: '100.02', quantity: '1', cost: '2.0 bps', fee: '16.0 bps', note: '' });
    expect(v.rows[1].side).toBe('sell');
    expect(v.provenance).toMatch(/not yet checked against a real file/);
    expect(v.assumptions).toHaveLength(1);
  });

  it('copy is advice-free and says correlation-free things only', () => {
    const v = describeCsvCheck(200, api());
    const text = [v.headline, ...v.lines, v.provenance, ...v.assumptions, ...Object.values(CSV_COPY)].join(' ');
    expect(findAdviceTerms(text)).toEqual([]);
    expect(text).not.toMatch(/because|caused|due to|should|could save/i);
  });

  it('a fill that could not be compared is listed with its reason and is not a zero', () => {
    const b = api({ fills: [fill(), fill({ txid: 'T3', eff_half_bps: null, cost_usd: null, total_bps: null, mid: null, unmeasured_reason: 'no fresh print within 5000 ms before the fill' })],
      summary: { ...api().summary, fills: 2, measured: 1, unmeasured: 1, unmeasured_reasons: { 'no fresh print within 5000 ms before the fill': 1 } } });
    const v = describeCsvCheck(200, b);
    expect(v.headline).toBe('1 of 2 fills were compared with the public price at their second.');
    expect(v.rows[1].cost).toBe('insufficient data');
    // design v5 (PROPOSAL §4 row 15): the service's reason ("... 5000 ms ...") is worded for a reader: 5000 ms is 5 s, "print" is "public trade"
    expect(v.rows[1].note).toBe('no public trade within 5 s before this fill');
    expect(v.unmeasured).toEqual(['1 fill: no public trade within 5 s before this fill']);
  });

  it('plainReason words the two reasons the service writes and leaves any other reason as sent', () => {
    expect(plainReason('no fresh print within 5000 ms before the fill')).toBe('no public trade within 5 s before this fill');
    expect(plainReason('no fresh print within 2500 ms before the fill')).toBe('no public trade within 2.5 s before this fill');
    expect(plainReason('market data could not be fetched')).toBe('public trades could not be fetched for this fill');
    expect(plainReason('something new')).toBe('something new');
  });

  it('says "insufficient data" when no fill could be compared', () => {
    const b = api({ summary: { ...api().summary, measured: 0, unmeasured: 2, median_eff_half_bps: null, weighted_eff_half_bps: null, total_eff_cost_usd: null, total_fee_usd: null, weighted_fee_bps: null,
      unmeasured_reasons: { 'market data could not be fetched': 2 } }, fills: [fill({ eff_half_bps: null, cost_usd: null, unmeasured_reason: 'market data could not be fetched' }), fill({ eff_half_bps: null, cost_usd: null, unmeasured_reason: 'market data could not be fetched' })] });
    const v = describeCsvCheck(200, b);
    expect(v.headline).toBe('Insufficient data: no fill could be compared with the public price.');
    expect(v.lines).toEqual([]);
    expect(v.unmeasured).toEqual(['2 fills: public trades could not be fetched for this fill']);   // design v5 wording of the same reason
  });

  it('a file without a fee column says fees were not part of the check, and shows no fee', () => {
    const b = api({ fee_known: false, summary: { ...api().summary, total_fee_usd: null, weighted_fee_bps: null }, fills: [fill({ fee_bps: null, fee_usd: null, total_bps: null })] });
    const v = describeCsvCheck(200, b);
    expect(v.lines).toContain('The file has no fee column, so fees were not part of this check.');
    expect(v.rows[0].fee).toBe('not in the file');
  });

  it('lists skipped rows by number and reason, counted', () => {
    const v = describeCsvCheck(200, api({ skipped: [{ row: 4, reason: 'margin trade' }, { row: 9, reason: 'margin trade' }, { row: 11, reason: 'unknown side' }] }));
    expect(v.skipped).toEqual(['2 rows skipped: margin trade (rows 4, 9)', '1 row skipped: unknown side (row 11)']);
  });

  it('maps errors to fixed sentences', () => {
    expect(describeCsvCheck(401, null).error).toMatch(/Sign in/);
    expect(describeCsvCheck(403, { detail: { code: 'demo_account' } }).error).toMatch(/sample accounts/i);
    expect(describeCsvCheck(429, { detail: { code: 'csv_check_limit' } }).error).toMatch(/6 checks an hour/);
    expect(describeCsvCheck(413, { detail: { code: 'file_too_large', message: 'x' } }).error).toMatch(/too large/i);
    expect(describeCsvCheck(400, { detail: { code: 'too_many_fills', message: 'This file has 201 fills. At most 200 can be checked at once. Split the file by date and check each part.' } }).error)
      .toBe('This file has 201 fills. At most 200 can be checked at once. Split the file by date and check each part.');
    expect(describeCsvCheck(400, { detail: { code: 'not_readable', message: 'this is not a Kraken Trades export: missing columns: fee' } }).error).toContain('missing columns: fee');
    expect(describeCsvCheck(500, null).error).toMatch(/could not be checked/i);
    expect(describeCsvCheck(0, null).error).toMatch(/could not be checked/i);
  });

  it('tells apart the budget, a check already running, a busy service and a market-data pause', () => {
    expect(describeCsvCheck(429, { detail: { code: 'csv_check_limit' } }).error).toMatch(/6 checks an hour/);
    expect(describeCsvCheck(429, { detail: { code: 'csv_check_busy', message: 'x' } }).error).toMatch(/running|busy/i);
    expect(describeCsvCheck(429, null).error).toMatch(/6 checks an hour/);
    expect(describeCsvCheck(503, { detail: { code: 'market_data_busy' } }).error).toBe('The public market-data source asked for a pause. Try again in a few minutes.');
  });

  it('shows the file\'s own text from an error only for the codes whose messages hold counts and column names', () => {
    const v = describeCsvCheck(400, { detail: { code: 'something_else', message: 'SECRET row text' } });
    expect(v.error).not.toContain('SECRET');
  });
});

describe('fileIsTooLarge', () => {
  it('is true above 200,000 characters (the service refuses more), so the file is not sent', () => {
    expect(fileIsTooLarge('x'.repeat(200_000))).toBe(false);
    expect(fileIsTooLarge('x'.repeat(200_001))).toBe(true);
  });
});

describe('buildCsvRequest', () => {
  it('Kraken: only the file', () => {
    expect(buildCsvRequest('kraken', 'a,b', {})).toEqual({ format: 'kraken', csv: 'a,b' });
  });
  it('mapped: empty optional fields are left out and the time format is kept', () => {
    const r = buildCsvRequest('mapped', 'x', { time: ' Time ', pair: 'Product', side: 'Side', price: 'Price', quantity: 'Size', fee: '', fee_currency: '', id: '', base: '', quote: '', time_format: 'epoch_ms' });
    expect(r).toEqual({ format: 'mapped', csv: 'x', mapping: { time: 'Time', pair: 'Product', side: 'Side', price: 'Price', quantity: 'Size', time_format: 'epoch_ms' } });
  });
});

// A5 (orders of 2026-11-23): "Try the sample file". The backend's POST /api/check/sample answers with the ml-service's check result plus
// `sample`, or with `{ code, message }`. The result is labelled; a user's own file is not.
describe('describeSampleCheck', () => {
  it('a result carries the label "Sample file: synthetic fills, real prices"; a user\'s own file carries none', () => {
    expect(SAMPLE_LABEL).toBe('Sample file: synthetic fills, real prices');
    const v = describeSampleCheck(200, { ...api(), sample: { label: SAMPLE_LABEL, sha256: 'x' } });
    expect(v.error).toBeNull();
    expect(v.sampleLabel).toBe(SAMPLE_LABEL);
    expect(v.headline).toBe('2 of 2 fills were compared with the public price at their second.');
    expect(describeCsvCheck(200, api()).sampleLabel).toBeNull();
  });
  it('the fee line of a sample says the fees were set when the file was made, not stated by a broker (review 2026-11-23)', () => {
    const v = describeSampleCheck(200, { ...api(), sample: { label: SAMPLE_LABEL, sha256: 'x' } });
    expect(v.lines).toEqual([
      'Median cost against the mid-price just before each fill: 2.0 bps (weighted by size: 2.0 bps).',
      'Together, the fills cost $0.04 against the mid-price.',
      'Fees in the sample file: $0.32 (16.0 bps of the traded value, weighted). They were set when the file was made; no broker stated them.',
    ]);
    expect(describeCsvCheck(200, api()).lines[2]).toBe('Fees stated in the file: $0.32 (16.0 bps of the traded value, weighted).');   // a user's file is unchanged
  });
  it('a sample result without the sample marker is refused, never shown as a sample', () => {
    expect(describeSampleCheck(200, api()).error).toBe('The sample file could not be checked. Please try again.');
  });
  it('limits and pauses read in plain words (3 an hour per IP, the day cap, a pause, not configured)', () => {
    expect(describeSampleCheck(429, { code: 'SAMPLE_IP_LIMIT' }).error).toBe('The sample file can be checked 3 times an hour. Try again later.');
    expect(describeSampleCheck(429, { code: 'SAMPLE_DAY_LIMIT' }).error).toBe('The sample file has been checked as often as it can be today. Try again tomorrow.');
    expect(describeSampleCheck(503, { code: 'market_data_busy' }).error).toBe('The public market-data source asked for a pause. Try again in a few minutes.');
    expect(describeSampleCheck(503, { code: 'sample_unavailable' }).error).toBe('The sample file cannot be checked right now.');
    expect(describeSampleCheck(502, { code: 'sample_failed' }).error).toBe('The sample file could not be checked. Please try again.');
    expect(describeSampleCheck(0, null).error).toBe('The sample file could not be checked. Please try again.');
  });
});

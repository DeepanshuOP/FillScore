'use client';
import React, { useState } from 'react';
import { authFetch } from '../lib/authFetch';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Banner } from '../ui/Banner';
import { Disclosure } from '../ui/Disclosure';
import { DataTable, type Column } from '../ui/DataTable';
import { ValueState } from '../ui/ValueState';
import { apiBase } from '../lib/apiBase';
import { CSV_COPY, SAMPLE_HINT, buildCsvRequest, describeCsvCheck, describeSampleCheck, fileIsTooLarge, type CsvCheckView, type CsvRow, type MappingInputs } from './csvCheckView';

interface Props { mlBaseUrl: string; accessToken: string | null | undefined; refreshAccessToken: () => Promise<string | null> }

const FIELDS: Array<[keyof MappingInputs, string, boolean]> = [
  ['time', 'Time column', true], ['pair', 'Pair column (for example BTC-USD)', true], ['side', 'Side column (buy or sell)', true],
  ['price', 'Price column', true], ['quantity', 'Quantity column', true], ['fee', 'Fee column (optional)', false],
  ['fee_currency', 'Fee currency column (optional)', false], ['id', 'Trade id column (optional)', false],
];

const SELECT = 'min-h-10 pointer-coarse:min-h-11 w-full rounded-ui border border-ui-edge bg-ui-raised px-3 py-2 text-ui-ink disabled:cursor-not-allowed disabled:opacity-60';

const COLUMNS: Column<CsvRow>[] = [
  { key: 'time', header: 'Time', sortValue: r => r.time, cell: r => r.time },
  { key: 'symbol', header: 'Market', cell: r => r.symbol },
  { key: 'side', header: 'Side', priority: 'low', cell: r => r.side },
  { key: 'price', header: 'Price', numeric: true, priority: 'low', cell: r => r.price },
  { key: 'quantity', header: 'Quantity', numeric: true, priority: 'low', cell: r => r.quantity },
  { key: 'cost', header: 'Cost vs mid', numeric: true, cell: r => r.cost === 'insufficient data'
    ? <ValueState state="insufficient" label="Cost vs mid" size="cell" reason={r.note || undefined} />
    : <ValueState state="measured" label="Cost vs mid" value={r.cost} size="cell" /> },
  { key: 'fee', header: 'Fee', numeric: true, priority: 'low', cell: r => r.fee },
  { key: 'note', header: 'Reason', cell: r => r.note || '' },   // design v5, PROPOSAL §4 row 15: the reason a fill was not compared stays in view
];

/** Check a broker file (M6 §1): each fill against the public price at its second. Signed-in accounts only. The file is read in this tab,
 *  sent once to the check, and not stored. */
export default function CsvCheckPanel({ mlBaseUrl, accessToken, refreshAccessToken }: Props) {
  const [format, setFormat] = useState<'kraken' | 'mapped'>('kraken');
  const [mapping, setMapping] = useState<MappingInputs>({ time_format: 'iso' });
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<CsvCheckView | null>(null);

  const onFile = async (f: File | undefined) => {
    setView(null);
    if (!f) { setText(null); setFileName(null); return; }
    setFileName(f.name);
    setText(await f.text());
  };

  const send = async () => {
    if (text === null || busy) return;
    if (fileIsTooLarge(text)) { setView(describeCsvCheck(413, null)); return; }     // the service would refuse it; do not send it
    setBusy(true);
    setView(null);
    try {
      // authFetch adds the login token and, when it has expired, refreshes it once and repeats the call
      const res = await authFetch(`${mlBaseUrl}/ml/csv/check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildCsvRequest(format, text, mapping)),
      }, { accessToken: accessToken ?? null, refreshAccessToken });
      setView(describeCsvCheck(res.status, await res.json().catch(() => null)));
    } catch {
      setView(describeCsvCheck(0, null));
    } finally {
      setBusy(false);
    }
  };

  // A5: the committed sample file, for everyone (signed out and demo included). Nothing of the visitor's is sent; the server owns the file.
  const trySample = async () => {
    if (busy) return;
    setBusy(true);
    setView(null);
    try {
      const res = await fetch(`${apiBase()}/check/sample`, { method: 'POST' });
      setView(describeSampleCheck(res.status, await res.json().catch(() => null)));
    } catch {
      setView(describeSampleCheck(0, null));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="csv-check-panel">
      <Panel title={CSV_COPY.title} description={CSV_COPY.hint}>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="csv-format" className="text-sm font-medium text-ui-ink">File format</label>
              <select id="csv-format" value={format} onChange={e => setFormat(e.target.value as 'kraken' | 'mapped')} className={SELECT} disabled={busy}>
                <option value="kraken">Kraken: Trades export (CSV)</option>
                <option value="mapped">Another broker: I map the columns</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="csv-file" className="text-sm font-medium text-ui-ink">Trade history file</label>
              <input id="csv-file" type="file" accept=".csv,text/csv" onChange={e => onFile(e.target.files?.[0])} disabled={busy}
                className="min-h-10 pointer-coarse:min-h-11 w-full rounded-ui border border-ui-edge bg-ui-raised px-3 py-2 text-sm text-ui-ink" />
            </div>
          </div>
          {format === 'mapped' && (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-4">
              {FIELDS.map(([k, label, required]) => (
                <Field key={k} label={label} value={mapping[k] ?? ''} onChange={e => setMapping({ ...mapping, [k]: e.target.value })} aria-required={required} />
              ))}
              <div className="flex flex-col gap-1">
                <label htmlFor="csv-time-format" className="text-sm font-medium text-ui-ink">Time format</label>
                <select id="csv-time-format" value={mapping.time_format ?? 'iso'} onChange={e => setMapping({ ...mapping, time_format: e.target.value })} className={SELECT}>
                  <option value="iso">ISO text (2024-01-15T14:00:01Z)</option>
                  <option value="epoch_s">Seconds since 1970</option>
                  <option value="epoch_ms">Milliseconds since 1970</option>
                </select>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={send} disabled={text === null} loading={busy}>{busy ? 'Checking…' : CSV_COPY.button}</Button>
            <Button variant="secondary" onClick={trySample} disabled={busy} data-testid="try-sample">Try the sample file</Button>
            {fileName && <span className="text-sm text-ui-graphite">{fileName}</span>}
          </div>
          <p className="max-w-[68ch] text-[13px] text-ui-graphite">{SAMPLE_HINT}</p>
        </div>

        {view?.error && <div data-testid="csv-error" className="mt-4"><Banner kind="refused" title={view.error} /></div>}
        {view && !view.error && (
          <div data-testid="csv-result" className="mt-6 flex flex-col gap-3">
            {view.sampleLabel ? <p data-testid="sample-label" className="font-mono text-[13px] tracking-[0.04em] text-ui-ink uppercase">{view.sampleLabel}</p> : null}
            <h3 className="text-base font-semibold text-ui-ink">Findings</h3>
            <p className="text-sm text-ui-ink">{view.headline}</p>
            {view.lines.map(l => <p key={l} className="text-sm text-ui-graphite">{l}</p>)}
            {view.unmeasured.map(l => <p key={l} className="text-sm text-ui-graphite">Not compared, {l}.</p>)}
            {view.skipped.map(l => <p key={l} className="text-sm text-ui-graphite">{l}.</p>)}
            {view.rows.length > 0 && (
              <DataTable caption="Each fill compared with the public price" columns={COLUMNS} rows={view.rows} rowId={r => r.key} />
            )}
            {view.provenance && <p className="max-w-[68ch] text-sm text-ui-graphite">{view.provenance}</p>}
            {view.assumptions.length > 0 && (
              <Disclosure summary="What this check assumes">
                <ul className="list-disc pl-5">
                  {view.assumptions.map(a => <li key={a}>{a}</li>)}
                </ul>
              </Disclosure>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

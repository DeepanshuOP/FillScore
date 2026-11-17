'use client';
import React, { useState } from 'react';
import { authFetch } from '../lib/authFetch';
import { CSV_COPY, buildCsvRequest, describeCsvCheck, fileIsTooLarge, type CsvCheckView, type MappingInputs } from './csvCheckView';

interface Props { mlBaseUrl: string; accessToken: string | null | undefined; refreshAccessToken: () => Promise<string | null> }

const CARD = {
  padding: '1.25rem 1.5rem', background: '#1c1c1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px',
  display: 'flex', flexDirection: 'column' as const, gap: '0.75rem',
};
const LABEL = { fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' as const };
const TEXT = { fontFamily: 'var(--font-inter)', fontSize: '0.85rem', lineHeight: 1.6, color: '#a09890', margin: 0 };
const INPUT = { background: '#121210', border: '1px solid rgba(255,255,255,0.1)', color: '#ede8e0', padding: '0.4rem 0.55rem', borderRadius: '2px', fontFamily: 'var(--font-inter)', fontSize: '0.78rem' };
const FIELDS: Array<[keyof MappingInputs, string, boolean]> = [
  ['time', 'Time column', true], ['pair', 'Pair column (for example BTC-USD)', true], ['side', 'Side column (buy or sell)', true],
  ['price', 'Price column', true], ['quantity', 'Quantity column', true], ['fee', 'Fee column (optional)', false],
  ['fee_currency', 'Fee currency column (optional)', false], ['id', 'Trade id column (optional)', false],
];

/** Check a broker file (M6 §1): each fill against the public price at its second. Signed-in accounts only. The file is read in this tab,
 *  sent once to the check, and not stored. M8 redesigns this panel. */
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

  return (
    <section aria-label={CSV_COPY.title} data-testid="csv-check-panel" style={CARD}>
      <div style={LABEL}>{CSV_COPY.title}</div>
      <p style={{ ...TEXT, fontSize: '0.75rem' }}>{CSV_COPY.hint}</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <select aria-label="File format" value={format} onChange={e => setFormat(e.target.value as 'kraken' | 'mapped')} style={INPUT} disabled={busy}>
          <option value="kraken">Kraken: Trades export (CSV)</option>
          <option value="mapped">Another broker: I map the columns</option>
        </select>
        <input type="file" accept=".csv,text/csv" aria-label="Trade history file" onChange={e => onFile(e.target.files?.[0])} disabled={busy}
          style={{ ...TEXT, fontSize: '0.75rem' }} />
      </div>
      {format === 'mapped' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: '0.5rem' }}>
          {FIELDS.map(([k, label, required]) => (
            <label key={k} style={{ ...TEXT, fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
              {label}
              <input value={mapping[k] ?? ''} onChange={e => setMapping({ ...mapping, [k]: e.target.value })} aria-required={required} style={INPUT} />
            </label>
          ))}
          <label style={{ ...TEXT, fontSize: '0.72rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            Time format
            <select value={mapping.time_format ?? 'iso'} onChange={e => setMapping({ ...mapping, time_format: e.target.value })} style={INPUT}>
              <option value="iso">ISO text (2024-01-15T14:00:01Z)</option>
              <option value="epoch_s">Seconds since 1970</option>
              <option value="epoch_ms">Milliseconds since 1970</option>
            </select>
          </label>
        </div>
      )}
      <div>
        <button type="button" onClick={send} disabled={busy || text === null}
          style={{ background: 'transparent', border: '1px solid rgba(167,139,113,0.4)', color: '#a78b71', padding: '0.4rem 0.9rem', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
          {busy ? 'CHECKING…' : CSV_COPY.button}
        </button>
        {fileName && <span style={{ ...TEXT, fontSize: '0.72rem', marginLeft: '0.75rem' }}>{fileName}</span>}
      </div>

      {view?.error && <p style={TEXT} data-testid="csv-error">{view.error}</p>}
      {view && !view.error && (
        <div data-testid="csv-result" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ ...TEXT, color: '#ede8e0' }}>{view.headline}</p>
          {view.lines.map(l => <p key={l} style={TEXT}>{l}</p>)}
          {view.unmeasured.map(l => <p key={l} style={{ ...TEXT, fontSize: '0.75rem' }}>Not compared, {l}.</p>)}
          {view.skipped.map(l => <p key={l} style={{ ...TEXT, fontSize: '0.75rem' }}>{l}.</p>)}
          {view.rows.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ ...TEXT, fontSize: '0.72rem', borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr>{['Time', 'Market', 'Side', 'Price', 'Quantity', 'Cost vs mid', 'Fee', 'Note'].map(h => <th key={h} style={{ textAlign: 'left', padding: '0.25rem 0.5rem', ...LABEL }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {view.rows.map(r => (
                    <tr key={r.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {[r.time, r.symbol, r.side, r.price, r.quantity, r.cost, r.fee, r.note].map((c, i) => <td key={i} style={{ padding: '0.25rem 0.5rem' }}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view.provenance && <p style={{ ...TEXT, fontSize: '0.72rem' }}>{view.provenance}</p>}
          {view.assumptions.length > 0 && (
            <details>
              <summary style={{ ...TEXT, fontSize: '0.72rem', cursor: 'pointer' }}>What this check assumes</summary>
              <ul style={{ ...TEXT, fontSize: '0.72rem', margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                {view.assumptions.map(a => <li key={a}>{a}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

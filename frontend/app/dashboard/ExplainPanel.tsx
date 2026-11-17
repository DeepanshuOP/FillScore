'use client';
import React, { useEffect, useRef, useState } from 'react';
import { describeQueue, describeRankings, describeReplay, nextStates, PANEL_COPY, type RankingsApi, type VenueApi } from './explainView';

type Json = { status: number; body: unknown };
interface Props {
  /** `?userId=demo-...` for a demo account, '' for a signed-in one. */
  query: string;
  /** A demo account is read-only: the queue is shown without review controls. */
  readOnly: boolean;
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Json>;
}

const CARD = {
  padding: '1.25rem 1.5rem', background: '#1c1c1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px',
  display: 'flex', flexDirection: 'column' as const, gap: '0.9rem',
};
const LABEL = { fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' as const };
const TEXT = { fontFamily: 'var(--font-inter)', fontSize: '0.8rem', lineHeight: 1.6, color: '#a09890', margin: 0 };
const BTN = { background: 'transparent', border: '1px solid rgba(167,139,113,0.4)', color: '#a78b71', padding: '0.2rem 0.6rem', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.62rem' } as const;

const withParams = (path: string, query: string, extra: Record<string, string> = {}) => {
  const u = new URLSearchParams(query.replace(/^\?/, ''));
  for (const [k, v] of Object.entries(extra)) u.set(k, v);
  const s = u.toString();
  return s ? `${path}?${s}` : path;
};

/** The exception queue with review states, the rankings that say "too few to tell", and the order replay (M4).
 *  Every number comes from the API (stored measurements); the sentences only arrange them. M8 redesigns this panel. */
export default function ExplainPanel({ query, readOnly, request }: Props) {
  const [queue, setQueue] = useState<Json | null>(null);
  const [rank, setRank] = useState<{ by: 'symbol' | 'hour'; res: Json | null }>({ by: 'symbol', res: null });
  const [venue, setVenue] = useState<Json | null>(null);
  // Keyed by symbol and order id: the same order id can exist on two symbols. `replaySeq` drops an answer that arrives after
  // the replay was closed or another one was opened.
  const [replay, setReplay] = useState<{ key: string; res: Json } | null>(null);
  const replaySeq = useRef(0);
  const [showDismissed, setShowDismissed] = useState(false);
  const [reload, setReload] = useState(0);

  // State is set only in the answer of a request, never synchronously in an effect.
  useEffect(() => {
    let live = true;
    request(withParams('/audit/exceptions', query, showDismissed ? { includeDismissed: '1' } : {}))
      .then(res => { if (live) setQueue(res); }).catch(() => { if (live) setQueue({ status: 500, body: null }); });
    return () => { live = false; };
  }, [request, query, showDismissed, reload]);
  useEffect(() => {
    let live = true;
    request(withParams('/audit/rankings', query, { by: rank.by }))
      .then(res => { if (live) setRank(r => ({ ...r, res })); }).catch(() => { if (live) setRank(r => ({ ...r, res: { status: 500, body: null } })); });
    return () => { live = false; };
  }, [request, query, rank.by]);
  useEffect(() => {
    let live = true;
    request(withParams('/audit/venue-comparison', query))
      .then(res => { if (live) setVenue(res); }).catch(() => { if (live) setVenue({ status: 500, body: null }); });
    return () => { live = false; };
  }, [request, query]);

  const setState = async (orderId: string, symbol: string, state: string) => {
    const r = await request(withParams(`/audit/exceptions/${encodeURIComponent(orderId)}`, query, { symbol }), { method: 'PATCH', body: { state } });
    if (r.status === 200) setReload(n => n + 1);
  };
  const openReplay = async (orderId: string, symbol: string) => {
    const key = `${symbol}:${orderId}`;
    if (replay?.key === key) { replaySeq.current++; setReplay(null); return; }
    const seq = ++replaySeq.current;
    let res: Json;
    try { res = await request(withParams(`/audit/orders/${encodeURIComponent(orderId)}/replay`, query, { symbol })); }
    catch { res = { status: 500, body: null }; }
    if (seq === replaySeq.current) setReplay({ key, res });
  };

  const q = queue ? describeQueue(queue.status, queue.body) : null;
  const rv = replay ? describeReplay(replay.res.status, replay.res.body) : null;
  const rk = rank.res && rank.res.status === 200 ? describeRankings(rank.res.body as RankingsApi) : null;
  const venueBody = venue && venue.status === 200 ? (venue.body as VenueApi) : null;

  return (
    <section aria-label="Exceptions, rankings and order replay" data-testid="explain-panel" style={CARD}>
      <div style={LABEL}>{PANEL_COPY.queueTitle}</div>
      {!q ? <p style={TEXT}>Loading…</p> : (
        <div data-testid="explain-queue">
          {q.summary && <p style={TEXT}>{q.summary}</p>}
          {q.threshold && <p style={{ ...TEXT, fontSize: '0.72rem' }}>{q.threshold}</p>}
          {q.note && <p style={TEXT} data-testid="explain-queue-note">{q.note}</p>}
          {q.kind === 'error' && <p style={TEXT}>{q.note}</p>}
          {q.kind === 'empty' && <p style={TEXT}>No order met a rule.</p>}
          {q.counts && <p style={{ ...TEXT, fontSize: '0.72rem' }}>{q.counts}</p>}
          <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {q.items.map(i => (
              <li key={`${i.symbol}:${i.orderId}`} data-testid="explain-item">
                <p style={{ ...TEXT, color: '#ede8e0' }}>{i.finding}</p>
                <p style={{ ...TEXT, fontSize: '0.72rem' }}>{i.symbol} · order {i.orderId} · {i.usd} · {i.ruleLabels.join(', ')} · {i.stateLabel}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                  <button type="button" style={BTN} onClick={() => openReplay(i.orderId, i.symbol)}>{replay?.key === `${i.symbol}:${i.orderId}` ? 'Hide replay' : 'Replay'}</button>
                  {nextStates(i.state, readOnly).map(([s, label]) => (
                    <button key={s} type="button" style={BTN} onClick={() => setState(i.orderId, i.symbol, s)}>{label}</button>
                  ))}
                </div>
                {rv && replay?.key === `${i.symbol}:${i.orderId}` && (
                  <div data-testid="explain-replay" style={{ marginTop: '0.6rem', paddingLeft: '0.75rem', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                    {rv.error ? <p style={TEXT}>{rv.error}</p> : (
                      <>
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {rv.figures.map(f => (
                            <li key={f.label} style={{ ...TEXT, paddingLeft: f.indent ? '1rem' : 0 }}>
                              <span style={{ color: '#888078' }}>{f.label}: </span><span style={{ color: '#ede8e0' }}>{f.value}</span>
                              <span style={{ color: '#6f685f', fontSize: '0.68rem' }}> ({f.source})</span>
                            </li>
                          ))}
                        </ul>
                        {rv.expected && <p style={TEXT}>{rv.expected}</p>}
                        {rv.fills.length > 0 && <p style={TEXT}>Fills: {rv.fills.map(f => `${f.time.slice(11, 23)} ${f.text}`).join(' · ')}</p>}
                        {rv.notes.map(n => <p key={n} style={TEXT}>{n}</p>)}
                        {rv.sources.map(s => (
                          <p key={s.hash + s.label} style={{ ...TEXT, fontSize: '0.72rem' }}>
                            Source: {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: '#a78b71' }}>{s.label}</a> : s.label} · SHA-256 {s.hash}
                          </p>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <label style={{ ...TEXT, fontSize: '0.72rem', display: 'inline-flex', gap: '0.4rem', marginTop: '0.5rem' }}>
            <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} /> {PANEL_COPY.showDismissed}
          </label>
        </div>
      )}

      <div data-testid="explain-rankings">
        <div style={LABEL}>{PANEL_COPY.rankingsTitle} · by {rank.by === 'symbol' ? 'symbol' : 'hour of the day'}</div>
        <div style={{ display: 'flex', gap: '0.5rem', margin: '0.4rem 0' }}>
          {(['symbol', 'hour'] as const).map(b => (
            <button key={b} type="button" aria-pressed={rank.by === b} style={{ ...BTN, ...(rank.by === b ? { background: 'rgba(167,139,113,0.2)' } : {}) }}
              onClick={() => setRank({ by: b, res: null })}>{b === 'symbol' ? 'Symbol' : 'Hour'}</button>
          ))}
        </div>
        {rk ? rk.rows.map(r => <p key={r} style={TEXT}>{r}</p>) : <p style={TEXT}>{rank.res ? 'The rankings could not be loaded.' : 'Loading…'}</p>}
      </div>

      {venueBody && (
        <div data-testid="explain-venue">
          <div style={LABEL}>{PANEL_COPY.venuesTitle}</div>
          {venueBody.note && <p style={TEXT}>{venueBody.note}</p>}
          {venueBody.buckets.map(b => (
            <p key={`${b.symbol}:${b.bucket}`} style={TEXT}>
              {b.symbol} {b.bucket}: {b.note ?? describeRankings({ by: 'venue', level: 0.9, minOrders: 20, groups: b.venues }).rows.join(' ')}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

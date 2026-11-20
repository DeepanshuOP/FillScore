'use client';
import React, { useEffect, useRef, useState } from 'react';
import { track } from '../lib/track';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { ValueState } from '../ui/ValueState';
import { EmptyState } from '../ui/EmptyState';
import { describeQueue, describeRankings, describeReplay, nextStates, PANEL_COPY, type RankingsApi, type VenueApi } from './explainView';

type Json = { status: number; body: unknown };
interface Props {
  /** `?userId=demo-...` for a demo account, '' for a signed-in one. */
  query: string;
  /** A demo account is read-only: the queue is shown without review controls. */
  readOnly: boolean;
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Json>;
}

const TEXT = 'text-sm text-ui-graphite';

const withParams = (path: string, query: string, extra: Record<string, string> = {}) => {
  const u = new URLSearchParams(query.replace(/^\?/, ''));
  for (const [k, v] of Object.entries(extra)) u.set(k, v);
  const s = u.toString();
  return s ? `${path}?${s}` : path;
};

/** The exception queue with review states, the rankings that say "too few to tell", and the order replay (M4).
 *  Every number comes from the API (stored measurements); the sentences only arrange them. */
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
    track('replay_open');
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
    <div data-testid="explain-panel" className="flex flex-col gap-8">
      <Panel title={PANEL_COPY.queueTitle} description="Orders whose stored measurements met one of the account's rules.">
        {!q ? <p className={TEXT}>Loading…</p> : (
          <div data-testid="explain-queue" className="flex flex-col gap-2">
            {q.summary && <p className={TEXT}>{q.summary}</p>}
            {q.threshold && <p className={TEXT}>{q.threshold}</p>}
            {q.note && <p className={TEXT} data-testid="explain-queue-note">{q.note}</p>}
            {q.kind === 'empty' && <EmptyState title="No order met a rule." />}
            {q.counts && <p className={TEXT}>{q.counts}</p>}
            <ul className="mt-2 flex flex-col gap-4">
              {q.items.map(i => (
                <li key={`${i.symbol}:${i.orderId}`} data-testid="explain-item" className="border-t border-ui-rule pt-3">
                  <p className="text-sm text-ui-ink">{i.finding}</p>
                  <p className={TEXT}>
                    {i.symbol}, order <span className="font-[family-name:var(--ui-mono)]">{i.orderId}</span>, {i.usd}, {i.ruleLabels.join(', ')}, {i.stateLabel}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => openReplay(i.orderId, i.symbol)}>{replay?.key === `${i.symbol}:${i.orderId}` ? 'Hide replay' : 'Replay'}</Button>
                    {nextStates(i.state, readOnly).map(([s, label]) => (
                      <Button key={s} variant="secondary" onClick={() => setState(i.orderId, i.symbol, s)}>{label}</Button>
                    ))}
                  </div>
                  {rv && replay?.key === `${i.symbol}:${i.orderId}` && (
                    <div data-testid="explain-replay" className="mt-3 flex flex-col gap-2 border-l border-ui-rule pl-4">
                      {rv.error ? <p className={TEXT}>{rv.error}</p> : (
                        <>
                          <h3 className="text-base font-semibold text-ui-ink">Order replay</h3>
                          <ul className="flex flex-col gap-1">
                            {rv.figures.map(f => (
                              <li key={f.label} className={`${TEXT} ${f.indent ? 'pl-4' : ''}`}>
                                <span>{f.label}: </span>
                                {f.value === 'not computed'
                                  ? <ValueState state="not-computed" label={f.label} size="inline" />
                                  : <ValueState state="measured" label={f.label} value={f.value} size="inline" />}
                                <span> ({f.source})</span>
                              </li>
                            ))}
                          </ul>
                          {rv.expected && <p className={TEXT}>{rv.expected}</p>}
                          {rv.fills.length > 0 && <p className={TEXT}>Fills: {rv.fills.map(f => `${f.time.slice(11, 23)} ${f.text}`).join('; ')}</p>}
                          {rv.notes.map(n => <p key={n} className={TEXT}>{n}</p>)}
                          {rv.sources.map(s => (
                            <p key={s.hash + s.label} className={TEXT}>
                              Source: {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ui-ink underline">{s.label}</a> : s.label}, SHA-256 <span className="font-[family-name:var(--ui-mono)]">{s.hash}</span>
                            </p>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <label className="mt-2 inline-flex min-h-10 items-center gap-2 text-sm text-ui-ink">
              <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} /> {PANEL_COPY.showDismissed}
            </label>
          </div>
        )}
      </Panel>

      <div data-testid="explain-rankings">
        <Panel title={PANEL_COPY.rankingsTitle} description={`Grouped by ${rank.by === 'symbol' ? 'symbol' : 'hour of the day'}.`}
          actions={(['symbol', 'hour'] as const).map(b => (
            <Button key={b} variant={rank.by === b ? 'primary' : 'secondary'} aria-pressed={rank.by === b}
              onClick={() => setRank({ by: b, res: null })}>{b === 'symbol' ? 'Symbol' : 'Hour'}</Button>
          ))}>
          <div className="flex flex-col gap-1">
            {rk ? rk.rows.map(r => <p key={r} className={TEXT}>{r}</p>) : <p className={TEXT}>{rank.res ? 'The rankings could not be loaded.' : 'Loading…'}</p>}
          </div>
        </Panel>
      </div>

      {venueBody && (
        <div data-testid="explain-venue">
          <Panel title={PANEL_COPY.venuesTitle}>
            <div className="flex flex-col gap-1">
              {venueBody.note && <p className={TEXT}>{venueBody.note}</p>}
              {venueBody.buckets.map(b => (
                <p key={`${b.symbol}:${b.bucket}`} className={TEXT}>
                  {b.symbol} {b.bucket}: {b.note ?? describeRankings({ by: 'venue', level: 0.9, minOrders: 20, groups: b.venues }).rows.join(' ')}
                </p>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

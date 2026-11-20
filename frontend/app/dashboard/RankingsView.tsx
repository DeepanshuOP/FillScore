'use client';

import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Panel } from '../ui/Panel';
import { ValueState } from '../ui/ValueState';
import { RankPlot, RankTable } from '../ui/charts/RankPlot';
import { describeRankPlot } from './rankingsView';
import { describeRankings, PANEL_COPY, type RankingsApi, type VenueApi } from './explainView';

type Json = { status: number; body: unknown };
interface Props { query: string; request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Json> }

const withParams = (path: string, query: string, extra: Record<string, string> = {}) => {
  const u = new URLSearchParams(query.replace(/^\?/, ''));
  for (const [k, v] of Object.entries(extra)) u.set(k, v);
  const s = u.toString();
  return s ? `${path}?${s}` : path;
};

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[8px] bg-ui-overlay p-0.5 text-[12px]">
      {options.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cn('rounded-[6px] px-2.5 py-1 transition-colors', value === k ? 'bg-ui-raised text-ui-ink shadow-ui' : 'text-ui-graphite hover:text-ui-ink')}>{text}</button>
      ))}
    </div>
  );
}

/** Rankings (noise-aware): a dot-and-interval chart per group with a table alternative, and the matched venue comparison. */
export default function RankingsView({ query, request }: Props) {
  const [by, setBy] = useState<'symbol' | 'hour'>('symbol');
  const [as, setAs] = useState<'chart' | 'table'>('chart');
  const [res, setRes] = useState<{ by: string; json: Json } | null>(null);
  const [venue, setVenue] = useState<Json | null>(null);

  useEffect(() => {
    let live = true;
    request(withParams('/audit/rankings', query, { by }))
      .then((json) => { if (live) setRes({ by, json }); }).catch(() => { if (live) setRes({ by, json: { status: 500, body: null } }); });
    return () => { live = false; };
  }, [request, query, by]);
  useEffect(() => {
    let live = true;
    request(withParams('/audit/venue-comparison', query))
      .then((r) => { if (live) setVenue(r); }).catch(() => { if (live) setVenue({ status: 500, body: null }); });
    return () => { live = false; };
  }, [request, query]);

  const current = res && res.by === by ? res.json : null;
  const view = current && current.status === 200 ? describeRankPlot(current.body as RankingsApi) : null;
  const venueBody = venue && venue.status === 200 ? (venue.body as VenueApi) : null;

  return (
    <div data-testid="explain-panel" className="flex flex-col gap-5">
      <div data-testid="explain-rankings">
        <Panel title={PANEL_COPY.rankingsTitle}
          description={`Median execution cost per ${by === 'symbol' ? 'symbol' : 'hour of the day'}, with its 90% interval. Groups with fewer than 20 orders are not ranked.`}
          actions={<>
            <Segmented label="Group by" value={by} onChange={setBy} options={[['symbol', 'Symbol'], ['hour', 'Hour']]} />
            <Segmented label="Show as" value={as} onChange={setAs} options={[['chart', 'Chart'], ['table', 'Table']]} />
          </>}>
          {!current ? <p className="text-[13px] text-ui-graphite">Loading the rankings.</p>
            : !view ? <p className="text-[13px] text-ui-graphite">The rankings could not be loaded.</p>
              : view.empty ? <ValueState state="insufficient" label="Rankings" reason="no measured orders" />
                : (
                  <>
                    <div hidden={as !== 'chart'}>
                      {view.ranked.length ? <RankPlot view={view} /> : (
                        <div className="flex flex-col gap-3">
                          <ValueState state="insufficient" label="Rankings" reason={`no group has ${view.minOrders} measured orders`} />
                          <ul className="flex flex-wrap gap-x-5 gap-y-1">
                            {view.tooFew.map((g) => <li key={g.key} className="text-[13px] text-ui-graphite"><span className="text-ui-ink">{g.key}</span>: {g.text}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                    <div hidden={as !== 'table'}><RankTable view={view} /></div>
                  </>
                )}
        </Panel>
      </div>

      {venueBody && (
        <div data-testid="explain-venue">
          <Panel title={PANEL_COPY.venuesTitle} description="Venues are compared only inside the same symbol and size bucket.">
            <div className="flex flex-col gap-1.5">
              {venueBody.note && <p className="text-[13px] text-ui-graphite">{venueBody.note}</p>}
              {venueBody.buckets.map((b) => (
                <p key={`${b.symbol}:${b.bucket}`} className="text-[13px] text-ui-graphite">
                  <span className="text-ui-ink">{b.symbol} {b.bucket}</span>: {b.note ?? describeRankings({ by: 'venue', level: 0.9, minOrders: 20, groups: b.venues }).rows.join(' ')}
                </p>
              ))}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

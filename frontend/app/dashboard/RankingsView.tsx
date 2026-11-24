'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import { Card } from '../ui/blocks';
import { Disclosure } from '../ui/Disclosure';
import { EmptyState } from '../ui/EmptyState';
import { RankTable } from '../ui/charts/RankPlot';
import { CompareBars } from '../ui/charts/CompareBars';
import { describeRankPlot } from './rankingsView';
import { describeRankings, type RankingsApi, type VenueApi } from './explainView';

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
    <div role="group" aria-label={label} className="flex w-fit gap-0.5 rounded-lg border border-ui-rule bg-ui-overlay p-[3px] text-[14px]">
      <span className="sr-only">{label}</span>
      {options.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cn('min-h-8 rounded-md px-3 font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11', value === k ? 'bg-ui-raised text-ui-ink shadow-ui' : 'text-ui-graphite hover:text-ui-ink')}>{text}</button>
      ))}
    </div>
  );
}

/**
 * Comparisons (design v5; was Rankings): the median execution cost per group as horizontal bars with a 90% interval whisker and a
 * zero line, group names on the left. Groups under the order floor are not drawn: they are listed under "Too few orders to compare"
 * with their counts (a true finding about the data, PROPOSAL §4 row 11). Venues are compared only when the account has two.
 */
export default function RankingsView({ query, request }: Props) {
  const [by, setBy] = useState<'symbol' | 'hour'>('symbol');
  const [res, setRes] = useState<{ by: string; json: Json } | null>(null);
  const [venue, setVenue] = useState<Json | null>(null);
  const real = query === '';

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
  const venueBuckets = venueBody?.buckets.filter((b) => !b.note || b.venues.length > 1) ?? [];

  return (
    <div data-testid="explain-panel" className="flex flex-col gap-4">
      <div data-testid="explain-rankings">
        <Card title={`Median execution cost by ${by === 'symbol' ? 'symbol' : 'hour of the day'}`} id="compare"
          sentence="Each bar is a group's median. The whisker is its 90% interval; groups whose intervals overlap share a rank."
          info="Rank 1 paid the least. A group needs at least 20 measured orders to be compared; the others are listed below the chart with their counts."
          source="Your orders, measured against Binance public trades.">
          <Segmented label="Group by" value={by} onChange={setBy} options={[['symbol', 'Symbol'], ['hour', 'Hour']]} />
          {!current ? <p className="text-[14px] text-ui-graphite">Loading the comparisons.</p>
            : !view ? <p className="text-[14px] text-ui-graphite">The comparisons could not be loaded.</p>
              : view.empty ? <EmptyState title="No measured orders yet">Comparisons appear after the orders are synced and measured against public trades.</EmptyState>
                : (
                  <>
                    {view.ranked.length ? <CompareBars rows={view.ranked} level={view.level} /> : (
                      <p className="text-[14px] text-ui-ink" data-testid="compare-none">No group has {view.minOrders} measured orders yet, so none can be compared.</p>
                    )}
                    {view.ranked.some((r) => r.tie) ? (
                      <ul className="flex flex-col gap-0.5 text-[13px] text-ui-graphite">
                        {view.ranked.filter((r) => r.tie).map((r) => <li key={r.key}>{r.key}: {r.tie}</li>)}
                      </ul>
                    ) : null}
                    {view.tooFew.length ? (
                      <div data-testid="compare-too-few">
                        <h3 className="text-[14px] font-semibold text-ui-ink">Too few orders to compare (fewer than {view.minOrders})</h3>
                        <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                          {view.tooFew.map((g) => <li key={g.key} className="text-[14px] text-ui-graphite"><span className="text-ui-ink">{g.key}</span>: {g.n} {g.n === 1 ? 'order' : 'orders'}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {view.ranked.length ? <Disclosure summary="Show the same values as a table"><RankTable view={view} /></Disclosure> : null}
                  </>
                )}
        </Card>
      </div>

      {venueBuckets.length ? (
        <div data-testid="explain-venue">
          <Card title="Venues" sentence="Compared inside the same symbol and size bucket, from the account's own fills." id="venues"
            info="Venues are compared only inside the same symbol and size bucket, so a venue is never judged on bigger orders than another.">
            <div className="flex flex-col gap-1.5">
              {venueBuckets.map((b) => (
                <p key={`${b.symbol}:${b.bucket}`} className="text-[14px] text-ui-graphite">
                  <span className="text-ui-ink">{b.symbol} {b.bucket}</span>: {b.note ?? describeRankings({ by: 'venue', level: 0.9, minOrders: 20, groups: b.venues }).rows.join(' ')}
                </p>
              ))}
            </div>
          </Card>
        </div>
      ) : real && venueBody ? (
        <div data-testid="explain-venue" className="text-[14px] text-ui-graphite">
          Connect a second exchange to compare venues. <Link href="/app/connect" className="text-ui-ink">Connect an exchange</Link>
        </div>
      ) : null}
    </div>
  );
}

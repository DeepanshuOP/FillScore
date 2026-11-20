'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Banner } from '../ui/Banner';
import { describeQueue, nextStates, PANEL_COPY, type QueueApi } from './explainView';
import { OrderReplay } from './OrderReplay';
import { withParams } from './ordersTable';

type Json = { status: number; body: unknown };
interface Props {
  /** `?userId=demo-...` for a demo account, '' for a signed-in one. */
  query: string;
  /** A demo account is read-only: the queue is shown without review controls. */
  readOnly: boolean;
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Json>;
}

function StateBadge({ state, label }: { state: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ui-ink">
      {state === 'open' ? <span aria-hidden="true" className="size-2 rounded-full bg-ui-ink" />
        : state === 'reviewed' ? <Check aria-hidden="true" className="size-3.5 text-ui-measured" />
          : <span aria-hidden="true" className="size-2.5 rounded-full border border-dashed border-ui-graphite" />}
      {label}
    </span>
  );
}

const pill = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] text-ui-graphite ring-1 ring-ui-rule';

/** The queue of orders that met a rule, with review states. Every number comes from GET /api/audit/exceptions. */
export default function RulesView({ query, readOnly, request }: Props) {
  const [queue, setQueue] = useState<Json | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<{ orderId: string; symbol: string } | null>(null);
  const [open, setOpen] = useState(false);

  // State is set only in the answer of a request, never synchronously in an effect.
  useEffect(() => {
    let live = true;
    request(withParams('/audit/exceptions', query, showDismissed ? { includeDismissed: '1' } : {}))
      .then((res) => { if (live) setQueue(res); }).catch(() => { if (live) setQueue({ status: 500, body: null }); });
    return () => { live = false; };
  }, [request, query, showDismissed, reload]);

  const setState = async (orderId: string, symbol: string, state: string) => {
    const r = await request(withParams(`/audit/exceptions/${encodeURIComponent(orderId)}`, query, { symbol }), { method: 'PATCH', body: { state } });
    if (r.status === 200) setReload((n) => n + 1);
  };

  const q = queue ? describeQueue(queue.status, queue.body) : null;
  const counts = queue && queue.status === 200 ? (queue.body as QueueApi).reviewCounts : undefined;

  return (
    <div data-testid="explain-panel" className="flex flex-col gap-5">
      <Panel title={PANEL_COPY.queueTitle} description={q?.summary ?? (q ? "Orders whose stored measurements met one of the account's rules." : 'Loading the queue.')}
        actions={
          <label className="inline-flex min-h-8 items-center gap-2 text-[13px] text-ui-ink">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="size-4 accent-[var(--ui-action)]" /> {PANEL_COPY.showDismissed}
          </label>
        }>
        {!q ? (
          <div className="flex flex-col gap-2" aria-hidden="true">{[0, 1, 2].map((n) => <div key={n} className="h-9 rounded-[8px] bg-ui-overlay" />)}</div>
        ) : q.kind === 'error' ? <Banner kind="refused" title={q.note ?? 'The exception queue could not be loaded.'} /> : (
          <div className="flex flex-col gap-3">
            {q.threshold && <p className="text-[13px] text-ui-graphite">{q.threshold}</p>}
            {q.note && <p className="text-[13px] text-ui-graphite" data-testid="explain-queue-note">{q.note}</p>}
            {counts && (
              <div className="flex flex-wrap gap-2" aria-label="Review states">
                <span className={pill}>Open <span className="tabular-nums text-ui-ink">{counts.open}</span></span>
                <span className={pill}>Reviewed <span className="tabular-nums text-ui-ink">{counts.reviewed}</span></span>
                <span className={pill}>Dismissed <span className="tabular-nums text-ui-ink">{counts.dismissed}</span></span>
              </div>
            )}
            <div data-testid="explain-queue">
              {q.kind === 'empty' ? <EmptyState title="No order met a rule." /> : q.items.length > 0 && (
                <div className="overflow-x-auto rounded-[12px] ring-1 ring-inset ring-ui-rule">
                  <table className="w-full border-collapse text-[13px] text-ui-ink">
                    <thead>
                      <tr className="text-left text-[12px] font-medium text-ui-graphite">
                        {['Order id', 'Symbol', 'Finding', 'Cost', 'Rules', 'State', 'Actions'].map((h) => (
                          <th key={h} scope="col" className={cn('bg-ui-raised px-3 py-2 whitespace-nowrap', h === 'Cost' && 'text-right')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {q.items.map((i) => (
                        <tr key={`${i.symbol}:${i.orderId}`} data-testid="explain-item" tabIndex={0}
                          onClick={() => { setSelected({ orderId: i.orderId, symbol: i.symbol }); setOpen(true); }}
                          onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelected({ orderId: i.orderId, symbol: i.symbol }); setOpen(true); } }}
                          className="cursor-pointer border-t border-ui-rule align-top hover:bg-ui-overlay/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-action">
                          <td className="px-3 py-2.5 font-ui-mono text-[12px] whitespace-nowrap">{i.orderId}</td>
                          <td className="px-3 py-2.5 whitespace-nowrap">{i.symbol}</td>
                          <td className="min-w-[16rem] px-3 py-2.5 text-[13px]">{i.finding}</td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap tabular-nums">{i.usd}</td>
                          <td className="px-3 py-2.5">
                            <span className="flex flex-wrap gap-1">
                              {i.ruleLabels.map((r) => <span key={r} className="rounded-full px-2 text-[11px] leading-5 text-ui-graphite ring-1 ring-ui-rule">{r}</span>)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap"><StateBadge state={i.state} label={i.stateLabel} /></td>
                          <td className="px-3 py-2.5">
                            <span className="flex flex-wrap gap-1.5">
                              {nextStates(i.state, readOnly).map(([s, label]) => (
                                <Button key={s} size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void setState(i.orderId, i.symbol, s); }}>{label}</Button>
                              ))}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Panel>

      {selected && <OrderReplay open={open} onOpenChange={setOpen} orderId={selected.orderId} symbol={selected.symbol} query={query} request={request} />}
    </div>
  );
}

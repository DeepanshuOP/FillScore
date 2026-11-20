'use client';

import { useEffect, useState } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Banner } from '../ui/Banner';
import { PenCircle } from '../ui/PenMarks';
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

/** Review state as a printed mark: open (filled square), reviewed (a struck tick), dismissed (dashed box). Words carry it. */
function StateMark({ state, label }: { state: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[12px] text-ui-ink">
      {state === 'open' ? <span aria-hidden="true" className="size-2 bg-ui-ink" />
        : state === 'reviewed' ? <span aria-hidden="true" className="h-2 w-3 -translate-y-px -rotate-45 border-b-2 border-l-2 border-ui-ink" />
          : <span aria-hidden="true" className="size-2.5 border border-dashed border-ui-graphite" />}
      {label.toUpperCase()}
    </span>
  );
}

/**
 * Rules (design v3): the queue of orders that met a rule, as ledger rows. The pen circles the cost that met the rule and
 * the rule is written beside it in pen-ink words (the circle never states anything alone). Signed-in accounts get the
 * review actions; a demo account is read-only. Every number comes from GET /api/audit/exceptions.
 */
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
  const pick = (orderId: string, symbol: string) => { setSelected({ orderId, symbol }); setOpen(true); };

  const q = queue ? describeQueue(queue.status, queue.body) : null;
  const counts = queue && queue.status === 200 ? (queue.body as QueueApi).reviewCounts : undefined;

  return (
    <div data-testid="explain-panel" className="flex flex-col gap-5">
      <Panel title={PANEL_COPY.queueTitle} description={q?.summary ?? (q ? "Orders whose stored measurements met one of the account's rules." : 'Loading the queue.')}
        actions={
          <label className="inline-flex min-h-8 items-center gap-2 text-sm text-ui-ink">
            <input type="checkbox" checked={showDismissed} onChange={(e) => setShowDismissed(e.target.checked)} className="size-4 accent-[var(--ui-ink)]" /> {PANEL_COPY.showDismissed}
          </label>
        }>
        {!q ? (
          <p className="font-mono text-[12px] text-ui-graphite">READING THE QUEUE</p>
        ) : q.kind === 'error' ? <Banner kind="refused" title={q.note ?? 'The exception queue could not be loaded.'} /> : (
          <div className="flex flex-col gap-4">
            {q.threshold && <p className="text-sm text-ui-graphite">{q.threshold}</p>}
            {q.note && <p className="text-sm text-ui-graphite" data-testid="explain-queue-note">{q.note}</p>}
            {counts && (
              <dl className="flex flex-wrap gap-x-8 gap-y-1 font-mono text-[12px]" aria-label="Review states">
                <div className="flex gap-2"><dt className="text-ui-graphite">OPEN</dt><dd className="text-ui-ink">{counts.open}</dd></div>
                <div className="flex gap-2"><dt className="text-ui-graphite">REVIEWED</dt><dd className="text-ui-ink">{counts.reviewed}</dd></div>
                <div className="flex gap-2"><dt className="text-ui-graphite">DISMISSED</dt><dd className="text-ui-ink">{counts.dismissed}</dd></div>
              </dl>
            )}
            <div data-testid="explain-queue">
              {q.kind === 'empty' ? <EmptyState title="No order met a rule." /> : q.items.length > 0 && (
                <ul className="border-t border-ui-ink">
                  {q.items.map((i, n) => (
                    <li key={`${i.symbol}:${i.orderId}`} data-testid="explain-item" tabIndex={0}
                      onClick={() => pick(i.orderId, i.symbol)}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(i.orderId, i.symbol); } }}
                      className="grid cursor-pointer gap-x-6 gap-y-2 border-b border-dashed border-ui-rule py-4 hover:bg-ui-raised focus-visible:outline-2 focus-visible:-outline-offset-2 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_auto] md:items-start">
                      <div className="min-w-0 font-mono text-[12px]">
                        <p className="truncate text-ui-ink">{i.orderId}</p>
                        <p className="text-ui-graphite">{i.symbol}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[15px] leading-snug text-ui-ink">{i.finding}</p>
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="font-mono text-[13px] text-ui-ink"><PenCircle seed={n + 3}>{i.usd}</PenCircle></span>
                          <span className="text-[13px] font-bold text-ui-pen-ink">Met: {i.ruleLabels.join('; ')}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3 md:justify-end">
                        <StateMark state={i.state} label={i.stateLabel} />
                        {nextStates(i.state, readOnly).map(([s, label]) => (
                          <Button key={s} size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); void setState(i.orderId, i.symbol, s); }}>{label}</Button>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Panel>

      {selected && <OrderReplay open={open} onOpenChange={setOpen} orderId={selected.orderId} symbol={selected.symbol} query={query} request={request}
        demo={readOnly} evidenceHref={readOnly ? undefined : withParams('/dashboard', query, { view: 'evidence' })} />}
    </div>
  );
}

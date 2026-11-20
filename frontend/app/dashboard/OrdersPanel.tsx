'use client';
import React from 'react';
import { DataTable, type Column } from '../ui/DataTable';
import { Panel } from '../ui/Panel';
import { StatBlock, StatList } from '../ui/StatBlock';
import { describeOrders } from './ordersView';

interface Term { label: string; usd: string; bps: string; n: string }

const TERM_COLUMNS: Column<Term>[] = [
  { key: 'term', header: 'Term', sortValue: (r) => r.label, cell: (r) => r.label },
  { key: 'usd', header: 'Total, USD', numeric: true, cell: (r) => (r.usd === 'not computed' ? null : r.usd) },
  { key: 'bps', header: 'Share of intended value, bps', numeric: true, priority: 'low', cell: (r) => (r.bps === 'not computed' ? null : r.bps) },
];

/** Measured order views: outcomes, resting time of limit orders, implementation shortfall, unfilled orders.
 *  All numbers come from GET /api/audit/orders-summary (stored documents, deterministic statistics). */
export default function OrdersPanel({ body }: { body: unknown }) {
  const v = describeOrders(body);
  if (!v) return null;
  return (
    <div data-testid="orders-panel">
      <Panel id="orders" title="Orders and outcomes" description="How the orders ended, how long limit orders rested, and what each term of the cost added up to.">
        <div className="flex flex-col gap-8">
          <StatList className="sm:grid-cols-3 lg:grid-cols-5">
            {v.outcomes.map(([k, val]) => (
              // a count of orders is a plain figure: the measured marker stays on costs, so it keeps its meaning
              <StatBlock key={k} label={k}><span role="group" aria-label={`${k}: ${val}`} className="text-[1.25rem] leading-7 font-semibold tabular-nums text-ui-ink">{val}</span></StatBlock>
            ))}
          </StatList>

          {v.resting && (
            <div data-testid="orders-resting">
              <h3 className="text-base font-semibold text-ui-ink">Resting time of limit orders</h3>
              <p className="mt-1 text-ui-graphite">Median {v.resting.median}, 90th percentile {v.resting.p90} ({v.resting.n}).</p>
            </div>
          )}

          {v.shortfall && (
            <div data-testid="orders-shortfall">
              <h3 className="text-base font-semibold text-ui-ink">Median shortfall per order</h3>
              <dl className="mt-2 grid gap-x-10 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                {v.shortfall.map(([k, val]) => (
                  <div key={k} className="flex items-baseline justify-between gap-4 border-b border-ui-rule py-1">
                    <dt className="text-ui-graphite">{k}</dt>
                    <dd className="tabular-nums text-ui-ink">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-sm text-ui-graphite">{v.shortfallNote} These are medians, so the terms do not add up to the median total.</p>
            </div>
          )}

          {v.totals && (
            <div data-testid="orders-totals">
              <h3 className="mb-2 text-base font-semibold text-ui-ink">Total over all orders, by term</h3>
              <DataTable caption="Total cost by term, in US dollars and basis points of the intended value" columns={TERM_COLUMNS}
                rows={v.totals} rowId={(r) => r.label} maxHeight="24rem" />
              <p className="mt-2 text-sm text-ui-graphite">
                Each line adds up the orders that have that term; the bps share is over the intended value of those orders.
              </p>
            </div>
          )}

          {v.unfilledNote && <p className="text-ui-ink" data-testid="orders-unfilled">{v.unfilledNote}</p>}
          <p className="text-sm text-ui-graphite">These costs coincided with the orders; the audit does not show what caused them.</p>
        </div>
      </Panel>
    </div>
  );
}

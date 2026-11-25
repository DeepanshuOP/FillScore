'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card } from '../ui/blocks';
import { Banner } from '../ui/Banner';
import { EmptyState } from '../ui/EmptyState';
import { BPS_GLOSS } from './costsView';
import { Button, buttonClass } from '../ui/Button';
import { OrderReplay } from './OrderReplay';
import { countsLine, defaultOrderColumns, FEE_PENDING, feesCell, feesTitle, formatUtc, isUnfilled, ledgerRows, notionalCell, orderCountsOf, statusLabel, withParams, type OrderCounts, type OrderRow } from './ordersTable';
import { bps as fmtBps, money } from '../lib/format';
import { FEE_LINE } from './receiptCopy';

type Json = { status: number; body: unknown };
interface Props {
  /** `?userId=demo-...` for a demo account, '' for a signed-in one. */
  query: string;
  mode: 'demo' | 'real';
  auth: { accessToken: string | null | undefined; refreshAccessToken: unknown };
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Json>;
  openOrderId: string | null;
}

const PAGE = 50;
const col = createColumnHelper<OrderRow>();
const NUM = 'text-right tabular-nums';

const fmtQty = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });
const muted = (t: string) => <span className="text-ui-graphite">{t}</span>;

/**
 * The columns (design v5, PROPOSAL §3.3): the measure that matters is a default column, so Cost ($) and Cost (bps) show at once;
 * headers are sentence case at 13 px. A demo's fee column says "published rate" in its header, because no market data checks it.
 * An unfilled order's cost reads "modelled, not paid"; an order with no fills has no maker share and says "No fills".
 */
function makeColumns(demo: boolean) {
  return [
    col.accessor((r) => Date.parse(r.when) || 0, { id: 'when', header: 'Placed (UTC)', meta: { label: 'Placed' }, cell: (c) => <span>{formatUtc(c.row.original.when)}</span> }),
    col.accessor('symbol', { header: 'Symbol', meta: { label: 'Symbol' }, cell: (c) => <span className="text-ui-ink">{c.getValue()}</span> }),
    col.accessor('side', { header: 'Side', meta: { label: 'Side' }, cell: (c) => (c.getValue() === 'BUY' ? 'Buy' : 'Sell') }),
    col.accessor('type', { header: 'Type', meta: { label: 'Type' }, cell: (c) => (c.getValue() === 'Not recorded' ? muted('Not recorded') : c.getValue()) }),
    col.accessor((r) => statusLabel(r.status), { id: 'status', header: 'Status', meta: { label: 'Status' },
      cell: (c) => (c.row.original.fills === 0 || c.row.original.status === null ? muted(c.getValue()) : c.getValue()) }),
    col.accessor((r) => r.orderId || r.key, { id: 'orderId', header: 'Order id', meta: { label: 'Order id' },
      cell: (c) => <span className="font-ui-mono text-[13px]">{c.row.original.orderId || 'not recorded'}</span> }),
    // the server's total cost of the order (negative = price improvement)
    col.accessor((r) => r.cost?.usd ?? undefined, { id: 'cost', header: 'Cost ($)', sortUndefined: 'last', meta: { label: 'Cost ($)', numeric: true },
      cell: (c) => {
        const r = c.row.original;
        if (!r.cost) return muted('not computed');
        return <span>{money(r.cost.usd)}{isUnfilled(r) ? <span className="block text-[12px] leading-none text-ui-graphite">modelled, not paid</span> : null}</span>;
      } }),
    col.accessor((r) => r.cost?.bps ?? undefined, { id: 'costBps', header: 'Cost (bps)', sortUndefined: 'last', meta: { label: 'Cost (bps)', numeric: true },
      cell: (c) => (c.row.original.cost ? fmtBps(c.row.original.cost.bps) : muted('not computed')) }),
    col.accessor('fills', { header: 'Fills', meta: { label: 'Fills', numeric: true }, cell: (c) => c.getValue() }),
    col.accessor('quantity', { header: 'Quantity', meta: { label: 'Quantity', numeric: true }, cell: (c) => fmtQty(c.getValue()) }),
    col.accessor('notionalUsd', { header: 'Notional', meta: { label: 'Notional', numeric: true }, cell: (c) => notionalCell(c.row.original) }),
    col.accessor((r) => r.feesUsd ?? undefined, { id: 'feesUsd', header: demo ? FEE_LINE : 'Fees', sortUndefined: 'last', meta: { label: demo ? FEE_LINE : 'Fees', numeric: true },
      cell: (c) => { const t = feesCell(c.row.original); return t === null ? <span className="rounded-md border border-dashed border-ui-edge px-1.5 py-0.5 text-ui-graphite" title={FEE_PENDING.title} data-testid="fee-pending">{FEE_PENDING.text}</span> : <span title={feesTitle(c.row.original)}>{t}</span> } }),
    col.accessor((r) => r.makerShare ?? undefined, { id: 'makerShare', header: 'Maker share', sortUndefined: 'last', meta: { label: 'Maker share', numeric: true },
      cell: (c) => (c.row.original.makerShare === null ? muted(c.row.original.fills === 0 ? 'No fills' : 'insufficient data') : `${Math.round(c.row.original.makerShare * 100)}%`) }),
  ];
}

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> { label: string; numeric?: boolean }
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-lg border border-ui-rule bg-ui-overlay p-[3px] text-[14px]">
      {options.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cn('min-h-8 rounded-md px-3 font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11', value === k ? 'bg-ui-raised text-ui-ink shadow-ui' : 'text-ui-graphite hover:text-ui-ink')}>{text}</button>
      ))}
    </div>
  );
}

/** A phone row: the order as a card (time, symbol, side and type on the first lines, the cost on the right). */
function OrderCard({ r, onPick }: { r: OrderRow; onPick: (r: OrderRow, el: HTMLElement) => void }) {
  return (
    <li>
      <button type="button" data-testid="orders-card" disabled={!r.orderId} onClick={(e) => onPick(r, e.currentTarget)}
        className="flex min-h-16 w-full items-start justify-between gap-3 border-b border-ui-rule py-2.5 text-left">
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-ui-ink">{r.symbol}, {r.side === 'BUY' ? 'buy' : 'sell'} {r.type === 'Not recorded' ? '' : r.type.toLowerCase()}</span>
          <span className="block text-[13px] text-ui-graphite">{formatUtc(r.when)} UTC</span>
          <span className="block text-[13px] text-ui-graphite">{r.fills === 0 ? statusLabel(r.status) : `${fmtQty(r.quantity)} for ${notionalCell(r)}`}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[15px] font-semibold tabular-nums text-ui-ink">{r.cost ? money(r.cost.usd) : 'not computed'}</span>
          <span className="block text-[13px] text-ui-graphite">{r.cost ? (isUnfilled(r) ? 'modelled, not paid' : fmtBps(r.cost.bps)) : ''}</span>
        </span>
      </button>
    </li>
  );
}

/** Orders: the fills of the account grouped into orders, sortable and filterable. A row opens the order replay. */
export default function OrdersView({ query, mode, request, openOrderId }: Props) {
  const [load, setLoad] = useState<{ query: string; rows: OrderRow[]; counts: OrderCounts } | 'error' | null>(null);
  const [text, setText] = useState('');
  const [side, setSide] = useState<'all' | 'BUY' | 'SELL'>('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'when', desc: true }]);
  const [visibility, setVisibility] = useState<VisibilityState>(() => defaultOrderColumns(typeof window === 'undefined' ? 1440 : window.innerWidth));
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<{ orderId: string; symbol: string; row?: OrderRow; origin?: DOMRect | null } | null>(null);
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const opened = useRef(false);
  const columns = useMemo(() => makeColumns(mode === 'demo'), [mode]);

  // State is set only in the answer of the request. The order named in the address opens once, when the rows arrive.
  useEffect(() => {
    let live = true;
    request(withParams('/audit/orders-ledger', query))
      .then((res) => {
        if (!live) return;
        if (res.status !== 200 || !res.body) { setLoad('error'); return; }
        // every stored order, filled or not, and the counts, as the server sent them (GET /audit/orders-ledger)
        const rows = ledgerRows(res.body) ?? [];
        setLoad({ query, rows, counts: orderCountsOf(res.body) ?? { orders: 0, withFills: 0, fills: 0, unrecorded: 0 } });
        if (openOrderId && !opened.current) {
          opened.current = true;
          const hit = rows.find((r) => r.orderId === openOrderId);
          setSelected(hit ? { orderId: hit.orderId, symbol: hit.symbol, row: hit } : { orderId: openOrderId, symbol: '' });
          setOpen(true);
        }
      })
      .catch(() => { if (live) setLoad('error'); });
    return () => { live = false; };
  }, [request, query, openOrderId]);

  const rows = useMemo(() => {
    if (!load || load === 'error') return [];
    const needle = text.trim().toLowerCase();
    return load.rows.filter((r) => (side === 'all' || r.side === side) && (!needle || r.symbol.toLowerCase().includes(needle) || r.orderId.toLowerCase().includes(needle)));
  }, [load, text, side]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows, columns, state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting, onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getRowId: (r) => r.key,
  });
  const sortedRows = table.getRowModel().rows;
  const visible = sortedRows.slice(0, shown);

  const pick = (r: OrderRow, el?: HTMLElement) => {
    if (!r.orderId) return;   // a trade without an order id has no replay
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected({ orderId: r.orderId, symbol: r.symbol, row: r, origin: el ? el.getBoundingClientRect() : null });
    setOpen(true);
  };
  /** The sheet has no trigger, so hand focus back to the row that opened it (keyboard users keep their place). */
  const restoreFocus = (e: Event) => { const el = returnFocus.current; if (el?.isConnected) { e.preventDefault(); el.focus(); } };

  const loaded = load && load !== 'error' ? load : null;
  return (
    <div data-testid="orders-view" className="flex flex-col gap-4">
      <Card title="All orders" id="orders" sentence={loaded ? countsLine(loaded.counts) : 'Loading the orders.'}
        info="Select a row to open its receipt. Sort by a column heading; the Columns menu adds the order id, fills, quantity and maker share."
        source="Your orders, measured against Binance public trades.">
        {load === 'error' ? <Banner kind="refused" title="The orders could not be loaded" />
          : !loaded ? (
            <div className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="h-11 rounded-lg bg-ui-overlay" />)}
            </div>
          ) : loaded.rows.length === 0 ? <EmptyState title="No orders yet">No orders or fills were stored for this account. Connect an exchange and sync to see them here.</EmptyState>
            : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                    <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ui-graphite" />
                    <input type="search" value={text} onChange={(e) => { setText(e.target.value); setShown(PAGE); }} aria-label="Filter by symbol or order id" placeholder="Symbol or order id"
                      className="h-9 w-full rounded-lg bg-ui-raised pr-3 pl-8 text-[14px] text-ui-ink ring-1 ring-inset ring-ui-edge placeholder:text-ui-graphite pointer-coarse:h-11" />
                  </label>
                  <Segmented label="Side" value={side} onChange={(v) => { setSide(v); setShown(PAGE); }} options={[['all', 'All'], ['BUY', 'Buy'], ['SELL', 'Sell']]} />
                  <DropdownMenu>
                    <DropdownMenuTrigger className={buttonClass('secondary', 'sm', 'ml-auto max-sm:hidden')}><Columns3 aria-hidden="true" /> Columns</DropdownMenuTrigger>
                    <DropdownMenuContent align="end" data-app>
                      {table.getAllLeafColumns().map((c) => (
                        <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                          {c.columnDef.meta?.label ?? c.id}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-[14px] text-ui-graphite" data-testid="bps-gloss">{BPS_GLOSS}</p>
                {sortedRows.length === 0 ? <EmptyState title="No order matches the filter" /> : (
                  <>
                    <ul className="sm:hidden" aria-label="Orders">{visible.map((row) => <OrderCard key={row.id} r={row.original} onPick={pick} />)}</ul>
                    <div role="region" aria-label="Orders ledger" tabIndex={0} className="relative max-h-[640px] overflow-auto rounded-lg border border-ui-rule max-sm:hidden">
                      <table className="w-full border-collapse text-[14px] text-ui-ink">
                        <thead>
                          {table.getHeaderGroups().map((hg) => (
                            <tr key={hg.id}>
                              {hg.headers.map((h) => {
                                const dir = h.column.getIsSorted();
                                const numeric = h.column.columnDef.meta?.numeric;
                                return (
                                  <th key={h.id} scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                                    className={cn('sticky top-0 z-10 bg-ui-overlay px-3 py-2.5 text-[13px] font-medium whitespace-nowrap text-ui-graphite shadow-[inset_0_-1px_0_var(--ui-rule)]', numeric ? 'text-right' : 'text-left')}>
                                    <button type="button" onClick={h.column.getToggleSortingHandler()}
                                      className={cn('inline-flex items-center gap-1 hover:text-ui-ink', numeric && 'flex-row-reverse', dir && 'text-ui-ink')}>
                                      {flexRender(h.column.columnDef.header, h.getContext())}
                                      {dir === 'asc' ? <ArrowUp aria-hidden="true" className="size-3.5" /> : dir === 'desc' ? <ArrowDown aria-hidden="true" className="size-3.5" /> : <ChevronsUpDown aria-hidden="true" className="size-3.5 opacity-60" />}
                                    </button>
                                  </th>
                                );
                              })}
                            </tr>
                          ))}
                        </thead>
                        <tbody>
                          {visible.map((row) => (
                            <tr key={row.id} data-testid="orders-row" tabIndex={row.original.orderId ? 0 : undefined}
                              onClick={(e) => pick(row.original, e.currentTarget)}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(row.original); } }}
                              className={cn('h-11 border-t border-ui-rule focus-visible:outline-2 focus-visible:-outline-offset-2', row.original.orderId && 'cursor-pointer hover:bg-ui-overlay')}>
                              {row.getVisibleCells().map((cell) => (
                                <td key={cell.id} className={cn('px-3 py-1.5 whitespace-nowrap tabular-nums', cell.column.columnDef.meta?.numeric ? NUM : 'text-left')}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {sortedRows.length > shown && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-ui-graphite">Showing {shown} of {sortedRows.length} orders.</p>
                    <Button variant="quiet" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show {PAGE} more</Button>
                  </div>
                )}
              </div>
            )}
      </Card>

      {selected && (
        <OrderReplay open={open} onOpenChange={setOpen} onCloseAutoFocus={restoreFocus} orderId={selected.orderId} symbol={selected.symbol} query={query} request={request} row={selected.row} origin={selected.origin}
          demo={mode === 'demo'} evidenceHref={mode === 'real' ? withParams('/app/reports', query, {}) : undefined} />
      )}
    </div>
  );
}

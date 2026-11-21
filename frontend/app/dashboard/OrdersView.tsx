'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState, type VisibilityState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Search } from 'lucide-react';
import { cn } from '../../lib/utils';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Panel } from '../ui/Panel';
import { Banner } from '../ui/Banner';
import { EmptyState } from '../ui/EmptyState';
import { Button, buttonClass } from '../ui/Button';
import { formatUsd } from '../ui/format';
import { OrderReplay } from './OrderReplay';
import { countsLine, formatUtc, ledgerRows, orderCountsOf, statusLabel, withParams, type OrderCounts, type OrderRow } from './ordersTable';

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

const COLUMNS = [
  col.accessor((r) => Date.parse(r.when) || 0, { id: 'when', header: 'Placed (UTC)', meta: { label: 'Placed' }, cell: (c) => <span className="tabular-nums">{formatUtc(c.row.original.when)}</span> }),
  col.accessor('symbol', { header: 'Symbol', meta: { label: 'Symbol' }, cell: (c) => <span className="text-ui-ink">{c.getValue()}</span> }),
  col.accessor('side', { header: 'Side', meta: { label: 'Side' }, cell: (c) => (c.getValue() === 'BUY' ? 'Buy' : 'Sell') }),
  col.accessor('type', { header: 'Type', meta: { label: 'Type' }, cell: (c) => (c.getValue() === 'Not recorded' ? <span className="text-ui-graphite">Not recorded</span> : c.getValue()) }),
  col.accessor((r) => statusLabel(r.status), { id: 'status', header: 'Status', meta: { label: 'Status' },
    cell: (c) => (c.row.original.fills === 0 || c.row.original.status === null ? <span className="text-ui-graphite">{c.getValue()}</span> : c.getValue()) }),
  col.accessor((r) => r.orderId || r.key, { id: 'orderId', header: 'Order id', meta: { label: 'Order id' },
    cell: (c) => <span className="font-ui-mono text-[12px]">{c.row.original.orderId || 'not recorded'}</span> }),
  col.accessor('fills', { header: 'Fills', meta: { label: 'Fills', numeric: true }, cell: (c) => c.getValue() }),
  col.accessor('quantity', { header: 'Quantity', meta: { label: 'Quantity', numeric: true }, cell: (c) => fmtQty(c.getValue()) }),
  col.accessor('notionalUsd', { header: 'Notional', meta: { label: 'Notional', numeric: true }, cell: (c) => formatUsd(c.getValue()) }),
  col.accessor((r) => r.feesUsd ?? undefined, { id: 'feesUsd', header: 'Fees', sortUndefined: 'last', meta: { label: 'Fees', numeric: true },
    cell: (c) => (c.row.original.feesUsd === null ? <span className="text-ui-graphite">not computed</span> : formatUsd(c.row.original.feesUsd)) }),
  col.accessor((r) => r.makerShare ?? undefined, { id: 'makerShare', header: 'Maker share', sortUndefined: 'last', meta: { label: 'Maker share', numeric: true },
    cell: (c) => (c.row.original.makerShare === null ? <span className="text-ui-graphite">insufficient data</span> : `${Math.round(c.row.original.makerShare * 100)}%`) }),
];

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> { label: string; numeric?: boolean }
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-full border border-ui-edge p-[3px] text-[13px]">
      {options.map(([k, text]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={cn('h-7 rounded-full px-3 font-medium transition-colors', value === k ? 'bg-ui-ink text-ui-surface' : 'text-ui-graphite hover:text-ui-ink')}>{text}</button>
      ))}
    </div>
  );
}

/** Orders: the fills of the account grouped into orders, sortable and filterable. A row opens the order replay. */
export default function OrdersView({ query, mode, request, openOrderId }: Props) {
  const [load, setLoad] = useState<{ query: string; rows: OrderRow[]; counts: OrderCounts } | 'error' | null>(null);
  const [text, setText] = useState('');
  const [side, setSide] = useState<'all' | 'BUY' | 'SELL'>('all');
  const [sorting, setSorting] = useState<SortingState>([{ id: 'when', desc: true }]);
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<{ orderId: string; symbol: string; row?: OrderRow } | null>(null);
  const [open, setOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const opened = useRef(false);

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
    data: rows, columns: COLUMNS, state: { sorting, columnVisibility: visibility },
    onSortingChange: setSorting, onColumnVisibilityChange: setVisibility,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(), getRowId: (r) => r.key,
  });
  const sortedRows = table.getRowModel().rows;
  const visible = sortedRows.slice(0, shown);

  const pick = (r: OrderRow) => {
    if (!r.orderId) return;   // a trade without an order id has no replay
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelected({ orderId: r.orderId, symbol: r.symbol, row: r });
    setOpen(true);
  };
  /** The sheet has no trigger, so hand focus back to the row that opened it (keyboard users keep their place). */
  const restoreFocus = (e: Event) => { const el = returnFocus.current; if (el?.isConnected) { e.preventDefault(); el.focus(); } };

  const loaded = load && load !== 'error' ? load : null;
  return (
    <div data-testid="orders-view" className="flex flex-col gap-5">
      <Panel title="Orders"
        description={loaded ? `${countsLine(loaded.counts)} Select a row to print its receipt.` : 'Loading the orders.'}
        actions={mode === 'demo' ? <span className="text-[12px] text-ui-graphite">Synthetic trader, real prices</span> : null}>
        {load === 'error' ? <Banner kind="refused" title="The orders could not be loaded" />
          : !loaded ? (
            <div className="flex flex-col gap-2" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="h-9 rounded-[8px] bg-ui-overlay" />)}
            </div>
          ) : loaded.rows.length === 0 ? <EmptyState title="No orders yet">No orders or fills were stored for this account.</EmptyState>
            : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative min-w-[12rem] flex-1 sm:max-w-xs">
                    <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ui-graphite" />
                    <input type="search" value={text} onChange={(e) => { setText(e.target.value); setShown(PAGE); }} aria-label="Filter by symbol or order id" placeholder="Symbol or order id"
                      className="h-9 w-full rounded-[4px] bg-ui-raised pr-3 pl-8 text-sm text-ui-ink ring-1 ring-inset ring-ui-edge placeholder:text-ui-graphite" />
                  </label>
                  <Segmented label="Side" value={side} onChange={(v) => { setSide(v); setShown(PAGE); }} options={[['all', 'All'], ['BUY', 'Buy'], ['SELL', 'Sell']]} />
                  <DropdownMenu>
                    <DropdownMenuTrigger className={buttonClass('secondary', 'sm', 'ml-auto')}><Columns3 aria-hidden="true" /> Columns</DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {table.getAllLeafColumns().map((c) => (
                        <DropdownMenuCheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)} onSelect={(e) => e.preventDefault()}>
                          {c.columnDef.meta?.label ?? c.id}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {sortedRows.length === 0 ? <EmptyState title="No order matches the filter" /> : (
                  <div role="region" aria-label="Orders ledger" tabIndex={0} className="relative max-h-[640px] overflow-auto border-t border-ui-ink">
                    <table className="w-full border-collapse font-mono text-[13px] text-ui-ink">
                      <thead>
                        {table.getHeaderGroups().map((hg) => (
                          <tr key={hg.id}>
                            {hg.headers.map((h) => {
                              const dir = h.column.getIsSorted();
                              const numeric = h.column.columnDef.meta?.numeric;
                              return (
                                <th key={h.id} scope="col" aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                                  className={cn('sticky top-0 z-10 bg-ui-surface px-3 py-2 font-mono text-[11px] font-normal tracking-[0.06em] whitespace-nowrap text-ui-graphite uppercase shadow-[inset_0_-1px_0_var(--ui-ink)]', numeric ? 'text-right' : 'text-left')}>
                                  <button type="button" onClick={h.column.getToggleSortingHandler()}
                                    className={cn('inline-flex items-center gap-1 font-mono tracking-[0.06em] uppercase hover:text-ui-ink', numeric && 'flex-row-reverse', dir && 'text-ui-ink')}>
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
                            onClick={() => pick(row.original)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(row.original); } }}
                            className={cn('border-t border-dashed border-ui-rule focus-visible:outline-2 focus-visible:-outline-offset-2', row.original.orderId && 'cursor-pointer hover:bg-ui-raised')}>
                            {row.getVisibleCells().map((cell) => (
                              <td key={cell.id} className={cn('px-3 py-2 whitespace-nowrap', cell.column.columnDef.meta?.numeric ? NUM : 'text-left')}>
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {sortedRows.length > shown && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[13px] text-ui-graphite">Showing {shown} of {sortedRows.length} orders.</p>
                    <Button variant="quiet" size="sm" onClick={() => setShown((n) => n + PAGE)}>Show {PAGE} more</Button>
                  </div>
                )}
              </div>
            )}
      </Panel>

      {selected && (
        <OrderReplay open={open} onOpenChange={setOpen} onCloseAutoFocus={restoreFocus} orderId={selected.orderId} symbol={selected.symbol} query={query} request={request} row={selected.row}
          demo={mode === 'demo'} evidenceHref={mode === 'real' ? withParams('/dashboard', query, { view: 'evidence' }) : undefined} />
      )}
    </div>
  );
}

'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { cn } from '../../lib/utils';
import { track } from '../lib/track';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { Banner } from '../ui/Banner';
import { ValueState } from '../ui/ValueState';
import { formatSignedBps, formatUsd } from '../ui/format';
import { describeReplay, type ReplayApi } from './explainView';
import { formatUtc, withParams, type OrderRow } from './ordersTable';

type Json = { status: number; body: unknown };
type ReplayBody = ReplayApi & { order?: { side?: string | null; orderType?: string | null; type?: string | null } };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  symbol: string;
  /** `?userId=demo-...` for a demo account, '' for a signed-in one. */
  query: string;
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Json>;
  row?: OrderRow;
}

/** True when the viewport is at least `minWidth` px wide. The server and the first client render assume a desktop. */
function useMediaQuery(minWidth: number): boolean {
  const q = `(min-width: ${minWidth}px)`;
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(q); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(q).matches,
    () => true,
  );
}

const fmtNum = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 8 });

const W = 520, H = 200, PAD = { l: 64, r: 16, t: 14, b: 26 };

/** The fills of one order on a time (x) by price (y) plane. Diamonds are sized by quantity; the line steps through the fills. */
function FillTape({ fills }: { fills: ReplayApi['fills'] }) {
  const pts = fills.map((f) => ({ t: Date.parse(f.time), p: f.price, q: f.quantity, time: f.time, notional: f.notional })).filter((f) => Number.isFinite(f.t) && Number.isFinite(f.p));
  if (!pts.length) return <ValueState state="insufficient" label="Fill tape" reason="no fills with a time and a price were stored" size="cell" />;
  const t0 = Math.min(...pts.map((p) => p.t)), t1 = Math.max(...pts.map((p) => p.t));
  const span = Math.max(t1 - t0, 1000);
  const xLo = t0 - span * 0.1, xHi = t0 + span + span * 0.1;
  const pMin = Math.min(...pts.map((p) => p.p)), pMax = Math.max(...pts.map((p) => p.p));
  const padP = pMax > pMin ? (pMax - pMin) * 0.2 : (Math.abs(pMax) * 0.002 || 1);
  const yLo = pMin - padP, yHi = pMax + padP;
  const x = (t: number) => PAD.l + ((t - xLo) / (xHi - xLo)) * (W - PAD.l - PAD.r);
  const y = (p: number) => PAD.t + (1 - (p - yLo) / (yHi - yLo)) * (H - PAD.t - PAD.b);
  const qMax = Math.max(...pts.map((p) => p.q)), qMin = Math.min(...pts.map((p) => p.q));
  const size = (q: number) => (qMax > qMin ? 8 + ((q - qMin) / (qMax - qMin)) * 6 : 10);
  const ordered = [...pts].sort((a, b) => a.t - b.t);
  // a step line: hold the price until the next fill, then move
  const path = ordered.map((p, i) => (i === 0 ? `M${x(p.t)} ${y(p.p)}` : `H${x(p.t)} V${y(p.p)}`)).join(' ');
  const ticks = [yHi, (yHi + yLo) / 2, yLo];
  const hms = (ms: number) => new Date(ms).toISOString().slice(11, 19);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className="h-auto w-full"
      aria-label={`${pts.length} fill${pts.length === 1 ? '' : 's'} between ${hms(t0)} and ${hms(t1)} UTC, at prices from ${fmtNum(pMin)} to ${fmtNum(pMax)}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} stroke="var(--ui-rule)" strokeWidth={1} />
          <text x={PAD.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} className="fill-ui-graphite tabular-nums">{fmtNum(Number(v.toPrecision(8)))}</text>
        </g>
      ))}
      <text x={PAD.l} y={H - 8} fontSize={11} className="fill-ui-graphite tabular-nums">{hms(t0)}</text>
      <text x={W - PAD.r} y={H - 8} textAnchor="end" fontSize={11} className="fill-ui-graphite tabular-nums">{hms(t1)} UTC</text>
      <path d={path} fill="none" stroke="var(--ui-measured)" strokeWidth={1.25} />
      {pts.map((p, i) => {
        const s = size(p.q), cx = x(p.t), cy = y(p.p);
        return (
          <rect key={i} x={cx - s / 2} y={cy - s / 2} width={s} height={s} rx={1.5} fill="var(--ui-action)" transform={`rotate(45 ${cx} ${cy})`}>
            <title>{`${formatUtc(p.time)} UTC, ${fmtNum(p.q)} at ${fmtNum(p.p)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Ledger({ items }: { items: ReplayApi['decomposition'] }) {
  const max = Math.max(0, ...items.map((i) => (i.bps === null ? 0 : Math.abs(i.bps))));
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => {
        const w = i.bps !== null && i.bps >= 0 && max > 0 ? (i.bps / max) * 100 : 0;
        return (
          <li key={`${i.label}:${i.source.field}`} className={cn('grid grid-cols-[7.5rem_1fr_4.5rem_4rem] items-center gap-3 text-[13px] sm:grid-cols-[9rem_1fr_5rem_4.5rem]', i.partOf && 'pl-4')}>
            <span className="min-w-0">
              <span className="block text-ui-graphite">{i.label}</span>
              <span className="block truncate font-ui-mono text-[11px] text-ui-graphite">{String(i.source.field)}</span>
            </span>
            {i.bps === null ? (
              <>
                <span><ValueState state="not-computed" size="cell" label={i.label} /></span>
                <span /><span />
              </>
            ) : (
              <>
                <span className="relative h-2 rounded-full bg-ui-overlay">
                  {w > 0 ? <span className="absolute inset-y-0 left-0 rounded-full bg-ui-measured" style={{ width: `${Math.max(w, 1)}%` }} /> : null}
                </span>
                <span className="text-right tabular-nums text-ui-ink">{formatSignedBps(i.bps)}</span>
                <span className="text-right tabular-nums text-ui-graphite">{i.usd === null ? 'not computed' : formatUsd(i.usd)}</span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Skeletons() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-6 w-2/3 rounded-md bg-ui-overlay" />
      <div className="h-[200px] rounded-[12px] bg-ui-overlay" />
      {[0, 1, 2, 3].map((n) => <div key={n} className="h-4 rounded-md bg-ui-overlay" />)}
    </div>
  );
}

function Heading({ symbol, orderId, row, body }: { symbol: string; orderId: string; row?: OrderRow; body: ReplayBody | null }) {
  const rawType = row && row.type !== 'Not recorded' ? row.type : (body?.order?.orderType ?? body?.order?.type ?? null);
  const type = rawType ? rawType.charAt(0).toUpperCase() + rawType.slice(1).toLowerCase() : null;
  const side = (row?.side ?? body?.order?.side ?? '').toLowerCase();
  const kind = type && side ? `${type} ${side}` : side ? `${side.charAt(0).toUpperCase()}${side.slice(1)} order` : type ? `${type} order` : 'Order';
  const when = row?.firstFill ?? body?.fills[0]?.time;
  return (
    <header className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-[6px] bg-ui-overlay px-2 py-0.5 text-[13px] font-medium text-ui-ink ring-1 ring-inset ring-ui-rule">{symbol}</span>
        <span className="text-[15px] font-medium text-ui-ink">{kind}</span>
      </div>
      <p className="text-[13px] text-ui-graphite">
        <span className="font-ui-mono text-[12px] text-ui-ink">{orderId}</span>
        {when ? <span className="tabular-nums">, first fill {formatUtc(when)} UTC</span> : null}
      </p>
    </header>
  );
}

function ReplayContent({ orderId, symbol, query, request, row }: Omit<Props, 'open' | 'onOpenChange'>) {
  const key = `${symbol}:${orderId}`;
  const [replay, setReplay] = useState<{ key: string; res: Json } | null>(null);

  useEffect(() => {
    if (!symbol) return;   // an order that is not in the account's list has no replay to fetch
    let live = true;   // an answer for an order that was closed or replaced is dropped
    track('replay_open');
    request(withParams(`/audit/orders/${encodeURIComponent(orderId)}/replay`, query, { symbol }))
      .catch((): Json => ({ status: 500, body: null }))
      .then((res) => { if (live) setReplay({ key, res }); });
    return () => { live = false; };
  }, [request, query, orderId, symbol, key]);

  const res: Json | null = !symbol ? { status: 404, body: null } : replay && replay.key === key ? replay.res : null;
  const view = res ? describeReplay(res.status, res.body) : null;
  const body = res && res.status === 200 ? (res.body as ReplayBody) : null;

  return (
    <div data-testid="explain-replay" className="flex flex-col gap-6 p-5 pt-12 sm:p-6 sm:pt-12">
      <Heading symbol={symbol} orderId={orderId} row={row} body={body} />
      {!view ? <Skeletons /> : view.error ? (
        <Banner kind={res?.status === 404 ? 'info' : 'refused'} title={view.error} />
      ) : body && (
        <>
          <section className="flex flex-col gap-2">
            <h3 className="text-[15px] font-semibold text-ui-ink">Fill tape</h3>
            <div className="rounded-[12px] bg-ui-surface p-2 ring-1 ring-inset ring-ui-rule"><FillTape fills={body.fills} /></div>
            <p className="text-[12px] text-ui-graphite">The fills of this order. The public prints around it are in the source file below.</p>
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="text-[15px] font-semibold text-ui-ink">Cost ledger</h3>
            {body.decomposition.length ? <Ledger items={body.decomposition} /> : <ValueState state="insufficient" label="Cost ledger" reason="no cost terms were stored" size="cell" />}
            {view.expected ? <p className="text-[13px] text-ui-graphite">{view.expected}</p> : null}
          </section>
          {body.fills.length > 0 && (
            <section className="flex flex-col gap-2">
              <h3 className="text-[15px] font-semibold text-ui-ink">Fills</h3>
              <ul className="flex flex-col divide-y divide-ui-rule text-[13px]">
                {body.fills.map((f, i) => (
                  <li key={`${f.time}:${i}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
                    <span className="tabular-nums text-ui-graphite">{formatUtc(f.time)}</span>
                    <span className="tabular-nums text-ui-ink">{fmtNum(f.quantity)} at {fmtNum(f.price)}</span>
                    <span className="tabular-nums text-ui-graphite">{formatUsd(f.notional)}, fee {f.feeUsd === null ? 'not computed' : formatUsd(f.feeUsd)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {view.notes.length > 0 && (
            <section className="flex flex-col gap-1">
              {view.notes.map((n) => <p key={n} className="text-[13px] text-ui-graphite">{n}</p>)}
            </section>
          )}
          {view.sources.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h3 className="text-[15px] font-semibold text-ui-ink">Sources</h3>
              <ul className="flex flex-col gap-1 text-[13px]">
                {view.sources.map((s) => (
                  <li key={s.hash + s.label} className="text-ui-graphite">
                    {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ui-action underline underline-offset-4">{s.label}</a> : <span className="text-ui-ink">{s.label}</span>}
                    {', SHA-256 '}<span className="font-ui-mono text-[11px]">{s.hash}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** The order replay: a side sheet on a desktop, a bottom drawer on a phone. Every figure comes from the replay API. */
export function OrderReplay({ open, onOpenChange, orderId, symbol, query, request, row }: Props) {
  const desktop = useMediaQuery(768);
  const content = open ? <ReplayContent orderId={orderId} symbol={symbol} query={query} request={request} row={row} /> : null;
  const description = 'The fills, the cost terms and the sources of one order.';
  if (desktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full bg-ui-raised overflow-y-auto sm:max-w-[560px]">
          <SheetTitle className="sr-only">Order replay</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
          {content}
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh] bg-ui-raised">
        <DrawerTitle className="sr-only">Order replay</DrawerTitle>
        <DrawerDescription className="sr-only">{description}</DrawerDescription>
        <div className="overflow-y-auto">{content}</div>
      </DrawerContent>
    </Drawer>
  );
}

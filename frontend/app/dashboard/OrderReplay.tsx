'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Dialog } from 'radix-ui';
import { Drawer } from 'vaul';
import { track } from '../lib/track';
import { useToast } from '../ui/Toast';
import { formatSignedBps, formatUsd } from '../ui/format';
import { bars, barsWidth, canonicalJson, sha256Hex } from '../ui/hash';
import { describeReplay, type ReplayApi } from './explainView';
import { formatUtc, withParams, type OrderRow } from './ordersTable';

type Json = { status: number; body: unknown };
type ReplayOrder = { orderId?: string; symbol?: string; side?: string | null; type?: string | null; orderType?: string | null; status?: string | null;
  quantity?: number | null; executedQuantity?: number | null; createdAt?: string | null };
type ReplayBody = Omit<ReplayApi, 'decomposition'> & { order?: ReplayOrder; decomposition: Array<ReplayApi['decomposition'][number] & { key?: string }> };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  symbol: string;
  /** `?userId=demo-...` for a demo account, '' for a signed-in one. */
  query: string;
  request: (path: string, init?: { method?: string; body?: unknown }) => Promise<Json>;
  row?: OrderRow;
  /** Demo accounts print "synthetic trader, real prices" on the receipt. */
  demo?: boolean;
  /** Link of the account's Evidence section (the signed packs). */
  evidenceHref?: string;
  onCloseAutoFocus?: (e: Event) => void;
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

const fmtNum = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 8 }) : 'not recorded');
const hms = (iso: string | number) => new Date(iso).toISOString().slice(11, 19);

/** A cost line's value as printed: the measured figure, or NOT COMPUTED. Never a zero standing in for a missing value. */
const cell = (v: number | null | undefined, f: (n: number) => string) => (typeof v === 'number' && Number.isFinite(v) ? f(v) : 'NOT COMPUTED');

/**
 * The fills against the price. The replay payload carries the order's fills and the source file of the public prints,
 * not the prints themselves, so the receipt draws the fills only and says where the prints are.
 */
function PriceLines({ body }: { body: ReplayBody }) {
  const W = 400, H = 72;
  const fills = body.fills.map((f) => ({ t: Date.parse(f.time), p: f.price })).filter((f) => Number.isFinite(f.t) && Number.isFinite(f.p));
  if (!fills.length) return <p className="g">NO FILLS: THE ORDER DID NOT TRADE.</p>;
  const arrival = body.order?.createdAt ? Date.parse(body.order.createdAt) : NaN;
  const ts = [...fills.map((f) => f.t), ...(Number.isFinite(arrival) ? [arrival] : [])];
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const lo = Math.min(...fills.map((f) => f.p)), hi = Math.max(...fills.map((f) => f.p));
  const span = hi - lo || hi * 0.0001 || 1;
  const x = (t: number) => 8 + ((t - t0) / (t1 - t0 || 1)) * (W - 16);
  const y = (p: number) => 12 + (1 - (p - lo) / span) * (H - 24);
  return (
    <>
      <svg className="fs-r-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`The order's ${fills.length} fill${fills.length === 1 ? '' : 's'} between ${hms(t0)} and ${hms(t1)} UTC, at prices from ${fmtNum(lo)} to ${fmtNum(hi)}`}>
        {Number.isFinite(arrival) ? <line className="arr" x1={x(arrival)} x2={x(arrival)} y1={2} y2={H - 2} /> : null}
        {fills.map((f, i) => <rect key={i} className="fl" x={x(f.t) - 4} y={y(f.p) - 4} width={8} height={8} />)}
      </svg>
      <div className="g flex justify-between text-[11px]"><span>{hms(t0)}</span><span>{hms(t1)} UTC</span></div>
      <p className="g c text-[11px]">FILLS ONLY; THE PUBLIC PRINTS ARE IN THE SOURCE FILE.{Number.isFinite(arrival) ? ' DASHED: ORDER PLACED.' : ''}</p>
    </>
  );
}

function ReceiptBody({ orderId, symbol, query, request, row, demo, evidenceHref, onClose, Title, Description }: Omit<Props, 'open' | 'onOpenChange' | 'onCloseAutoFocus'> & {
  onClose: () => void; Title: React.ElementType; Description: React.ElementType;
}) {
  const key = `${symbol}:${orderId}`;
  const [replay, setReplay] = useState<{ key: string; res: Json } | null>(null);
  const [hash, setHash] = useState<{ key: string; hex: string } | null>(null);
  const toast = useToast();

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

  // the receipt's hash line: SHA-256 of the order record as the replay returned it (canonical JSON)
  useEffect(() => {
    if (!body?.order) return;
    let live = true;
    void sha256Hex(canonicalJson(body.order)).then((hex) => { if (live) setHash({ key, hex }); });
    return () => { live = false; };
  }, [body, key]);
  const hex = hash && hash.key === key ? hash.hex : null;
  const b = useMemo(() => (hex ? bars(hex) : []), [hex]);

  const o = body?.order;
  const type = (row && row.type !== 'Not recorded' ? row.type : (o?.type ?? o?.orderType ?? '')).toUpperCase();
  const side = (row?.side ?? o?.side ?? '').toUpperCase();
  const lines = body ? body.decomposition.filter((d) => d.key !== 'total' && d.label !== 'Total') : [];
  const total = body?.decomposition.find((d) => d.key === 'total' || d.label === 'Total');
  const ec = body?.expectedCost;
  const copy = () => {
    void navigator.clipboard?.writeText(orderId).catch(() => {});
    toast.show({ title: 'Order id copied', detail: orderId });
  };

  return (
    <div data-testid="explain-replay">
      <button type="button" className="fs-r-close" onClick={onClose}>Close</button>
      <Title asChild><h2 className="fs-r-title">FillScore</h2></Title>
      <p className="c">AUDIT RECEIPT</p>
      <Description className="c g">{demo ? 'SYNTHETIC TRADER, REAL PRICES' : 'YOUR EXCHANGE DATA, READ-ONLY KEY'}</Description>
      <hr />
      <dl className="kv">
        <dt className="g">ORDER</dt><dd>{orderId}</dd>
        <dt className="g">MARKET</dt><dd>{symbol} {side} {type}</dd>
        <dt className="g">PLACED</dt><dd>{o?.createdAt ? `${formatUtc(o.createdAt)} UTC` : row ? `${formatUtc(row.firstFill)} UTC (first fill)` : 'not recorded'}</dd>
        {o ? <><dt className="g">STATUS</dt><dd>{o.status ?? 'not recorded'}, {fmtNum(o.executedQuantity)} of {fmtNum(o.quantity)}</dd></> : null}
      </dl>
      {!view ? (
        <p className="g c mt-6" aria-live="polite">PRINTING</p>
      ) : view.error ? (
        <p role="status" className="mt-4 text-center">{view.error.toUpperCase()}</p>
      ) : body && (
        <>
          <p className="sec">FILLS</p>
          {body.fills.length ? (
            <div className="fs-fills">
              {body.fills.map((f, i) => (
                <div key={`${f.time}:${i}`} className="contents">
                  <span>{hms(f.time)}</span><span>{fmtNum(f.quantity)} @ {fmtNum(f.price)}</span>
                  <span className="num">fee {f.feeUsd === null ? 'not computed' : formatUsd(f.feeUsd)}</span>
                </div>
              ))}
            </div>
          ) : <p className="g">NONE</p>}
          <PriceLines body={body} />
          <p className="sec">COSTS</p>
          {lines.length ? (
            <div className="fs-lines">
              {lines.map((d, i) => (
                <div key={`${d.label}:${d.source.field}`} className="contents">
                  <span className="g">{String(i + 1).padStart(2, '0')}</span>
                  <span className="lab" title={`Source field: ${String(d.source.field)}`}>{d.partOf ? '  ' : ''}{d.label}</span>
                  <span className="num g">{cell(d.bps, formatSignedBps)}</span><span className="num">{cell(d.usd, formatUsd)}</span>
                </div>
              ))}
            </div>
          ) : <p className="g">INSUFFICIENT DATA: NO COST TERMS WERE STORED</p>}
          <div className="fs-perf" aria-hidden="true" />
          <div className="fs-totalline"><span className="k">TOTAL</span><span className="b">{cell(total?.bps, formatSignedBps)}</span><span className="u">{cell(total?.usd, formatUsd)}</span></div>
          {ec ? (
            <p className="g mt-1.5">{ec.expectedBps === null ? `EXPECTED COST: INSUFFICIENT DATA (${(ec.reason ?? 'no reason was stored').toUpperCase()})`
              : `ORDERS LIKE IT: MODELLED ${formatSignedBps(ec.expectedBps)}${ec.lowBps !== null && ec.highBps !== null ? `, ${Math.round(ec.level * 100)}% RANGE ${formatSignedBps(ec.lowBps)} TO ${formatSignedBps(ec.highBps)}` : ''}`}</p>
          ) : null}
          {view.notes.map((n) => <p key={n} className="g mt-1">{n}</p>)}
          <hr />
          {view.sources.map((s) => (
            <p key={s.hash + s.label} className="g text-[11.5px]">
              SOURCE {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ui-ink">{s.label}</a> : s.label}, SHA-256 {s.hash}
            </p>
          ))}
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              {b.length ? (
                <svg className="fs-bars" viewBox={`0 0 ${barsWidth(b) || 1} 10`} preserveAspectRatio="none" aria-hidden="true">
                  {b.map((r, i) => <rect key={i} x={r.x} y={0} width={r.w} height={10} />)}
                </svg>
              ) : null}
              <p className="g text-[10.5px] leading-[1.35] [overflow-wrap:anywhere]">{hex ?? (o ? 'HASHING' : 'NO ORDER RECORD')}<br />SHA-256 OF THE ORDER RECORD; THE BARS DRAW IT, THEY ARE NOT A SCANNABLE CODE</p>
            </div>
            <div className="c">
              {evidenceHref ? <a className="fs-word-stamp" href={evidenceHref}>SIGNED<small>in the evidence pack</small></a> : null}
              <div className="fs-r-actions"><button type="button" onClick={copy}>Copy order id</button></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The order's thermal receipt (design v3). On a desktop it prints down out of a slot at the top of the screen (Radix
 * Dialog); on a phone it rises as a Vaul drawer with its torn edge on top. Every figure comes from the replay API.
 */
export function OrderReplay({ open, onOpenChange, onCloseAutoFocus, ...rest }: Props) {
  const desktop = useMediaQuery(768);
  const close = () => onOpenChange(false);
  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fs-r-overlay" />
          <Dialog.Content className="fs-r-shell" onCloseAutoFocus={onCloseAutoFocus}>
            <div className="fs-r-slot" aria-hidden="true" />
            <div className="fs-r-clip">
              <div className="fs-r-paper">
                <div className="fs-receipt">{open ? <ReceiptBody {...rest} onClose={close} Title={Dialog.Title} Description={Dialog.Description} /> : null}</div>
                <div className="fs-torn-bottom" aria-hidden="true" />
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    );
  }
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fs-r-overlay" />
        <Drawer.Content className="fs-vaul" onCloseAutoFocus={onCloseAutoFocus}>
          <div className="fs-torn-top" aria-hidden="true" />
          <div className="fs-receipt"><div className="grip" aria-hidden="true" />{open ? <ReceiptBody {...rest} onClose={close} Title={Drawer.Title} Description={Drawer.Description} /> : null}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

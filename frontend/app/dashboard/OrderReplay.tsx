'use client';

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Dialog } from 'radix-ui';
import { Drawer } from 'vaul';
import { track } from '../lib/track';
import { useToast } from '../ui/Toast';
import { exactTitle, formatSignedBps, formatUsd } from '../ui/format';
import { Fig } from '../ui/Fig';
import { BARS_NOTE, CHART_NOTE, NO_COST_TERMS, NO_FILLS, expectedLine } from './receiptCopy';
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
 * Design v3 fixes B3: no chart. The replay payload carries the order's fills and the source file of the public prints
 * (name and SHA-256), not the prints, and the server cannot read them without new storage or a download at request
 * time; a plot of the fills alone would be near-empty, so the receipt lists the fills and says where the prints are.
 */
function PrintsNote({ body }: { body: ReplayBody }) {
  if (!body.fills.length) return <p className="g">{NO_FILLS}</p>;
  return <p className="g mt-1 text-[11px]" data-testid="receipt-prints-note">{CHART_NOTE}</p>;
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
        <dt className="g">PLACED</dt><dd>{o?.createdAt ? `${formatUtc(o.createdAt)} UTC` : row?.placedAt ? `${formatUtc(row.placedAt)} UTC` : row?.firstFill ? `${formatUtc(row.firstFill)} UTC (first fill)` : 'not recorded'}</dd>
        {o ? <><dt className="g">STATUS</dt><dd>{o.status ?? 'not recorded'}, {fmtNum(o.executedQuantity)} of {fmtNum(o.quantity)}</dd></> : null}
      </dl>
      {!view ? (
        <p className="g c mt-6" aria-live="polite">PRINTING</p>
      ) : view.error ? (
        <p role="status" className="mt-4 text-center">{view.error}</p>
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
          <PrintsNote body={body} />
          <p className="sec">COSTS</p>
          {lines.length ? (
            <div className="fs-lines">
              {lines.map((d, i) => (
                <div key={`${d.label}:${d.source.field}`} className="contents">
                  <span className="g">{String(i + 1).padStart(2, '0')}</span>
                  <span className="lab" title={`Source field: ${String(d.source.field)}`}>{d.partOf ? '  ' : ''}{d.label}</span>
                  <span className="num g"><Fig text={cell(d.bps, formatSignedBps)} exact={exactTitle(d.bps, 'bps')} /></span><span className="num"><Fig text={cell(d.usd, formatUsd)} exact={exactTitle(d.usd, 'usd')} /></span>
                </div>
              ))}
            </div>
          ) : <p className="g">{NO_COST_TERMS}</p>}
          <div className="fs-perf" aria-hidden="true" />
          <div className="fs-totalline"><span className="k">TOTAL</span><span className="b"><Fig text={cell(total?.bps, formatSignedBps)} exact={exactTitle(total?.bps, 'bps')} /></span><span className="u"><Fig text={cell(total?.usd, formatUsd)} exact={exactTitle(total?.usd, 'usd')} /></span></div>
          {ec ? (
            <p className="g mt-1.5">{expectedLine(ec)}</p>
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
              <p className="g text-[10.5px] leading-[1.35] [overflow-wrap:anywhere]">{hex ?? (o ? 'HASHING' : 'NO ORDER RECORD')}<br />{BARS_NOTE}</p>
            </div>
            <div className="c">
              {/* only a real account has signed evidence packs; a demo receipt says why there is no signature */}
              {evidenceHref ? <a className="fs-word-stamp" href={evidenceHref}>SIGNED<small>in the evidence pack</small></a>
                : demo ? <span className="fs-word-stamp" data-tone="ink">NOT SIGNED<small>demo: nothing of yours to sign</small></span> : null}
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

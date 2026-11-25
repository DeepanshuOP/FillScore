'use client';

import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Dialog } from 'radix-ui';
import { Drawer } from 'vaul';
import { track } from '../lib/track';
import { useToast } from '../ui/Toast';
import { exactTitle, formatSignedBps, formatUsd } from '../ui/format';
import { Fig } from '../ui/Fig';
import { BARS_NOTE, CHART_NOTE, costTermsState, NO_FILLS, PRINTS_LEGEND, costLineLabel, expectedLine, unfilledLineNote } from './receiptCopy';
import { bars, barsWidth, canonicalJson, sha256Hex } from '../ui/hash';
import { describeReplay, type ReplayApi } from './explainView';
import dynamic from 'next/dynamic';
const PricePrintsChart = dynamic(() => import('../ui/charts/AppCharts').then((m) => m.PricePrintsChart), { ssr: false, loading: () => <div className="h-[280px]" aria-hidden="true" /> });
import { parsePrintsWindow } from './printsTape';
import { formatUtc, withParams, type OrderRow } from './ordersTable';

type Json = { status: number; body: unknown };
type ReplayOrder = { orderId?: string; symbol?: string; side?: string | null; type?: string | null; orderType?: string | null; status?: string | null;
  quantity?: number | null; executedQuantity?: number | null; createdAt?: string | null };
type ReplayBody = Omit<ReplayApi, 'decomposition'> & { prints?: unknown; order?: ReplayOrder; decomposition: Array<ReplayApi['decomposition'][number] & { key?: string }> };

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
  /** Design v3.1: the clicked bar's or row's rectangle; on a desktop the receipt grows out of it (shared-element transition). */
  origin?: DOMRect | null;
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
  // Step 5 (fourth order): a demo order's payload carries its window of prints, drawn above; the note then explains the marks.
  // A real account's payload has no `prints`, and its receipt keeps this line.
  if (parsePrintsWindow(body.prints)) return <p className="g mt-1 text-[12px]" data-testid="receipt-prints-note">{PRINTS_LEGEND}</p>;
  return <p className="g mt-1 text-[12px]" data-testid="receipt-prints-note">{CHART_NOTE}</p>;
}

/** The receipt's printed NOTES fold (design v3.1): a mono button with aria-expanded; the lines stay in the document. */
function ReceiptNotes({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 border-t border-dashed border-ui-ink pt-2" data-testid="receipt-notes">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="fs-r-fold">
        <span aria-hidden="true">{open ? '−' : '+'}</span> NOTES ({count})
      </button>
      <div hidden={!open}>{children}</div>
    </div>
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
  const unfilledNote = unfilledLineNote(lines.find((d) => d.key === 'unfilled')?.usd);
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
          ) : null}
          {(() => {
            const pw = body.fills.length ? parsePrintsWindow(body.prints) : null;
            if (!pw) return null;
            // design v5 (PROPOSAL §6, D4): a Recharts chart of the stored public trades around the order, the fills marked
            const quote = /(USDT|USDC|FDUSD|BUSD|BTC|ETH|BNB)$/.exec(symbol)?.[1] ?? '';
            return (
              <div className="mt-2 rounded-md bg-ui-raised p-1">
                <PricePrintsChart arrivalMs={pw.arrivalMs} quote={quote}
                  trades={pw.prints.map((r) => ({ t: r[1], price: r[2], qty: r[3], side: r[4] === 0 ? 'buyer' as const : 'seller' as const }))}
                  fills={body.fills.map((f) => ({ t: new Date(f.time).getTime(), price: f.price, qty: f.quantity }))}
                  source={`Source: Binance public trades${pw.files.length ? `, ${pw.files.map((f) => f.date).join(' and ')}` : ''}; SHA-256 in Notes.${pw.truncated ? ` The chart shows ${pw.prints.length} of ${pw.total} public trades, the ones nearest the fills.` : ''}`} />
              </div>
            );
          })()}
          {body.fills.length ? null : <PrintsNote body={body} />}
          <p className="sec">COSTS</p>
          {lines.length ? (
            <div className="fs-lines">
              {lines.map((d, i) => (
                <div key={`${d.label}:${d.source.field}`} className="contents">
                  <span className="g">{String(i + 1).padStart(2, '0')}</span>
                  <span className={d.partOf ? 'lab sub' : 'lab'} title={`Source field: ${String(d.source.field)}`}><span className="t">{costLineLabel(d)}</span></span>
                  <span className="num g"><Fig text={cell(d.bps, formatSignedBps)} exact={exactTitle(d.bps, 'bps')} /></span><span className="num"><Fig text={cell(d.usd, formatUsd)} exact={exactTitle(d.usd, 'usd')} /></span>
                </div>
              ))}
            </div>
          ) : <p className="g" data-testid="receipt-no-cost">{costTermsState(view.notes)}</p>}
          <div className="fs-perf" aria-hidden="true" />
          {typeof total?.usd !== 'number' || !Number.isFinite(total.usd) ? (
            <div className="fs-totalline"><span className="k">TOTAL</span><span className="nc">NOT COMPUTED</span></div>
          ) : <div className="fs-totalline"><span className="k">TOTAL</span><span className="b"><Fig text={cell(total?.bps, formatSignedBps)} exact={exactTitle(total?.bps, 'bps')} /></span><span className="u"><Fig text={cell(total?.usd, formatUsd)} exact={exactTitle(total?.usd, 'usd')} /></span></div>}
          {/* design v3.1: the footnotes (prints, expected cost, notes, sources, the record's hash) fold into NOTES; the
              total, NOT COMPUTED and the signature stamp are never folded */}
          <ReceiptNotes count={(body.fills.length ? 1 : 0) + (ec ? 1 : 0) + (unfilledNote ? 1 : 0) + view.notes.length + view.sources.length + 1}>
            {body.fills.length ? <PrintsNote body={body} /> : null}
            {unfilledNote ? <p className="g mt-1.5" data-testid="receipt-unfilled-note">{unfilledNote}</p> : null}
            {ec ? <p className="g mt-1.5">{expectedLine(ec)}</p> : null}
            {view.notes.map((n) => <p key={n} className="g mt-1">{n}</p>)}
            {view.sources.map((s) => (
              <p key={s.hash + s.label} className="g mt-1 text-[12px] [overflow-wrap:anywhere]">
                SOURCE {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ui-ink">{s.label}</a> : s.label}, SHA-256 {s.hash}
              </p>
            ))}
            <p className="g mt-1 text-[12px] leading-[1.35] [overflow-wrap:anywhere]">{hex ?? (o ? 'HASHING' : 'NO ORDER RECORD')}<br />{BARS_NOTE}</p>
          </ReceiptNotes>
          {/* below 400 px the bars and the stamp stack, so neither squeezes the other (break-ui, 2026-11-21) */}
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 max-[400px]:grid-cols-1">
            <div className="min-w-0">
              {b.length ? (
                <svg className="fs-bars" viewBox={`0 0 ${barsWidth(b) || 1} 10`} preserveAspectRatio="none" aria-hidden="true">
                  {b.map((r, i) => <rect key={i} x={r.x} y={0} width={r.w} height={10} />)}
                </svg>
              ) : null}
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
/**
 * How the receipt enters (design v3.1): `flip` grows the paper out of the clicked bar or ledger row (GSAP Flip, 300 ms
 * on the drawer curve; the lines appear as it lands); `feed` is the first open of the session, the paper advancing out
 * of the slot in steps; `plain` every later open. Reduced motion: plain (the CSS fades it).
 */
type Enter = 'flip' | 'feed' | 'plain';
const FED = 'fs-receipt-fed';
function chooseEnter(origin: DOMRect | null | undefined): Enter {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'plain';
  let fed = false;
  try { fed = !!sessionStorage.getItem(FED); sessionStorage.setItem(FED, '1'); } catch { fed = true; }
  if (origin && origin.width > 0) return 'flip';
  return fed ? 'plain' : 'feed';
}

/** Grow the paper from `origin` to where it rests (FLIP via GSAP Flip.fit + Flip.from). Resolves false when GSAP is unavailable. */
async function flipFrom(paper: HTMLElement, origin: DOMRect): Promise<boolean> {
  try {
    const [{ gsap }, { Flip }] = await Promise.all([import('gsap'), import('gsap/Flip')]);
    gsap.registerPlugin(Flip);
    const ghost = document.createElement('div');
    Object.assign(ghost.style, { position: 'fixed', left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px`, height: `${origin.height}px`, pointerEvents: 'none' });
    document.body.append(ghost);
    Flip.fit(paper, ghost, { scale: true });
    const state = Flip.getState(paper);
    ghost.remove();
    gsap.set(paper, { clearProps: 'transform,width,height' });
    paper.dataset.flip = 'run';
    await new Promise<void>((done) => {
      Flip.from(state, { duration: 0.3, ease: 'expo.out', scale: true, onComplete: () => { gsap.set(paper, { clearProps: 'all' }); done(); } });
    });
    return true;
  } catch {
    return false;
  }
}

export function OrderReplay({ open, onOpenChange, onCloseAutoFocus, origin, ...rest }: Props) {
  const desktop = useMediaQuery(768);
  const close = () => onOpenChange(false);
  const [enter, setEnter] = useState<Enter>('plain');
  const [paper, setPaper] = useState<HTMLDivElement | null>(null);
  // decide once per opening, before the paper paints (layout effect: the first frame already wears the mode). Not in
  // render: the choice records the session's first open in sessionStorage, a side effect.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useLayoutEffect(() => { if (open) setEnter(chooseEnter(desktop ? origin : null)); }, [open, origin, desktop]);
  useEffect(() => {
    if (!open || enter !== 'flip' || !paper || !origin) return;
    // whatever happens (done, or GSAP unavailable), the paper ends visible and at rest
    void flipFrom(paper, origin).then(() => { paper.dataset.flip = 'done'; });
    return () => { paper.dataset.flip = 'done'; };
  }, [open, enter, paper, origin]);
  if (desktop) {
    return (
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fs-r-overlay" />
          <Dialog.Content className="fs-r-shell" data-enter={enter} onCloseAutoFocus={onCloseAutoFocus}>
            <div className="fs-r-slot" aria-hidden="true" />
            <div className="fs-r-clip">
              <div className="fs-r-paper" ref={setPaper}>
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
        <Drawer.Content className="fs-vaul" data-enter={enter} onCloseAutoFocus={onCloseAutoFocus}>
          <div className="fs-torn-top" aria-hidden="true" />
          <div className="fs-receipt"><div className="grip" aria-hidden="true" />{open ? <ReceiptBody {...rest} onClose={close} Title={Drawer.Title} Description={Drawer.Description} /> : null}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

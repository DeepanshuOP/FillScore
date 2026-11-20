'use client'

import { useEffect, useMemo, useState } from 'react'
import { Dialog } from 'radix-ui'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { ACCOUNT, account, formatPrice, formatQty, formatSignedBps, formatUsd, HERO_ID, heroEntries, PROVENANCE, RECEIPT_LINES, term, utcDateTime, utcTime, type MonthOrder, type Term } from '../data'
import { bars, barsWidth, canonicalJson, sha256Hex } from '../../../ui/hash'
import { useIsDesktop } from '../month'
import { fontVars } from '../fonts'
import { cssVars, tape } from '../tokens'
import { useScope } from '../ThemeScope'

/** A cost line's value as printed: measured figures, or the words for a value that was not measured. */
function cell(t: Term | undefined, f: 'bps' | 'usd') {
  if (!t) return 'NOT COMPUTED'
  const v = t[f]
  if (typeof v !== 'number') return t.reason ? 'INSUFFICIENT DATA' : 'NOT COMPUTED'
  return f === 'bps' ? formatSignedBps(v) : formatUsd(v)
}

/**
 * The fills against the price: for the hero order, the real public prints and the quote mid around it; for any other
 * order the lab has only its fills (the replay payload carries sources, not prints), and the chart says so.
 */
function PriceLines({ o }: { o: MonthOrder }) {
  const W = 400, H = 92
  const hero = o.order.orderId === HERO_ID
  const pts = hero ? heroEntries() : []
  const fills = o.fills.map((f) => ({ ts: Date.parse(f.time), price: f.price }))
  if (!fills.length) return <p className="g">No fills: the order did not trade.</p>
  const ts = [...pts.map((p) => p.ts), ...fills.map((f) => f.ts), Date.parse(o.order.createdAt)]
  const prices = [...pts.flatMap((p) => (p.kind === 'quote' ? [p.bid, p.ask] : [p.price])), ...fills.map((f) => f.price)]
  const t0 = Math.min(...ts), t1 = Math.max(...ts) || t0 + 1
  const lo = Math.min(...prices), hi = Math.max(...prices)
  const span = hi - lo || hi * 0.0001
  const x = (t: number) => 6 + ((t - t0) / (t1 - t0 || 1)) * (W - 12)
  const y = (p: number) => 10 + (1 - (p - lo) / span) * (H - 22)
  const arrival = x(Date.parse(o.order.createdAt))
  return (
    <>
      <svg className="t-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={hero ? `Price lines: ${pts.filter((p) => p.kind === 'print').length} public prints and the order's ${fills.length} fills` : `The order's ${fills.length} fills`}>
        <line className="arr" x1={arrival} x2={arrival} y1={2} y2={H - 4} />
        {pts.map((p, i) => p.kind === 'print' ? <circle key={i} className="pr" cx={x(p.ts)} cy={y(p.price)} r={1.6} /> : null)}
        {fills.map((f, i) => <rect key={i} className="fl" x={x(f.ts) - 4} y={y(f.price) - 4} width={8} height={8} />)}
      </svg>
      <div className="g" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span>{utcTime(t0)}</span><span>{utcTime(t1)}</span>
      </div>
      <div className="g c" style={{ fontSize: 11 }}>{hero ? 'dots: public prints; squares: fills; dashed: arrival' : 'squares: fills (public prints not in this payload)'}</div>
    </>
  )
}

function ReceiptBody({ o, onClose, Title, Description }: { o: MonthOrder; onClose: () => void; Title: React.ElementType; Description: React.ElementType }) {
  const [hash, setHash] = useState<string | null>(null)
  const { alt } = useScope()
  useEffect(() => { let live = true; void sha256Hex(canonicalJson(o.order)).then((h) => { if (live) setHash(h) }); return () => { live = false } }, [o])
  const b = useMemo(() => (hash ? bars(hash) : []), [hash])
  const total = term(o, 'total')
  const ec = o.expectedCost
  const copy = () => {
    void navigator.clipboard?.writeText(o.order.orderId).catch(() => {})
    toast.custom(() => (
      <div className={fontVars} style={cssVars(alt ? tape.carbon : tape.paper)}>
        <div className="t-slip">ORDER ID COPIED<br /><span style={{ color: 'var(--v3-graphite)' }}>{o.order.orderId}</span></div>
      </div>
    ), { duration: 2600 })
  }
  return (
    <>
      <button type="button" className="t-r-close" onClick={onClose}>Close</button>
      <Title asChild><h2>FillScore</h2></Title>
      <div className="c">AUDIT RECEIPT</div>
      <Description className="c g">{PROVENANCE.toLowerCase()}</Description>
      <hr />
      <dl className="kv">
        <dt className="g">ORDER</dt><dd>{o.order.orderId}</dd>
        <dt className="g">MARKET</dt><dd>{o.order.symbol} {o.order.side} {o.order.type ?? ''}</dd>
        <dt className="g">PLACED</dt><dd>{utcDateTime(o.order.createdAt)}</dd>
        <dt className="g">STATUS</dt><dd>{o.order.status} {formatQty(o.order.executedQuantity)} of {formatQty(o.order.quantity)}</dd>
        <dt className="g">ACCOUNT</dt><dd>{ACCOUNT}</dd>
      </dl>
      <div className="sec">FILLS</div>
      {o.fills.length ? (
        <div className="t-fills">
          {o.fills.map((f, i) => (
            <div key={i} style={{ display: 'contents' }}>
              <span>{utcTime(f.time)}</span><span>{formatQty(f.quantity)} @ {formatPrice(f.price)}</span><span className="num">fee {formatUsd(f.feeUsd)}</span>
            </div>
          ))}
        </div>
      ) : <div className="g">none</div>}
      <PriceLines o={o} />
      <div className="sec">COSTS</div>
      <div className="t-lines">
        {RECEIPT_LINES.map((l, i) => {
          const t = term(o, l.key)
          return (
            <div key={l.key} style={{ display: 'contents' }}>
              <span className="g">{String(i + 1).padStart(2, '0')}</span><span className="lab">{l.label}</span>
              <span className="num g">{cell(t, 'bps')}</span><span className="num">{cell(t, 'usd')}</span>
            </div>
          )
        })}
      </div>
      <div className="t-perf" aria-hidden />
      <div className="t-totalline"><span className="k">TOTAL</span><span className="b">{cell(total, 'bps')}</span><span className="u">{cell(total, 'usd')}</span></div>
      {ec?.applies && typeof ec.lowBps === 'number' && typeof ec.highBps === 'number' && (
        <div className="g" style={{ marginTop: 6 }}>Orders like it, 90% range: {formatSignedBps(ec.lowBps)} to {formatSignedBps(ec.highBps)}</div>
      )}
      {o.notes.map((n) => <div key={n} className="g" style={{ marginTop: 4 }}>{n}</div>)}
      <hr />
      {o.sources.map((s) => <div key={s.label} className="g" style={{ fontSize: 11.5 }}>SOURCE {s.label}{s.sha256 ? `, sha256 ${s.sha256.slice(0, 16)}` : ''}</div>)}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16, alignItems: 'center' }}>
        <div>
          <svg className="t-bars" viewBox={`0 0 ${barsWidth(b) || 1} 10`} preserveAspectRatio="none" aria-hidden>{b.map((r, i) => <rect key={i} x={r.x} y={0} width={r.w} height={10} />)}</svg>
          <div className="g" style={{ fontSize: 10.5, overflowWrap: 'anywhere', lineHeight: 1.35 }}>{hash ?? 'hashing'}<br />SHA-256 of the order record; the bars draw it, they are not a scannable code</div>
        </div>
        <div className="c">
          <a className="t-signed" href="/verify">SIGNED<small>evidence pack<br />key {account.keyFingerprint}</small></a>
          <div className="t-r-actions"><button type="button" onClick={copy}>Copy order id</button></div>
        </div>
      </div>
    </>
  )
}

/** The receipt drawer: on a desktop it prints down out of a slot at the top of the screen (Radix Dialog, the Sheet
 *  primitive); on a phone it is a Vaul drawer that rises from the bottom with its torn edge on top. */
export function TapeReceipt({ order, onClose }: { order: MonthOrder | null; onClose: () => void }) {
  const desk = useIsDesktop()
  const open = !!order
  if (desk) {
    return (
      <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
        <Dialog.Portal>
          <div className={fontVars}>
            <ScopedVars>
              <Dialog.Overlay className="t-r-overlay" />
              <Dialog.Content className="t-r-shell" aria-describedby={undefined}>
                <div className="t-r-slot" aria-hidden />
                <div className="t-r-clip">
                  <div className="t-receipt">{order && <ReceiptBody o={order} onClose={onClose} Title={Dialog.Title} Description={Dialog.Description} />}</div>
                  <div className="t-torn" aria-hidden />
                </div>
              </Dialog.Content>
            </ScopedVars>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }
  return (
    <Drawer.Root open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <Drawer.Portal>
        <div className={fontVars}>
          <ScopedVars>
            <Drawer.Overlay className="t-r-overlay" />
            <Drawer.Content className="t-vaul" aria-describedby={undefined}>
              <div className="t-torn-top" aria-hidden />
              <div className="t-receipt"><div className="grip" aria-hidden />{order && <ReceiptBody o={order} onClose={onClose} Title={Drawer.Title} Description={Drawer.Description} />}</div>
            </Drawer.Content>
          </ScopedVars>
        </div>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/** Portals leave the themed subtree, so the receipt re-applies the current theme's variables. */
function ScopedVars({ children }: { children: React.ReactNode }) {
  const { alt } = useScope()
  return <div data-v3="tape" data-portal data-theme={alt ? 'carbon' : 'paper'} style={{ ...cssVars(alt ? tape.carbon : tape.paper), minHeight: 0, background: 'none' }}>{children}</div>
}

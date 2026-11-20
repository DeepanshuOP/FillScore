'use client'

import { useEffect, useState } from 'react'
import { Dialog } from 'radix-ui'
import { Drawer } from 'vaul'
import { toast } from 'sonner'
import { ACCOUNT, account, formatPrice, formatQty, formatSignedBps, formatUsd, HERO_ID, heroEntries, PROVENANCE, RECEIPT_LINES, term, utcDateTime, utcTime, type MonthOrder, type Term } from '../data'
import { canonicalJson, sha256Hex } from '../../../ui/hash'
import { useIsDesktop } from '../month'
import { fontVars } from '../fonts'
import { cssVars, grid } from '../tokens'
import { useScope } from '../ThemeScope'

const val = (t: Term | undefined, f: 'bps' | 'usd') => {
  if (!t) return 'not computed'
  const v = t[f]
  if (typeof v !== 'number') return t.reason ? 'insufficient data' : 'not computed'
  return f === 'bps' ? formatSignedBps(v) : formatUsd(v)
}

function Ticks({ o }: { o: MonthOrder }) {
  const W = 500, H = 96
  const pts = o.order.orderId === HERO_ID ? heroEntries() : []
  const fills = o.fills.map((f) => ({ ts: Date.parse(f.time), price: f.price }))
  if (!fills.length) return null
  const ts = [...pts.map((p) => p.ts), ...fills.map((f) => f.ts)]
  const ps = [...pts.flatMap((p) => (p.kind === 'quote' ? [p.bid, p.ask] : [p.price])), ...fills.map((f) => f.price)]
  const t0 = Math.min(...ts), t1 = Math.max(...ts), lo = Math.min(...ps), hi = Math.max(...ps)
  const x = (t: number) => 4 + ((t - t0) / (t1 - t0 || 1)) * (W - 8)
  const y = (p: number) => 12 + (1 - (p - lo) / (hi - lo || 1)) * (H - 24)
  return (
    <svg className="g-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={pts.length ? 'Public prints as ticks and the fills as highlighter bars' : 'The fills; public prints are not in this payload'}>
      {pts.map((p, i) => p.kind === 'print' ? <line key={i} className="pr" x1={x(p.ts)} x2={x(p.ts)} y1={y(p.price) - 6} y2={y(p.price) + 6} /> : null)}
      {fills.map((f, i) => <rect key={i} className="fl" x={x(f.ts) - 3} y={y(f.price) - 12} width={6} height={24} />)}
    </svg>
  )
}

function Body({ o, onClose, Title, Description }: { o: MonthOrder; onClose: () => void; Title: React.ElementType; Description: React.ElementType }) {
  const [hash, setHash] = useState<string | null>(null)
  const { alt } = useScope()
  useEffect(() => { let live = true; void sha256Hex(canonicalJson(o.order)).then((h) => { if (live) setHash(h) }); return () => { live = false } }, [o])
  const total = term(o, 'total')
  const copy = () => {
    void navigator.clipboard?.writeText(o.order.orderId).catch(() => {})
    toast.custom(() => <div className={fontVars} style={cssVars(alt ? grid.sheet : grid.ink)}><div className="g-slip">Order id copied: {o.order.orderId}</div></div>, { duration: 2600 })
  }
  return (
    <div className="in">
      <div className="hd"><span className="g-chip">receipt</span><button type="button" onClick={onClose}>Close</button></div>
      <div className="giant" aria-hidden>{val(total, 'usd')}</div>
      <Title asChild><h2>{o.order.symbol} {o.order.side.toLowerCase()}, {(o.order.type ?? '').toLowerCase()} order, total {val(total, 'usd')} ({val(total, 'bps')})</h2></Title>
      <Description asChild><div className="meta">
        {o.order.orderId}<br />placed {utcDateTime(o.order.createdAt)}<br />{o.order.status.toLowerCase()}, {formatQty(o.order.executedQuantity)} of {formatQty(o.order.quantity)}<br />{ACCOUNT}, {PROVENANCE.toLowerCase()}
      </div></Description>
      <div className="rows">
        {RECEIPT_LINES.map((l, i) => {
          const t = term(o, l.key)
          return <div key={l.key} className="rw"><span className="ix">{String(i + 1).padStart(2, '0')}</span><span>{l.label}</span><span className="b">{val(t, 'bps')}</span><span className="u">{val(t, 'usd')}</span></div>
        })}
        <div className="rw tot"><span className="ix">=</span><span>Total</span><span className="b">{val(total, 'bps')}</span><span className="u"><span className="hl">{val(total, 'usd')}</span></span></div>
      </div>
      {o.expectedCost?.applies && typeof o.expectedCost.lowBps === 'number' && typeof o.expectedCost.highBps === 'number' && (
        <p className="meta">Orders like it cost {formatSignedBps(o.expectedCost.lowBps)} to {formatSignedBps(o.expectedCost.highBps)} (90% range).</p>
      )}
      {o.notes.map((n) => <p key={n} className="meta" style={{ margin: '4px 0' }}>{n}</p>)}
      <div className="sec">Fills</div>
      <div className="fills">
        {o.fills.map((f, i) => <div key={i} className="rw"><span className="ix">{utcTime(f.time).slice(0, 8)}</span><span>{formatQty(f.quantity)} at {formatPrice(f.price)}</span><span className="b">fee</span><span className="u">{formatUsd(f.feeUsd)}</span></div>)}
        {!o.fills.length && <p className="meta">No fills: the order did not trade.</p>}
      </div>
      <Ticks o={o} />
      <div className="sec">Evidence</div>
      {o.sources.map((s) => <p key={s.label} className="meta" style={{ margin: '4px 0' }}>{s.label}{s.sha256 ? `, sha256 ${s.sha256.slice(0, 16)}` : ''}</p>)}
      <div className="meta">SHA-256 of the order record</div>
      <div className="g-hex">{hash ? hash.match(/.{16}/g)!.map((g) => <span key={g}>{g}</span>) : <span>hashing</span>}</div>
      <a className="g-signed" href="/verify"><span className="hl">Signed</span><span className="meta">in the evidence pack, key {account.keyFingerprint}</span></a>
      <div style={{ marginTop: 14 }}><button type="button" className="g-btn quiet" onClick={copy}>Copy order id</button></div>
    </div>
  )
}

/** Direction 2's receipt: a ledger sheet wiped in from the right (Radix Dialog, the Sheet primitive), a Vaul drawer on a phone. */
export function GridReceipt({ order, onClose }: { order: MonthOrder | null; onClose: () => void }) {
  const desk = useIsDesktop()
  const { alt } = useScope()
  const scope = { 'data-v3': 'grid', 'data-portal': '', 'data-theme': alt ? 'sheet' : 'ink', style: { ...cssVars(alt ? grid.sheet : grid.ink), minHeight: 0, background: 'none' } }
  if (desk) {
    return (
      <Dialog.Root open={!!order} onOpenChange={(v) => { if (!v) onClose() }}>
        <Dialog.Portal>
          <div className={fontVars}><div {...scope}>
            <Dialog.Overlay className="g-sheet-overlay" />
            <Dialog.Content className="g-sheet">{order && <Body o={order} onClose={onClose} Title={Dialog.Title} Description={Dialog.Description} />}</Dialog.Content>
          </div></div>
        </Dialog.Portal>
      </Dialog.Root>
    )
  }
  return (
    <Drawer.Root open={!!order} onOpenChange={(v) => { if (!v) onClose() }}>
      <Drawer.Portal>
        <div className={fontVars}><div {...scope}>
          <Drawer.Overlay className="g-sheet-overlay" />
          <Drawer.Content className="g-vaul g-sheet-m"><div className="grip" aria-hidden />{order && <Body o={order} onClose={onClose} Title={Drawer.Title} Description={Drawer.Description} />}</Drawer.Content>
        </div></div>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

'use client';
import React from 'react';
import { describeOrders } from './ordersView';

const CARD = {
  padding: '1.25rem 1.5rem', background: '#1c1c1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px',
  display: 'flex', flexDirection: 'column' as const, gap: '0.9rem',
};
const LABEL = { fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' as const };
const TEXT = { fontFamily: 'var(--font-inter)', fontSize: '0.8rem', lineHeight: 1.6, color: '#a09890', margin: 0 };
const GRID = { listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' } as const;

/** Measured order views: outcomes, resting time of limit orders, implementation shortfall, unfilled orders.
 *  All numbers come from GET /api/audit/orders-summary (stored documents, deterministic statistics). */
export default function OrdersPanel({ body }: { body: unknown }) {
  const v = describeOrders(body);
  if (!v) return null;
  return (
    <section aria-label="Measured orders" data-testid="orders-panel" style={CARD}>
      <div style={LABEL}>Orders · measured</div>
      <ul style={GRID}>
        {v.outcomes.map(([k, val]) => (
          <li key={k}><span style={{ color: '#888078' }}>{k}: </span><span style={{ color: '#ede8e0' }}>{val}</span></li>
        ))}
      </ul>
      {v.resting && (
        <div data-testid="orders-resting">
          <div style={LABEL}>Resting time of limit orders</div>
          <p style={TEXT}>Median {v.resting.median}, 90th percentile {v.resting.p90} ({v.resting.n}).</p>
        </div>
      )}
      {v.shortfall && (
        <div data-testid="orders-shortfall">
          <div style={LABEL}>Implementation shortfall, per order</div>
          <ul style={GRID}>
            {v.shortfall.map(([k, val]) => (
              <li key={k}><span style={{ color: '#888078' }}>{k}: </span><span style={{ color: '#ede8e0' }}>{val}</span></li>
            ))}
          </ul>
          <p style={{ ...TEXT, fontSize: '0.72rem' }}>{v.shortfallNote}</p>
        </div>
      )}
      {v.totals && (
        <div data-testid="orders-totals">
          <div style={LABEL}>Total over all orders · USD and bps of intended notional</div>
          <ul style={GRID}>
            {v.totals.map(r => (
              <li key={r.label}>
                <span style={{ color: '#888078' }}>{r.label}: </span>
                <span style={{ color: '#ede8e0' }}>{r.usd} · {r.bps}</span>
                {r.n && <span style={{ color: '#888078', fontSize: '0.7rem' }}> ({r.n})</span>}
              </li>
            ))}
          </ul>
          <p style={{ ...TEXT, fontSize: '0.72rem' }}>
            Each line adds up the orders that have that term; the bps share is over the intended notional of those orders.
          </p>
        </div>
      )}
      {v.unfilledNote && <p style={TEXT} data-testid="orders-unfilled">{v.unfilledNote}</p>}
      <p style={{ ...TEXT, fontSize: '0.72rem' }}>These costs coincided with the orders; the audit does not show what caused them.</p>
    </section>
  );
}

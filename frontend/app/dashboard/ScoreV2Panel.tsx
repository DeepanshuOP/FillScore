'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { describeV2, describeVerify, isScored, verifyBadge } from './scoreV2';
import { leadBreakdown } from './ordersView';

interface Props {
  status: number | null;
  body: unknown;
  /** Calls GET /api/audit/verify for the signed-in account; absent for demo views. */
  onVerify?: () => Promise<{ status: number; body: unknown }>;
  /** GET /api/audit/orders-summary: its totals per term lead the panel beside the letter. Optional. */
  ordersBody?: unknown;
}

const CARD = {
  padding: '1.25rem 1.5rem', background: '#1c1c1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px',
  display: 'flex', flexDirection: 'column' as const, gap: '0.75rem',
};
const LABEL = { fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' as const };
const TEXT = { fontFamily: 'var(--font-inter)', fontSize: '0.85rem', lineHeight: 1.6, color: '#a09890' };

/** The measured score (v2) beside the rule-based v1 grade. All numbers come from GET /api/audit/v2. */
export default function ScoreV2Panel({ status, body, onVerify, ordersBody }: Props) {
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyRes, setVerifyRes] = useState<{ status: number; body: unknown } | null>(null);
  if (status === null) return null;
  const v = describeV2(status, body);
  const lead = leadBreakdown(ordersBody);

  return (
    <section aria-label="Measured score (v2)" data-testid="score-v2" style={CARD}>
      <div style={LABEL}>Measured score · v2</div>
      {!isScored(v) ? (
        <p style={TEXT}>{v.message}</p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '2rem', flexWrap: 'wrap', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-inter)', fontWeight: 700, fontSize: '1.5rem', color: '#ede8e0' }}>{v.headline}</span>
              {v.range && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#888078' }}>{v.range}</span>}
              {v.costVsExpected && (
                <span data-testid="score-v2-cost-vs-expected" style={{ ...TEXT, flexBasis: '100%', color: '#ede8e0' }}>{v.costVsExpected}</span>
              )}
            </div>
            {lead && (
              <div data-testid="score-v2-costs" style={{ minWidth: '15rem' }}>
                <div style={LABEL}>Cost over all orders · USD · bps of intended notional</div>
                <ul style={{ ...TEXT, listStyle: 'none', padding: 0, margin: '0.35rem 0 0' }}>
                  {lead.map(r => (
                    <li key={r.label}>
                      <span style={{ color: '#888078' }}>{r.label}: </span>
                      <span style={{ color: '#ede8e0' }}>{r.usd} · {r.bps}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {v.detail && <p style={TEXT}>{v.detail}</p>}
          {v.note && <p style={{ ...TEXT, fontSize: '0.78rem' }} data-testid="score-v2-demo-note">{v.note}</p>}
          <ul style={{ ...TEXT, listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
            {v.components.map(c => (
              <li key={c.key} title={c.counts}>
                <span style={{ color: '#888078' }}>{c.name}: </span>
                <span style={{ color: '#ede8e0' }}>{c.value}</span>
              </li>
            ))}
          </ul>
          {v.timingNote && <p style={{ ...TEXT, fontSize: '0.78rem' }} data-testid="score-v2-timing">{v.timingNote}</p>}
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: '#888078' }}>
            <span>version {v.version}</span>
            <span>hash {v.hashShort}</span>
            {(() => {
              const badge = verifyBadge(verifyRes?.status ?? null, verifyRes?.body ?? null, !!onVerify);
              const color = badge.tone === 'good' ? '#4ade80' : badge.tone === 'bad' ? '#ef4444' : '#888078';
              return <span data-testid="score-v2-badge" style={{ color, border: `1px solid ${color}`, borderRadius: '2px', padding: '0.05rem 0.4rem' }}>{badge.label}</span>;
            })()}
            <Link href="/methodology" style={{ color: '#a78b71' }}>methodology</Link>
            {onVerify && (
              <button
                type="button"
                disabled={verifying}
                onClick={async () => {
                  setVerifying(true);
                  try {
                    const r = await onVerify();
                    setVerifyRes(r);
                    setVerifyMsg(describeVerify(r.status, r.body));
                  } catch {
                    setVerifyRes({ status: 503, body: null });
                    setVerifyMsg(describeVerify(503, null));
                  } finally {
                    setVerifying(false);
                  }
                }}
                style={{ background: 'transparent', border: '1px solid rgba(167,139,113,0.4)', color: '#a78b71', padding: '0.3rem 0.7rem', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}
              >
                {verifying ? 'Verifying…' : 'Verify integrity'}
              </button>
            )}
          </div>
          {verifyMsg && <p style={TEXT} role="status">{verifyMsg}</p>}
        </>
      )}
    </section>
  );
}

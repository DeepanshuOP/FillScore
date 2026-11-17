'use client';
import React, { useState } from 'react';
import { ASK_COPY, describeAsk, type AskView } from './askView';

interface Props { mlBaseUrl: string; accessToken: string | null | undefined }

const CARD = {
  padding: '1.25rem 1.5rem', background: '#1c1c1a', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '3px',
  display: 'flex', flexDirection: 'column' as const, gap: '0.75rem',
};
const LABEL = { fontFamily: 'var(--font-mono)', fontSize: '0.58rem', letterSpacing: '0.18em', color: '#888078', textTransform: 'uppercase' as const };
const TEXT = { fontFamily: 'var(--font-inter)', fontSize: '0.85rem', lineHeight: 1.6, color: '#a09890', margin: 0 };

/** Ask your execution (M5): one question about the account's own past executions. For a signed-in account only (a demo account runs no
 *  model). M8 redesigns this panel. */
export default function AskPanel({ mlBaseUrl, accessToken }: Props) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<AskView | null>(null);

  const send = async () => {
    const q = question.trim();
    if (!q || busy) return;
    setBusy(true);
    setView(null);
    try {
      const res = await fetch(`${mlBaseUrl}/ml/agents/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify({ question: q }),
      });
      setView(describeAsk(res.status, await res.json().catch(() => null)));
    } catch {
      setView(describeAsk(0, null));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={ASK_COPY.title} data-testid="ask-panel" style={CARD}>
      <div style={LABEL}>{ASK_COPY.title}</div>
      <p style={{ ...TEXT, fontSize: '0.75rem' }}>{ASK_COPY.hint}</p>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input
          value={question} onChange={e => setQuestion(e.target.value)} maxLength={300} placeholder={ASK_COPY.placeholder}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          aria-label="Your question" disabled={busy}
          style={{ flex: '1 1 18rem', background: '#121210', border: '1px solid rgba(255,255,255,0.1)', color: '#ede8e0', padding: '0.45rem 0.6rem', borderRadius: '2px', fontFamily: 'var(--font-inter)', fontSize: '0.8rem' }}
        />
        <button type="button" onClick={send} disabled={busy || !question.trim()}
          style={{ background: 'transparent', border: '1px solid rgba(167,139,113,0.4)', color: '#a78b71', padding: '0.4rem 0.9rem', borderRadius: '2px', cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: '0.65rem' }}>
          {busy ? 'ASKING…' : ASK_COPY.button}
        </button>
      </div>
      {view?.error && <p style={TEXT} data-testid="ask-error">{view.error}</p>}
      {view?.answer && (
        <div data-testid="ask-answer">
          <p style={{ ...TEXT, color: '#ede8e0' }}>{view.answer}</p>
          {view.note && <p style={{ ...TEXT, fontSize: '0.72rem' }}>{view.note}</p>}
          {view.meta && <p style={{ ...TEXT, fontSize: '0.72rem' }}>{view.meta}</p>}
          {view.values.length > 0 && (
            <details>
              <summary style={{ ...TEXT, fontSize: '0.72rem', cursor: 'pointer' }}>Values used</summary>
              <ul style={{ ...TEXT, fontSize: '0.72rem', listStyle: 'none', padding: 0, margin: '0.3rem 0 0' }}>
                {view.values.map(v => <li key={v}>{v}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

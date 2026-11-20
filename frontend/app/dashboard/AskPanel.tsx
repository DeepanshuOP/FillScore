'use client';
import React, { useState } from 'react';
import { Panel } from '../ui/Panel';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Banner } from '../ui/Banner';
import { Disclosure } from '../ui/Disclosure';
import { ASK_COPY, describeAsk, type AskView } from './askView';

interface Props { mlBaseUrl: string; accessToken: string | null | undefined }

/** Ask your execution (M5): one question about the account's own past executions. For a signed-in account only (a demo account runs no
 *  model). */
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
    <div data-testid="ask-panel">
      <Panel title={ASK_COPY.title} description={ASK_COPY.hint}>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Your question" value={question} onChange={e => setQuestion(e.target.value)} maxLength={300} placeholder={ASK_COPY.placeholder}
            onKeyDown={e => { if (e.key === 'Enter') send(); }} disabled={busy} className="min-w-64 flex-1" />
          <Button onClick={send} disabled={!question.trim()} loading={busy}>{busy ? 'Asking…' : ASK_COPY.button}</Button>
        </div>
        {view?.error && <div data-testid="ask-error" className="mt-4"><Banner kind="refused" title={view.error} /></div>}
        {view?.answer && (
          <div data-testid="ask-answer" className="mt-4 flex flex-col gap-2">
            <p className="max-w-[68ch] text-sm text-ui-ink">{view.answer}</p>
            {view.note && <p className="text-sm text-ui-graphite">{view.note}</p>}
            {view.meta && <p className="text-sm text-ui-graphite">{view.meta}</p>}
            {view.values.length > 0 && (
              <Disclosure summary="Values used">
                <ul className="flex flex-col gap-1">
                  {view.values.map(v => <li key={v}>{v}</li>)}
                </ul>
              </Disclosure>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}

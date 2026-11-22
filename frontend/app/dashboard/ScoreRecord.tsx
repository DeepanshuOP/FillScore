'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { Panel } from '../ui/Panel';
import { useToast } from '../ui/Toast';
import { Copy } from 'lucide-react';
import { describeV2, describeVerify, isScored, verifyBadge } from './scoreV2';

interface Props {
  status: number | null;
  body: unknown;
  /** Calls GET /api/audit/verify for the signed-in account; absent for demo views. */
  onVerify?: () => Promise<{ status: number; body: unknown }>;
}

/**
 * The record behind the measured grade: its components, the scoring version, the integrity hash and, for a signed-in
 * account, a check that recomputes the hash from the stored inputs. Everything comes from GET /api/audit/v2.
 */
export default function ScoreRecord({ status, body, onVerify }: Props) {
  const toast = useToast();
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyRes, setVerifyRes] = useState<{ status: number; body: unknown } | null>(null);
  if (status === null) return null;
  const v = describeV2(status, body);
  if (!isScored(v)) return null;
  const badge = verifyBadge(verifyRes?.status ?? null, verifyRes?.body ?? null, !!onVerify);

  // The full hash is in the v2 body; the view carries only the short form.
  const fullHash = (body as { integrityHash?: unknown } | null)?.integrityHash;
  const hashText = typeof fullHash === 'string' ? fullHash : v.hashShort;
  async function copyHash() {
    const text = hashText;
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ title: 'Integrity hash copied' });
    } catch {
      toast.show({ title: 'The hash could not be copied', detail: 'Select it and copy it by hand.' });
    }
  }

  async function verify() {
    if (!onVerify) return;
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
  }

  return (
    <div data-testid="score-v2">
      <Panel id="score-record" title="The record behind the grade" note={{ label: 'what the record holds', text: 'What the measured grade was made of, and how to check that it was not changed.' }}
        actions={<span data-testid="score-v2-badge" className="inline-flex h-6 items-center rounded-full bg-ui-overlay px-2.5 text-[12px] font-medium text-ui-ink ring-1 ring-inset ring-ui-rule">{badge.label}</span>}>
        <Disclosure summary="Components, version and integrity hash">
          <div className="flex flex-col gap-4">
            {v.range ? <p className="text-sm text-ui-graphite">{v.range}</p> : null}
            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {v.components.map((c) => (
                <div key={c.key} className="border-b border-ui-rule py-2">
                  <dt className="text-[13px] text-ui-graphite">{c.name}</dt>
                  <dd className="text-sm text-ui-ink">{c.value}<span className="block text-[13px] text-ui-graphite">{c.counts}</span></dd>
                </div>
              ))}
              <div className="border-b border-ui-rule py-2">
                <dt className="text-[13px] text-ui-graphite">Scoring version</dt>
                <dd className="text-sm text-ui-ink">{v.version}</dd>
              </div>
              <div className="border-b border-ui-rule py-2">
                <dt className="text-[13px] text-ui-graphite">Integrity hash</dt>
                <dd className="flex items-center gap-2 text-sm text-ui-ink">
                  <code className="rounded-[6px] bg-ui-overlay px-1.5 py-0.5 font-ui-mono text-[12px] text-ui-ink">{v.hashShort}</code>
                  <button type="button" aria-label="Copy the integrity hash" onClick={copyHash}
                    className="grid size-7 place-items-center rounded-[6px] text-ui-graphite transition-colors hover:bg-ui-overlay hover:text-ui-ink">
                    <Copy aria-hidden="true" strokeWidth={1.75} className="size-4" />
                  </button>
                </dd>
              </div>
            </dl>
            {v.timingNote ? <p className="text-[13px] text-ui-graphite" data-testid="score-v2-timing">{v.timingNote}</p> : null}
            <p className="text-[13px] text-ui-graphite">
              <Link href="/methodology" className="text-ui-action underline-offset-4 hover:underline">How the score is computed</Link>
            </p>
            {onVerify ? (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="secondary" loading={verifying} onClick={verify}>Verify integrity</Button>
                {verifyMsg ? <p role="status" className="text-sm text-ui-ink">{verifyMsg}</p> : null}
              </div>
            ) : null}
          </div>
        </Disclosure>
      </Panel>
    </div>
  );
}

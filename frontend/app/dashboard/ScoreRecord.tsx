'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '../ui/Button';
import { Disclosure } from '../ui/Disclosure';
import { Panel } from '../ui/Panel';
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
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyRes, setVerifyRes] = useState<{ status: number; body: unknown } | null>(null);
  if (status === null) return null;
  const v = describeV2(status, body);
  if (!isScored(v)) return null;
  const badge = verifyBadge(verifyRes?.status ?? null, verifyRes?.body ?? null, !!onVerify);

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
      <Panel id="score-record" title="The record behind the grade" description="What the measured grade was made of, and how to check that it was not changed.">
        <Disclosure summary="Components, version and integrity hash">
          <div className="flex flex-col gap-4">
            {v.range ? <p className="text-sm text-ui-graphite">{v.range}</p> : null}
            <dl className="grid gap-x-10 gap-y-2 sm:grid-cols-3">
              {v.components.map((c) => (
                <div key={c.key} className="border-b border-ui-rule py-1">
                  <dt className="text-sm text-ui-graphite">{c.name}</dt>
                  <dd className="text-ui-ink">{c.value}<span className="block text-sm text-ui-graphite">{c.counts}</span></dd>
                </div>
              ))}
            </dl>
            {v.timingNote ? <p className="text-sm text-ui-graphite" data-testid="score-v2-timing">{v.timingNote}</p> : null}
            <p className="text-sm text-ui-graphite">
              Scoring version {v.version}, integrity hash{' '}
              <code className="rounded-ui border border-ui-rule px-1.5 py-0.5 font-[family-name:var(--ui-mono)] text-[0.8125rem] text-ui-ink">{v.hashShort}</code>.{' '}
              <span data-testid="score-v2-badge" className="font-medium text-ui-ink">{badge.label}</span>.{' '}
              <Link href="/methodology" className="text-ui-ink">How the score is computed</Link>.
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

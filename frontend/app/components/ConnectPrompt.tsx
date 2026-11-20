'use client';
import React from 'react';
import Link from 'next/link';
import { EmptyState } from '../ui/EmptyState';

/** The dashboard of a signed-in account with nothing scored yet: what is missing, and the next step. */
export default function ConnectPrompt() {
  return (
    <div className="mx-auto max-w-2xl">
      <EmptyState
        title="No trades yet"
        action={
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/onboarding" className="no-underline"><span className="inline-flex min-h-10 items-center rounded-ui border border-ui-ink bg-ui-ink px-4 py-2 text-sm font-medium text-ui-surface">Sync again</span></Link>
            <Link href="/check" className="text-sm text-ui-ink">Trades in a broker app? Check a trade-history file</Link>
            <Link href="/dashboard?userId=demo-disciplined&sample=1" className="text-sm text-ui-ink">View the sample dashboard</Link>
          </div>
        }
      >
        No scored trades were found for your account in the period last synced. Sync again, optionally over a longer period, to audit your past fills. Exchange keys are read-only; FillScore never asks for withdrawal access.
      </EmptyState>
    </div>
  );
}

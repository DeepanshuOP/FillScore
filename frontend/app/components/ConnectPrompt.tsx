'use client';
import React from 'react';
import Link from 'next/link';
import { EmptyState } from '../ui/EmptyState';
import { buttonClass } from '../ui/buttonClass';

/** The dashboard of a signed-in account with nothing scored yet: what is missing, and the next step. */
export default function ConnectPrompt() {
  return (
    <div className="mx-auto max-w-2xl">
      <EmptyState
        title="No trades yet"
        action={
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/app/connect" className={buttonClass('primary')}>Sync again</Link>
            <Link href="/app/check" className="text-sm text-ui-action underline-offset-4 hover:underline">Trades in a broker app? Check a trade-history file</Link>
            <Link href="/app?userId=demo-disciplined&sample=1" className="text-sm text-ui-action underline-offset-4 hover:underline">View the sample audit</Link>
          </div>
        }
      >
        No scored trades were found for your account in the period last synced. Sync again, optionally over a longer period, to audit your past fills. Exchange keys are read-only; FillScore never asks for withdrawal access.
      </EmptyState>
    </div>
  );
}

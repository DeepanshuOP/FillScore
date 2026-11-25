'use client';
import React from 'react';
import Link from 'next/link';
import { Plug } from 'lucide-react';
import { EmptyState } from '../ui/EmptyState';
import { buttonClass } from '../ui/buttonClass';

/** The one primary action of every "nothing measured yet" state of a signed-in account (PROPOSAL §4 rows 7 and 12). */
export function ConnectAction() {
  return <Link href="/app/connect" className={buttonClass('primary', 'md', 'no-underline pointer-coarse:h-11')}>Connect an exchange</Link>;
}

/** The dashboard of a signed-in account with nothing scored yet: what is missing, and the next step. */
export default function ConnectPrompt() {
  return (
    <div className="mx-auto max-w-2xl" data-testid="connect-prompt">
      <EmptyState
        icon={<Plug />}
        title="No trades yet"
        action={
          <div className="flex flex-col items-center gap-3">
            <ConnectAction />
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[14px]">
              <Link href="/app/check" className="inline-flex min-h-11 items-center text-ui-ink underline underline-offset-4">Trades in a broker app? Check an exchange export</Link>
              <Link href="/app?userId=demo-disciplined&sample=1" className="inline-flex min-h-11 items-center text-ui-ink underline underline-offset-4">View the sample audit</Link>
            </div>
          </div>
        }
      >
        No scored trades were found for your account in the period last synced. Connect an exchange, or sync again over a longer period, to audit your past fills. Exchange keys are read-only; FillScore never asks for withdrawal access.
      </EmptyState>
    </div>
  );
}

import React from 'react';
import Link from 'next/link';
import { Logo } from './shell/Logo';

/**
 * The one layout of the five account pages (log in, sign up, forgot password, reset password, verify email).
 * A split screen on lg: the form column on the left, a quiet panel on the right; one column on phones.
 * The page that uses it supplies the content; nothing here decides what the account page says.
 */
export default function AuthLayout({ title, intro, children, footer }: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ui-surface lg:grid lg:grid-cols-2">
      <main className="flex min-h-screen flex-col px-5 py-8 sm:px-8">
        <Link href="/" aria-label="FillScore home" className="inline-flex w-fit no-underline"><Logo /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h1 className="display-lg text-balance text-ui-ink">{title}</h1>
          {intro ? <p className="mt-3 text-[15px] leading-6 text-ui-graphite">{intro}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-ui-rule pt-4 text-[13px] text-ui-graphite">{footer}</div> : null}
        </div>
      </main>
      {/* design v3: the side of the account pages is a receipt laid on the paper, stating the rules of the house */}
      <aside aria-label="About FillScore" className="hidden items-center justify-center border-l border-ui-ink p-10 lg:flex">
        <div className="w-full max-w-[400px] -rotate-[1.2deg]">
          <div className="fs-receipt shadow-ui">
            <p className="fs-r-title">FillScore</p>
            <p className="c mt-1">TERMS OF THE AUDIT</p>
            <hr />
            <ol className="flex flex-col gap-1.5">
              {['Read-only keys only. A key that can trade or withdraw is returned.', 'Past orders only. No prediction, no advice.', 'Every number comes from code, never from a language model.', 'Secrets are encrypted at rest and never shown again.'].map((t, i) => (
                <li key={t} className="grid grid-cols-[3ch_minmax(0,1fr)] gap-x-2"><span className="g">{String(i + 1).padStart(2, '0')}</span><span>{t}</span></li>
              ))}
            </ol>
            <div className="fs-perf" aria-hidden="true" />
            <p className="font-ui text-[1.125rem] leading-snug font-bold text-ui-ink">FillScore grades how your past orders executed against the market around them.</p>
          </div>
          <div aria-hidden="true" className="fs-torn-bottom" />
        </div>
      </aside>
    </div>
  );
}

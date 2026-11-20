import React from 'react';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
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
          <h1 className="display-md text-balance text-ui-ink">{title}</h1>
          {intro ? <p className="mt-2 text-[13px] leading-5 text-ui-graphite">{intro}</p> : null}
          <div className="mt-8">{children}</div>
          {footer ? <div className="mt-8 border-t border-ui-rule pt-4 text-[13px] text-ui-graphite">{footer}</div> : null}
        </div>
      </main>
      <aside aria-label="About FillScore" className="hidden p-4 lg:block">
        <div className="panel aurora flex h-full flex-col justify-end p-10">
          <ShieldCheck aria-hidden="true" strokeWidth={1.75} className="mb-4 size-6 text-ui-measured" />
          <p className="max-w-[34ch] text-[1.25rem] font-semibold leading-snug tracking-[-0.02em] text-ui-ink">
            FillScore graded how your past orders executed against the market around them.
          </p>
          <p className="mt-3 text-[13px] leading-5 text-ui-graphite">Read-only keys only.</p>
        </div>
      </aside>
    </div>
  );
}

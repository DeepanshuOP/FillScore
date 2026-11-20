import React from 'react';
import Navbar from './Navbar';

/**
 * The one layout of the five account pages (log in, sign up, forgot password, reset password, verify email).
 * A single column under the navbar: a title, one sentence, the form, and a line of alternative links.
 * The page that uses it supplies the content; nothing here decides what the account page says.
 */
export default function AuthLayout({ title, intro, children, footer }: {
  title: string;
  intro?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-ui-surface pt-12">
      <Navbar />
      <main className="mx-auto w-full max-w-md px-4 pb-16 pt-10 sm:pt-16">
        <h1 className="text-[1.75rem] leading-9 font-semibold text-balance text-ui-ink">{title}</h1>
        {intro ? <p className="mt-2 text-ui-graphite">{intro}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? <div className="mt-8 border-t border-ui-rule pt-4 text-sm text-ui-graphite">{footer}</div> : null}
      </main>
    </div>
  );
}

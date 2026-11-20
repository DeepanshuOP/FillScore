'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { cn } from '../../lib/utils';

/** The account part of the navbar: the signed-in email with its settings and log-out, or the log-in and sign-up links. */
export default function AuthNav({ stacked = false }: { stacked?: boolean }) {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const row = cn('flex items-center gap-4', stacked && 'flex-col items-start gap-1');

  if (isLoading) {
    // The height of the real content, so the bar does not jump when the account is known.
    return <div aria-hidden="true" className="h-6 w-28" />;
  }

  if (user) {
    return (
      <div className={row}>
        <Link href="/settings" className="max-w-[16rem] truncate py-2 text-sm text-ui-graphite hover:text-ui-ink" title="Account settings">
          {user.email}
        </Link>
        <button
          type="button"
          onClick={() => {
            logout();
            router.push('/');
          }}
          className="rounded-ui border border-ui-edge px-3 py-1.5 text-sm text-ui-ink hover:bg-ui-raised"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className={row}>
      <Link href="/login" className="py-2 text-sm text-ui-ink">Log in</Link>
      <Link href="/signup" className="rounded-ui border border-ui-ink bg-ui-ink px-3 py-1.5 text-sm text-ui-surface no-underline hover:opacity-90">Sign up</Link>
    </div>
  );
}

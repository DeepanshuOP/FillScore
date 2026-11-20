'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiBase } from '../lib/apiBase';
import AuthLayout from '../components/AuthLayout';
import { Banner } from '../ui/Banner';

type Status = 'verifying' | 'success' | 'invalid';

function VerifyEmailContent() {
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'invalid');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    const baseUrl = apiBase();
    fetch(`${baseUrl}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => setStatus(res.ok ? 'success' : 'invalid'))
      .catch(() => setStatus('invalid'));
  }, [token]);

  const title = status === 'success' ? 'Email verified' : status === 'verifying' ? 'Verifying…' : 'Link not valid';
  const intro = status === 'verifying' ? 'One moment.' : status === 'success' ? 'Your address is confirmed.' : undefined;

  return (
    <AuthLayout title={title} intro={intro}>
      {status === 'success' && (
        <Link href="/dashboard" className="text-ui-ink">Go to dashboard</Link>
      )}

      {status === 'invalid' && (
        <div className="flex flex-col gap-5">
          <Banner kind="refused" title="The link did not verify">
            This verification link is invalid, already used, or has expired. Sign in and request a new one.
          </Banner>
          <Link href="/login" className="text-ui-ink">Sign in</Link>
        </div>
      )}
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<AuthLayout title="Loading">{null}</AuthLayout>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

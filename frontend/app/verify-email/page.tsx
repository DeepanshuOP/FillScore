'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthCard from '../components/AuthCard';

type Status = 'verifying' | 'success' | 'invalid';

const linkButton: React.CSSProperties = {
  display: 'inline-block', width: '100%', padding: '0.925rem', borderRadius: '2px',
  fontFamily: 'var(--font-mono)', fontSize: '0.8rem', letterSpacing: '0.1em', fontWeight: 600,
  background: 'rgba(167,139,113,0.15)', color: '#d4c4b4', border: '1px solid rgba(167,139,113,0.3)',
  textDecoration: 'none', textAlign: 'center',
};

function VerifyEmailContent() {
  const token = useSearchParams().get('token');
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'invalid');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    fetch(`${baseUrl}/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => setStatus(res.ok ? 'success' : 'invalid'))
      .catch(() => setStatus('invalid'));
  }, [token]);

  return (
    <div className="px-[1.5rem] py-[2rem] sm:px-[2rem]" style={{ textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-playfair)', fontStyle: 'italic', fontSize: '1.6rem', color: '#ede8e0', fontWeight: 400, marginBottom: '1rem' }}>
        {status === 'success' ? 'Email verified' : status === 'verifying' ? 'Verifying…' : 'Link not valid'}
      </h2>

      {status === 'verifying' && (
        <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#8a8078' }}>One moment.</p>
      )}

      {status === 'success' && (
        <>
          <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#8a8078', marginBottom: '1.5rem' }}>
            Your address is confirmed.
          </p>
          <a href="/dashboard" style={linkButton}>Go to dashboard</a>
        </>
      )}

      {status === 'invalid' && (
        <>
          <div role="alert" style={{ padding: '1rem', background: 'rgba(192,57,43,0.07)', borderLeft: '2px solid rgba(192,57,43,0.65)', borderRadius: '0 2px 2px 0', marginBottom: '1.5rem', textAlign: 'left' }}>
            <p style={{ fontFamily: 'var(--font-inter)', fontSize: '0.85rem', color: '#d9534f', margin: 0 }}>
              This verification link is invalid, already used, or has expired. Sign in and request a new one.
            </p>
          </div>
          <a href="/login" style={linkButton}>Sign in</a>
        </>
      )}
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthCard>
      <Suspense fallback={<div className="px-[1.5rem] py-[2rem] text-center" style={{ color: '#8a8078', fontFamily: 'var(--font-inter)' }}>Loading...</div>}>
        <VerifyEmailContent />
      </Suspense>
    </AuthCard>
  );
}

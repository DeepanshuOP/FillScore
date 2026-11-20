'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import CsvCheckPanel from '../dashboard/CsvCheckPanel';

/** Check a broker file (M6 §1) without an exchange connection: for people whose trades are in a broker app. Signed-in accounts only. */
export default function CheckFilePage() {
  const router = useRouter();
  const { user, isLoading, accessToken, refreshAccessToken } = useAuth();

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [isLoading, user, router]);

  if (isLoading || !user) return null;

  return (
    <main style={{ minHeight: '100vh', background: '#0f0f0f', color: '#ede8e0', fontFamily: 'var(--font-inter)', padding: '6rem 1.5rem 3rem' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: '1.5rem' }}>Check a trade-history file</h1>
        <CsvCheckPanel mlBaseUrl={process.env.NEXT_PUBLIC_ML_URL ?? 'http://localhost:8000'} accessToken={accessToken} refreshAccessToken={refreshAccessToken} />
      </div>
    </main>
  );
}

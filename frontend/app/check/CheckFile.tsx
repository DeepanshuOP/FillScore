'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MarketingNav } from '../components/marketing/MarketingNav';
import SiteFooter from '../components/SiteFooter';
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
    <>
      <MarketingNav />
      <main className="min-h-screen bg-ui-surface pb-24">
        <div className="mx-auto max-w-[1240px] px-5 pt-28 sm:px-8">
          <h1 className="display-md mb-3 text-ui-ink">Check a trade-history file</h1>
          <p className="mb-8 max-w-[68ch] text-[15px] text-ui-graphite">Choose a broker export. Each fill is read and compared with the public price at its time.</p>
          <div className="max-w-[900px]">
            <CsvCheckPanel mlBaseUrl={process.env.NEXT_PUBLIC_ML_URL ?? 'http://localhost:8000'} accessToken={accessToken} refreshAccessToken={refreshAccessToken} />
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

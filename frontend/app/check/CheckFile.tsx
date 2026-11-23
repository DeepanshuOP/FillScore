'use client';

import React from 'react';
import Link from 'next/link';
import { AppPage } from '../components/appshell/shellContext';
import { Banner } from '../ui/Banner';
import { buttonClass } from '../ui/buttonClass';
import { useAuth } from '../context/AuthContext';
import CsvCheckPanel from '../dashboard/CsvCheckPanel';

/**
 * Check a broker file (M6 §1) for people whose trades are in a broker app. The page opens signed out and in demo mode (IA v4); the
 * check itself runs only for a signed-in account (the server refuses the others with a printed message), so a visitor without one
 * is told so before choosing a file.
 */
export default function CheckFile() {
  const { isLoading, accessToken, refreshAccessToken } = useAuth();
  return (
    <AppPage sourceText="Broker file, public prices">
      <div className="flex max-w-[900px] flex-col gap-6">
        <p className="max-w-[68ch] text-[15px] text-ui-graphite">Choose a broker export. Each fill is read and compared with the public price at its time.</p>
        {!isLoading && !accessToken ? (
          <Banner kind="info" title="Checking your own file needs a signed-in account"
            action={<Link href="/login" className={buttonClass('secondary', 'sm', 'no-underline')}>Log in</Link>}>
            The check runs on our server and counts against a limit for each account, so a demo account or a visitor without one cannot run it on a file of their own. The sample file below needs no account.
          </Banner>
        ) : null}
        <CsvCheckPanel mlBaseUrl={process.env.NEXT_PUBLIC_ML_URL ?? 'http://localhost:8000'} accessToken={accessToken} refreshAccessToken={refreshAccessToken} />
      </div>
    </AppPage>
  );
}

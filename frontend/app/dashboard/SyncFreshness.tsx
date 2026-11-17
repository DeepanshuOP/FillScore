'use client';
import React, { useEffect, useState } from 'react';
import { authFetch } from '../lib/authFetch';
import { apiBase } from '../lib/apiBase';
import { describeFreshness, type Freshness } from './syncFreshness';

interface Props { accessToken: string | null | undefined; refreshAccessToken: () => Promise<string | null> }

/** One line under the dashboard header for a signed-in account: when the data was last synced, and what a stale age means. M8 redesigns it. */
export default function SyncFreshness({ accessToken, refreshAccessToken }: Props) {
  const [f, setF] = useState<Freshness | null>(null);
  useEffect(() => {
    if (!accessToken) return;
    let current = true;
    authFetch(`${apiBase()}/onboarding/sync/status`, {}, { accessToken, refreshAccessToken })
      .then(r => (r.ok ? r.json() : null))
      .then(s => { if (current && s) setF(describeFreshness({ lastSyncAt: s.lastSyncAt, stale: s.stale })); })
      .catch(() => { /* no line when the status cannot be read */ });
    return () => { current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);
  if (!f) return null;
  return (
    <p data-testid="sync-freshness" data-stale={f.stale} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.04em', margin: '0 0 1rem',
      color: f.stale ? '#d9a860' : '#888078' }}>
      {f.text}
    </p>
  );
}

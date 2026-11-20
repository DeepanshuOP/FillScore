'use client';
import React, { useEffect, useRef, useState } from 'react';
import { authFetch } from '../lib/authFetch';
import { apiBase } from '../lib/apiBase';
import { Banner } from '../ui/Banner';
import { describeFreshness, type Freshness } from './syncFreshness';

interface Props { accessToken: string | null | undefined; refreshAccessToken: () => Promise<string | null> }

/** One line under the dashboard header for a signed-in account: when the data was last synced, and what a stale age means. */
export default function SyncFreshness({ accessToken, refreshAccessToken }: Props) {
  const [f, setF] = useState<Freshness | null>(null);
  // The page may pass a new function on each render; the status is read again only when the token changes.
  const refreshRef = useRef(refreshAccessToken);
  useEffect(() => { refreshRef.current = refreshAccessToken; });
  useEffect(() => {
    if (!accessToken) return;
    let current = true;
    authFetch(`${apiBase()}/onboarding/sync/status`, {}, { accessToken, refreshAccessToken: () => refreshRef.current() })
      .then(r => (r.ok ? r.json() : null))
      .then(s => { if (current && s) setF(describeFreshness({ lastSyncAt: s.lastSyncAt, stale: s.stale })); })
      .catch(() => { /* no line when the status cannot be read */ });
    return () => { current = false; };
  }, [accessToken]);
  if (!f) return null;
  return (
    <div data-testid="sync-freshness" data-stale={f.stale} className="mb-4">
      {f.stale
        ? <Banner kind="stale" title={f.text} />
        : <p className="text-sm text-ui-graphite">{f.text}</p>}
    </div>
  );
}

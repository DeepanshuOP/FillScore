/**
 * Privacy-safe product analytics (M5). `track` adds one to an anonymous daily counter (POST /api/analytics/event). It sends the event
 * name and nothing else: no account id, no token, no cookie (`credentials: 'omit'`). It sends nothing when the visitor has Do Not Track
 * or Global Privacy Control on, and a failed request never reaches the page.
 */
import { apiBase } from './apiBase';

export type AnalyticsEvent = 'dashboard_view' | 'report_download' | 'replay_open' | 'quick_audit' | 'deep_audit' | 'evidence_pack_download';

type PrivacyNavigator = Navigator & { doNotTrack?: string | null; globalPrivacyControl?: boolean };

export function track(event: AnalyticsEvent, fetchFn: typeof fetch = (...a) => fetch(...a)): void {
  try {
    const nav = (typeof navigator !== 'undefined' ? navigator : undefined) as PrivacyNavigator | undefined;
    if (nav && (nav.doNotTrack === '1' || nav.globalPrivacyControl === true)) return;
    void fetchFn(`${apiBase()}/analytics/event`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event }), keepalive: true, credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // an analytics counter must never break the page
  }
}

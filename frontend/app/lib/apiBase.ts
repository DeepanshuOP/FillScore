/**
 * Base URL for every browser-side call to the backend API (F-16).
 *
 * NEXT_PUBLIC_API_URL when set; otherwise the relative `/api`, which next.config.mjs rewrites to
 * the backend when BACKEND_PROXY_URL is set. Server-side code (share page, OG image) uses
 * serverApiBase() instead, because a relative URL has no origin there.
 *
 * The default branch must reference `process.env.NEXT_PUBLIC_API_URL` literally: Next.js inlines
 * only that exact expression into client bundles.
 */
export function apiBase(vars?: Record<string, string | undefined>): string {
  const raw = vars ? vars.NEXT_PUBLIC_API_URL : process.env.NEXT_PUBLIC_API_URL;
  const value = raw?.trim().replace(/\/+$/, '');
  return value ? value : '/api';
}

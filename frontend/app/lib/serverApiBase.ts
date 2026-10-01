/**
 * Base URL for API calls made from the Next.js server (share page, OG image).
 *
 * In the browser the app calls a relative `/api` that Vercel proxies to the backend
 * (see next.config.mjs). The server has no browser origin to resolve a relative path
 * against, so it talks to the backend directly when BACKEND_PROXY_URL is set.
 */
export function serverApiBase(vars: Record<string, string | undefined> = process.env): string {
  const proxy = vars.BACKEND_PROXY_URL?.trim().replace(/\/+$/, '');
  if (proxy) return `${proxy}/api`;
  return vars.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
}

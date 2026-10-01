import { authFetch } from './authFetch';

type Auth = { accessToken: string | null; refreshAccessToken: () => Promise<string | null> };

/** Builds `${base}${path}?k=v...`, leaving out empty values. */
export function buildDownloadUrl(baseUrl: string, path: string, params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '') search.set(key, value);
  }
  const query = search.toString();
  return `${baseUrl}${path}${query ? `?${query}` : ''}`;
}

/**
 * window.open cannot send an Authorization header, so a signed-in user first asks the API for a
 * one-minute link token and then opens the file with it. Returns false if no token was issued.
 */
export async function openAuthenticatedDownload(
  kind: 'report' | 'export',
  path: string,
  extraParams: Record<string, string>,
  auth: Auth
): Promise<boolean> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

  // Open the tab inside the click handler, before any await: browsers block window.open once
  // the user gesture has passed. It is pointed at the file when the token arrives.
  const popup = window.open('', '_blank');
  if (popup) popup.opener = null;

  try {
    const res = await authFetch(
      `${baseUrl}/audit/download-token`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }) },
      auth
    );
    if (!res.ok) {
      popup?.close();
      return false;
    }

    const { token } = await res.json();
    const url = buildDownloadUrl(baseUrl, path, { ...extraParams, dl: token });
    if (popup) {
      popup.location.href = url;
    } else {
      window.location.assign(url);
    }
    return true;
  } catch {
    popup?.close();
    return false;
  }
}

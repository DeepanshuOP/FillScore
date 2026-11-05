import { authFetch } from './authFetch';
import { apiBase } from './apiBase';

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
  const baseUrl = apiBase();

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

export interface FileResult { ok: boolean; message?: string; status?: number }

export interface SaveDeps {
  fetch: typeof fetch;
  document: Document;
  createObjectURL: (b: Blob) => string;
  revokeObjectURL: (u: string) => void;
  setTimeout: (fn: () => void, ms: number) => unknown;
}

const browserDeps = (): SaveDeps => ({
  fetch: (...a) => fetch(...a),
  document,
  createObjectURL: b => URL.createObjectURL(b),
  revokeObjectURL: u => URL.revokeObjectURL(u),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
});

/** Filename from Content-Disposition: prefers RFC 5987 filename*, then filename=; stripped to safe characters. */
export function filenameFrom(cd: string | null, fallback: string): string {
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(cd ?? '')?.[1];
  let raw: string | undefined;
  if (star) { try { raw = decodeURIComponent(star.trim()); } catch { raw = undefined; } }
  raw = raw ?? /filename\s*=\s*"?([^";]+)"?/i.exec(cd ?? '')?.[1];
  const safe = (raw ?? '').replace(/[\\/]/g, '_').replace(/[^\w.\- ]/g, '_').replace(/^\.+/, '').trim();
  return safe || fallback;
}

const errorText = (v: unknown): string =>
  typeof v === 'string' ? v : v && typeof v === 'object' && typeof (v as any).message === 'string' ? (v as any).message : '';

/**
 * Fetches a file as a blob and saves it through an anchor. Never throws and never leaves the caller
 * waiting: every failure comes back as { ok: false, message } with the server's text and HTTP status.
 */
export async function fetchAndSave(
  url: string,
  opts: { init?: RequestInit; expectType: string; fallbackName: string },
  deps: SaveDeps = browserDeps()
): Promise<FileResult> {
  let res: Response;
  try {
    res = await deps.fetch(url, opts.init);
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection and try again.' };
  }
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    let text = '';
    try {
      const raw = await res.text();
      try { const j = JSON.parse(raw); text = errorText(j.error) || errorText(j.message); } catch { text = ''; }
    } catch { /* unreadable body */ }
    return { ok: false, status: res.status, message: `${text || 'The server could not prepare the file.'} (HTTP ${res.status})` };
  }
  if (!type.toLowerCase().includes(opts.expectType)) {
    return { ok: false, status: res.status, message: `Expected ${opts.expectType} but the server sent ${type || 'an unknown type'} (HTTP ${res.status}).` };
  }
  try {
    const blob = await res.blob();
    const objectUrl = deps.createObjectURL(blob);
    const a = deps.document.createElement('a');
    a.href = objectUrl;
    a.download = filenameFrom(res.headers.get('content-disposition'), opts.fallbackName);
    deps.document.body.appendChild(a); // must be in the DOM for Firefox to honour click()
    a.click();
    a.remove();
    deps.setTimeout(() => deps.revokeObjectURL(objectUrl), 10_000);
    return { ok: true };
  } catch {
    return { ok: false, message: 'The file was received but the browser could not save it.' };
  }
}

/** DOWNLOAD REPORT: the demo/sample flow carries a demo id; a signed-in user's own report uses a one-minute token. */
export async function downloadReport(
  who: { mode: 'demo' | 'real' | null; userId: string | null },
  auth: Auth,
  deps: SaveDeps = browserDeps(),
  base: string = apiBase()
): Promise<FileResult> {
  const opts = { expectType: 'application/pdf', fallbackName: 'fillscore-report.pdf' };
  if (who.mode === 'demo') {
    if (!who.userId) return { ok: false, message: 'No account is selected for this report. Reload the page and try again.' };
    return fetchAndSave(buildDownloadUrl(base, '/audit/report', { userId: who.userId }), opts, deps);
  }
  if (who.mode !== 'real') return { ok: false, message: 'The dashboard is still loading. Try again in a moment.' };
  let tokenRes: Response;
  try {
    tokenRes = await authFetch(`${base}/audit/download-token`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'report' }) }, auth, deps.fetch);
  } catch {
    return { ok: false, message: 'Could not reach the server. Check your connection and try again.' };
  }
  if (!tokenRes.ok) return { ok: false, status: tokenRes.status, message: `Could not prepare the report (HTTP ${tokenRes.status}). Sign in again and retry.` };
  let token: string;
  try { ({ token } = await tokenRes.json()); } catch { return { ok: false, status: tokenRes.status, message: 'The server sent an unreadable response. Try again.' }; }
  if (!token) return { ok: false, status: tokenRes.status, message: 'The server sent an unreadable response. Try again.' };
  return fetchAndSave(buildDownloadUrl(base, '/audit/report', { dl: token }), opts, deps);
}

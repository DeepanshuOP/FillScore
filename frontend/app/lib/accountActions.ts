import { authFetch } from './authFetch';
import { apiBase } from './apiBase';

/** F-13 account rights: the calls behind the Settings page buttons. */

type Auth = { accessToken: string | null; refreshAccessToken: () => Promise<string | null> };
export type ActionResult = { ok: true } | { ok: false; error: string };

async function errorCode(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

export async function disconnectExchange(exchange: 'binance' | 'bybit' | 'okx', auth: Auth): Promise<ActionResult> {
  const res = await authFetch(`${apiBase()}/onboarding/connections/${exchange}`, { method: 'DELETE' }, auth);
  return res.ok ? { ok: true } : { ok: false, error: await errorCode(res) };
}

export async function fetchAccountExport(auth: Auth): Promise<{ ok: true; json: string } | { ok: false; error: string }> {
  const res = await authFetch(`${apiBase()}/account/export`, {}, auth);
  return res.ok ? { ok: true, json: await res.text() } : { ok: false, error: await errorCode(res) };
}

export async function deleteAccount(password: string, auth: Auth): Promise<ActionResult> {
  const res = await authFetch(
    `${apiBase()}/account`,
    { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) },
    auth
  );
  return res.ok ? { ok: true } : { ok: false, error: await errorCode(res) };
}

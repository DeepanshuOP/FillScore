import { authFetch } from './authFetch';
import { apiBase } from './apiBase';

/**
 * Personal API keys for the read-only MCP server (item 15): the calls behind the Settings section. They send the signed-in
 * user's login token. The key itself is returned once, by createApiKey, and is never stored by the page.
 */
type Auth = { accessToken: string | null; refreshAccessToken: () => Promise<string | null> };

export interface ApiKeyView {
  id: string; name: string; prefix: string; scope: 'read';
  createdAt: string; expiresAt: string; lastUsedAt: string | null; revokedAt: string | null;
}
export type ListResult = { ok: true; keys: ApiKeyView[]; maxActive: number; defaultExpiryDays: number } | { ok: false; error: string };
export type CreateResult = ({ ok: true; key: string } & ApiKeyView) | { ok: false; error: string };

async function errorCode(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data?.error === 'string' ? data.error : `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

export async function listApiKeys(auth: Auth): Promise<ListResult> {
  const res = await authFetch(`${apiBase()}/keys`, {}, auth);
  if (!res.ok) return { ok: false, error: await errorCode(res) };
  const d = await res.json();
  return { ok: true, keys: d.keys, maxActive: d.maxActive, defaultExpiryDays: d.defaultExpiryDays };
}

export async function createApiKey(input: { name: string; expiresInDays: number; password: string }, auth: Auth): Promise<CreateResult> {
  const body: Record<string, unknown> = { name: input.name, expiresInDays: input.expiresInDays };
  if (input.password) body.password = input.password;
  const res = await authFetch(`${apiBase()}/keys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, auth);
  if (!res.ok) return { ok: false, error: await errorCode(res) };
  return { ok: true, ...(await res.json()) };
}

export async function revokeApiKey(id: string, auth: Auth): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await authFetch(`${apiBase()}/keys/${encodeURIComponent(id)}`, { method: 'DELETE' }, auth);
  return res.ok ? { ok: true } : { ok: false, error: await errorCode(res) };
}

export function keyStatus(k: Pick<ApiKeyView, 'revokedAt' | 'expiresAt'>, now: Date = new Date()): 'active' | 'revoked' | 'expired' {
  if (k.revokedAt) return 'revoked';
  return new Date(k.expiresAt).getTime() <= now.getTime() ? 'expired' : 'active';
}

/** The address the MCP server needs: the API origin without its `/api` path (the server adds the paths). */
export function mcpApiUrl(base: string, pageOrigin: string): string {
  if (!/^https?:\/\//.test(base)) return pageOrigin.replace(/\/+$/, '');   // a relative `/api` is served by this site
  return base.replace(/\/+$/, '').replace(/\/api$/, '');
}

/** The environment lines shown with a new key. The key appears here once, in this tab, and is not kept. */
export function mcpConfigSnippet(key: string, apiUrl: string): string {
  return `FILLSCORE_API_URL=${apiUrl}\nFILLSCORE_API_KEY=${key}\nnode mcp-server/server.mjs`;
}

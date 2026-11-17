import { describe, it, expect, vi, afterEach } from 'vitest';
import { listApiKeys, createApiKey, revokeApiKey, keyStatus, mcpConfigSnippet, type ApiKeyView } from './apiKeys';

// Personal API keys (item 15): the calls behind the Settings section, with the user's login token (never an API key).
const auth = { accessToken: 'tok', refreshAccessToken: vi.fn().mockResolvedValue(null) };

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const view = (over: Partial<ApiKeyView> = {}): ApiKeyView => ({
  id: 'k1', name: 'desktop', prefix: 'fsk_ab12cd34', scope: 'read', createdAt: '2026-11-01T00:00:00.000Z',
  expiresAt: '2027-01-30T00:00:00.000Z', lastUsedAt: null, revokedAt: null, ...over,
});

describe('api key calls', () => {
  it('listApiKeys GETs /api/keys', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const f = stubFetch(200, { keys: [view()], maxActive: 5, defaultExpiryDays: 90 });
    const r = await listApiKeys(auth);
    expect(r).toEqual({ ok: true, keys: [view()], maxActive: 5, defaultExpiryDays: 90 });
    expect(f.mock.calls[0][0]).toBe('/api/keys');
    expect(new Headers(f.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('createApiKey POSTs the name, the expiry and the password, and returns the key', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const f = stubFetch(201, { ...view(), key: 'fsk_ab12cd34_' + 'A'.repeat(43) });
    const r = await createApiKey({ name: 'desktop', expiresInDays: 30, password: 'pw' }, auth);
    expect(r.ok && r.key).toBe('fsk_ab12cd34_' + 'A'.repeat(43));
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/api/keys');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'desktop', expiresInDays: 30, password: 'pw' });
  });

  it('createApiKey leaves out an empty password (a password-less account signs in again instead)', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const f = stubFetch(201, { ...view(), key: 'k' });
    await createApiKey({ name: 'x', expiresInDays: 90, password: '' }, auth);
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ name: 'x', expiresInDays: 90 });
  });

  it('createApiKey reports the error code (max_keys, reauth_required)', async () => {
    stubFetch(409, { error: 'max_keys' });
    expect(await createApiKey({ name: 'x', expiresInDays: 90, password: 'p' }, auth)).toEqual({ ok: false, error: 'max_keys' });
    stubFetch(401, { error: 'reauth_required' });
    expect(await createApiKey({ name: 'x', expiresInDays: 90, password: '' }, auth)).toEqual({ ok: false, error: 'reauth_required' });
  });

  it('revokeApiKey sends DELETE /api/keys/:id with the id encoded', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const f = stubFetch(200, { revoked: true });
    expect(await revokeApiKey('a/b', auth)).toEqual({ ok: true });
    expect(f.mock.calls[0][0]).toBe('/api/keys/a%2Fb');
    expect(f.mock.calls[0][1].method).toBe('DELETE');
  });
});

describe('keyStatus', () => {
  const now = new Date('2026-12-01T00:00:00Z');
  it('is revoked when revokedAt is set, even if it has also expired', () => {
    expect(keyStatus(view({ revokedAt: '2026-11-15T00:00:00Z', expiresAt: '2026-11-20T00:00:00Z' }), now)).toBe('revoked');
  });
  it('is expired when expiresAt has passed, active otherwise', () => {
    expect(keyStatus(view({ expiresAt: '2026-11-30T23:59:59Z' }), now)).toBe('expired');
    expect(keyStatus(view({ expiresAt: '2026-12-01T00:00:01Z' }), now)).toBe('active');
  });
});

describe('mcpApiUrl', () => {
  it('uses the site itself when the API base is the relative /api, and drops a trailing /api otherwise', async () => {
    const { mcpApiUrl } = await import('./apiKeys');
    expect(mcpApiUrl('/api', 'https://fill-score-kappa.vercel.app')).toBe('https://fill-score-kappa.vercel.app');
    expect(mcpApiUrl('http://localhost:3001/api', 'http://localhost:3000')).toBe('http://localhost:3001');
    expect(mcpApiUrl('https://api.example.com/api/', 'https://x')).toBe('https://api.example.com');
  });
});

describe('mcpConfigSnippet', () => {
  it('shows the environment variables of the MCP server with the key and the API address', () => {
    const s = mcpConfigSnippet('fsk_ab12cd34_secret', 'https://api.example.com');
    expect(s).toContain('FILLSCORE_API_URL=https://api.example.com');
    expect(s).toContain('FILLSCORE_API_KEY=fsk_ab12cd34_secret');
    expect(s).toContain('node mcp-server/server.mjs');
  });
});

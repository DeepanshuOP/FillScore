import { describe, it, expect, vi, afterEach } from 'vitest';
import { disconnectExchange, fetchAccountExport, deleteAccount } from './accountActions';

// F-13: the three settings-page actions call the backend routes with the user's bearer token.
const auth = { accessToken: 'tok', refreshAccessToken: vi.fn().mockResolvedValue(null) };

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('account actions', () => {
  it('disconnectExchange sends DELETE /api/onboarding/connections/:exchange', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const fetchMock = stubFetch(200, { success: true, exchange: 'bybit' });
    expect(await disconnectExchange('bybit', auth)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/onboarding/connections/bybit');
    expect(init.method).toBe('DELETE');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer tok');
  });

  it('disconnectExchange reports not_connected on 404', async () => {
    stubFetch(404, { error: 'not_connected' });
    expect(await disconnectExchange('okx', auth)).toEqual({ ok: false, error: 'not_connected' });
  });

  it('fetchAccountExport GETs /api/account/export and returns the JSON text', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const fetchMock = stubFetch(200, '{"trades":[]}');
    expect(await fetchAccountExport(auth)).toEqual({ ok: true, json: '{"trades":[]}' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/account/export');
  });

  it('deleteAccount sends DELETE /api/account with the password as JSON', async () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:3001/api');
    const fetchMock = stubFetch(200, { deleted: true });
    expect(await deleteAccount('Password123!', auth)).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/account');
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ password: 'Password123!' });
  });

  it('deleteAccount surfaces reauth_required', async () => {
    stubFetch(401, { error: 'reauth_required' });
    expect(await deleteAccount('', auth)).toEqual({ ok: false, error: 'reauth_required' });
  });
});

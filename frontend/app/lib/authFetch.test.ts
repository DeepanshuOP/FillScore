import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authFetch } from './authFetch';

describe('authFetch', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  it('adds Authorization header and credentials when accessToken is present', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const auth = {
      accessToken: 'test-token',
      refreshAccessToken: vi.fn().mockResolvedValue('new-token')
    };

    await authFetch('https://api.example.com/data', {}, auth);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    
    // Get the headers that were actually passed to fetch
    const fetchCallArgs = mockFetch.mock.calls[0];
    const fetchOptions = fetchCallArgs[1];
    
    expect(fetchOptions.credentials).toBe('include');
    expect(fetchOptions.headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('sends request without Authorization header when no token is present', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const auth = {
      accessToken: null,
      refreshAccessToken: vi.fn().mockResolvedValue('new-token')
    };

    await authFetch('https://api.example.com/data', {}, auth);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const fetchCallArgs = mockFetch.mock.calls[0];
    const fetchOptions = fetchCallArgs[1];
    
    expect(fetchOptions.credentials).toBe('include');
    expect(fetchOptions.headers.get('Authorization')).toBeNull();
  });

  it('refreshes token on 401 and retries once with new token', async () => {
    // First call returns 401
    mockFetch.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    // Second call returns 200
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const auth = {
      accessToken: 'old-token',
      refreshAccessToken: vi.fn().mockResolvedValue('new-refreshed-token')
    };

    const response = await authFetch('https://api.example.com/data', {}, auth);

    expect(response.status).toBe(200);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const retryCallArgs = mockFetch.mock.calls[1];
    const retryOptions = retryCallArgs[1];
    expect(retryOptions.headers.get('Authorization')).toBe('Bearer new-refreshed-token');
  });

  it('returns 401 and does not retry infinitely if refresh fails', async () => {
    // First call returns 401
    mockFetch.mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));
    // No second call will happen if refresh fails

    const auth = {
      accessToken: 'old-token',
      refreshAccessToken: vi.fn().mockResolvedValue(null) // Refresh fails
    };

    const response = await authFetch('https://api.example.com/data', {}, auth);

    expect(response.status).toBe(401);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1); // Should only call fetch once since refresh failed
  });
});

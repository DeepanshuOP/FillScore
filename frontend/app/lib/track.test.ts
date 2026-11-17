import { describe, it, expect, vi, afterEach } from 'vitest';
import { track } from './track';

// M5: privacy-safe analytics. One anonymous counter per product action; nothing identifies the visitor.
afterEach(() => vi.unstubAllGlobals());

const okFetch = () => vi.fn(async () => new Response(null, { status: 204 }));

describe('track', () => {
  it('posts the event name and nothing else, with no credentials and no Authorization header', () => {
    vi.stubGlobal('navigator', { doNotTrack: null });
    const f = okFetch();
    track('report_download', f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/analytics/event')).toBe(true);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"event":"report_download"}');
    expect(init.credentials).toBe('omit');
    expect(init.keepalive).toBe(true);
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['Content-Type']);
  });

  it('sends nothing when the visitor has Do Not Track on', () => {
    vi.stubGlobal('navigator', { doNotTrack: '1' });
    const f = okFetch();
    track('dashboard_view', f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });

  it('sends nothing when the visitor has Global Privacy Control on', () => {
    vi.stubGlobal('navigator', { doNotTrack: null, globalPrivacyControl: true });
    const f = okFetch();
    track('dashboard_view', f as unknown as typeof fetch);
    expect(f).not.toHaveBeenCalled();
  });

  it('never throws, and never breaks the page, when the request fails', async () => {
    vi.stubGlobal('navigator', { doNotTrack: null });
    const f = vi.fn(async () => { throw new Error('offline'); });
    expect(() => track('replay_open', f as unknown as typeof fetch)).not.toThrow();
    await Promise.resolve();
  });
});

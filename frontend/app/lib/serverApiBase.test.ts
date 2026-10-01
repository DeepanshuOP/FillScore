import { describe, it, expect } from 'vitest';
import { serverApiBase } from './serverApiBase';

describe('serverApiBase', () => {
  it('falls back to the local backend when nothing is set', () => {
    expect(serverApiBase({})).toBe('http://localhost:3001/api');
  });

  it('uses the public API url when it is absolute', () => {
    expect(serverApiBase({ NEXT_PUBLIC_API_URL: 'https://api.example.com/api' })).toBe('https://api.example.com/api');
  });

  it('uses the proxy target when the public API url is a relative path', () => {
    expect(serverApiBase({ NEXT_PUBLIC_API_URL: '/api', BACKEND_PROXY_URL: 'https://fillscore-api.onrender.com' }))
      .toBe('https://fillscore-api.onrender.com/api');
  });

  it('prefers the proxy target over an absolute public url, so the server skips the extra hop', () => {
    expect(serverApiBase({ NEXT_PUBLIC_API_URL: 'https://x.vercel.app/api', BACKEND_PROXY_URL: 'https://api.onrender.com' }))
      .toBe('https://api.onrender.com/api');
  });

  it('drops a trailing slash on the proxy target', () => {
    expect(serverApiBase({ BACKEND_PROXY_URL: 'https://api.onrender.com/' })).toBe('https://api.onrender.com/api');
  });
});

import { describe, it, expect } from 'vitest';
import { apiBase } from './apiBase';

// F-16: one helper for every browser-side API URL. Unset or blank NEXT_PUBLIC_API_URL must give
// the relative `/api` (proxied to the backend by next.config rewrites), never `undefined/...`.
describe('apiBase', () => {
  it('falls back to /api when NEXT_PUBLIC_API_URL is unset', () => {
    expect(apiBase({})).toBe('/api');
    expect(`${apiBase({})}/audit/trades`).toBe('/api/audit/trades');
  });

  it('falls back to /api when NEXT_PUBLIC_API_URL is blank', () => {
    expect(apiBase({ NEXT_PUBLIC_API_URL: '' })).toBe('/api');
    expect(apiBase({ NEXT_PUBLIC_API_URL: '   ' })).toBe('/api');
  });

  it('uses NEXT_PUBLIC_API_URL when set, without a trailing slash', () => {
    expect(apiBase({ NEXT_PUBLIC_API_URL: 'http://localhost:3001/api' })).toBe('http://localhost:3001/api');
    expect(apiBase({ NEXT_PUBLIC_API_URL: 'https://api.example.com/api/' })).toBe('https://api.example.com/api');
  });

  it('reads process.env by default', () => {
    const before = process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_API_URL;
    try {
      expect(apiBase()).toBe('/api');
    } finally {
      if (before !== undefined) process.env.NEXT_PUBLIC_API_URL = before;
    }
  });
});

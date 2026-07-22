import { describe, it, expect } from 'vitest';
import { extractOAuthToken } from './OAuthRedirectHandler';

describe('extractOAuthToken', () => {
  it('extracts token and cleans URL when accessToken is present', () => {
    const result = extractOAuthToken('?accessToken=test-token123', '/');
    expect(result.token).toBe('test-token123');
    expect(result.cleanUrl).toBe('/');
  });

  it('preserves other query parameters', () => {
    const result = extractOAuthToken('?foo=bar&accessToken=token456&baz=qux', '/dashboard');
    expect(result.token).toBe('token456');
    // The order might change depending on URLSearchParams implementation but should have foo and baz
    expect(result.cleanUrl).toContain('foo=bar');
    expect(result.cleanUrl).toContain('baz=qux');
    expect(result.cleanUrl).not.toContain('accessToken');
  });

  it('returns null token and original URL when accessToken is not present', () => {
    const result = extractOAuthToken('?foo=bar', '/dashboard');
    expect(result.token).toBeNull();
    expect(result.cleanUrl).toBe('/dashboard?foo=bar');
  });

  it('handles empty search string', () => {
    const result = extractOAuthToken('', '/');
    expect(result.token).toBeNull();
    expect(result.cleanUrl).toBe('/');
  });
});

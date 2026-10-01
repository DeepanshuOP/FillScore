import { describe, it, expect } from 'vitest';
import { extractOAuthCode } from './OAuthRedirectHandler';

describe('extractOAuthCode', () => {
  it('extracts the code and cleans the URL when oauthCode is present', () => {
    const result = extractOAuthCode('?oauthCode=abc123', '/');
    expect(result.code).toBe('abc123');
    expect(result.cleanUrl).toBe('/');
  });

  it('preserves other query parameters', () => {
    const result = extractOAuthCode('?foo=bar&oauthCode=code456&baz=qux', '/dashboard');
    expect(result.code).toBe('code456');
    expect(result.cleanUrl).toContain('foo=bar');
    expect(result.cleanUrl).toContain('baz=qux');
    expect(result.cleanUrl).not.toContain('oauthCode');
  });

  it('returns a null code and the original URL when oauthCode is not present', () => {
    const result = extractOAuthCode('?foo=bar', '/dashboard');
    expect(result.code).toBeNull();
    expect(result.cleanUrl).toBe('/dashboard?foo=bar');
  });

  it('handles an empty search string', () => {
    const result = extractOAuthCode('', '/');
    expect(result.code).toBeNull();
    expect(result.cleanUrl).toBe('/');
  });

  it('no longer reads a token from the URL', () => {
    const result = extractOAuthCode('?accessToken=should-be-ignored', '/');
    expect(result.code).toBeNull();
  });
});

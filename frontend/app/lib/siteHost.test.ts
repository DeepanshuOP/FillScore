import { describe, it, expect } from 'vitest';
import { siteHost } from './siteHost';

describe('siteHost', () => {
  it('returns the host of NEXT_PUBLIC_SITE_URL', () => {
    expect(siteHost({ NEXT_PUBLIC_SITE_URL: 'https://fill-score-kappa.vercel.app/' })).toBe('fill-score-kappa.vercel.app');
  });
  it('is empty when unset or invalid', () => {
    expect(siteHost({})).toBe('');
    expect(siteHost({ NEXT_PUBLIC_SITE_URL: 'not a url' })).toBe('');
  });
});

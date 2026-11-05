import { describe, it, expect } from 'vitest';
import { navHref, venueComparisonNote, lookbackLabel } from './navLinks';

describe('navHref', () => {
  it('signed in, own data: no userId param', () => {
    expect(navHref('/dashboard', undefined, true)).toBe('/dashboard');
    expect(navHref('/trades', undefined, true)).toBe('/trades');
    expect(navHref('/analytics', undefined, true)).toBe('/analytics');
  });
  it('signed in, sample view: demo id plus explicit sample=1', () => {
    expect(navHref('/trades', 'demo-moderate', true)).toBe('/trades?userId=demo-moderate&sample=1');
  });
  it('signed out: today\'s demo links', () => {
    expect(navHref('/dashboard', 'demo-disciplined', false)).toBe('/dashboard?userId=demo-disciplined');
    expect(navHref('/dashboard', undefined, false)).toBe('/dashboard');
  });
  it('home is always /', () => expect(navHref('/', 'demo-x', true)).toBe('/'));
});

describe('copy by auth state', () => {
  it('signed-in user never sees "authenticated version"', () => {
    expect(venueComparisonNote(true, false)).toBe('Connect another exchange to compare venues.');
    expect(venueComparisonNote(true, true)).not.toMatch(/authenticated/i);
    expect(venueComparisonNote(false, true)).not.toMatch(/authenticated/i);
  });
  it('lookback label', () => {
    expect(lookbackLabel(30)).toBe('the last 30 days');
    expect(lookbackLabel(365)).toBe('the last 365 days');
    expect(lookbackLabel(3650)).toBe('all available history');
    expect(lookbackLabel(null)).toBe('the selected period');
  });
});

import { describe, it, expect } from 'vitest';
import { buildDownloadUrl } from './downloads';

describe('buildDownloadUrl', () => {
  it('appends the token as dl', () => {
    expect(buildDownloadUrl('http://api.test/api', '/audit/report', { dl: 'abc' })).toBe(
      'http://api.test/api/audit/report?dl=abc'
    );
  });

  it('keeps extra filters and encodes them', () => {
    const url = buildDownloadUrl('http://api.test/api', '/audit/trades/export', { dl: 't', exchange: 'bybit', symbol: 'BTC USDT' });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/audit/trades/export');
    expect(parsed.searchParams.get('dl')).toBe('t');
    expect(parsed.searchParams.get('exchange')).toBe('bybit');
    expect(parsed.searchParams.get('symbol')).toBe('BTC USDT');
  });

  it('drops empty values', () => {
    const url = buildDownloadUrl('http://api.test/api', '/audit/report', { userId: '', dl: 'x' });
    expect(url).toBe('http://api.test/api/audit/report?dl=x');
  });

  it('works for demo downloads that carry a userId instead of a token', () => {
    expect(buildDownloadUrl('http://api.test/api', '/audit/report', { userId: 'demo-okx' })).toBe(
      'http://api.test/api/audit/report?userId=demo-okx'
    );
  });
});

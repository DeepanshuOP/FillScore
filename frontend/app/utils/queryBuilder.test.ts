import { describe, it, expect } from 'vitest';
import { buildQuery } from './queryBuilder';

describe('buildQuery', () => {
  it('should build demo query with extra params', () => {
    expect(buildQuery('demo', 'demo-disciplined', { limit: '10000' }))
      .toBe('?userId=demo-disciplined&limit=10000');
  });

  it('should build real query with extra params', () => {
    expect(buildQuery('real', null, { limit: '10000' }))
      .toBe('?limit=10000');
  });

  it('should build real query with no extra params', () => {
    expect(buildQuery('real', null))
      .toBe('');
  });

  it('should build demo query with no extra params', () => {
    expect(buildQuery('demo', 'demo-disciplined'))
      .toBe('?userId=demo-disciplined');
  });
});

import { describe, it, expect } from 'vitest';
import { frontendCommit } from './buildInfo';

describe('frontendCommit', () => {
  it('returns VERCEL_GIT_COMMIT_SHA', () => {
    expect(frontendCommit({ VERCEL_GIT_COMMIT_SHA: '30d08b1abc' })).toBe('30d08b1abc');
  });
  it('falls back to unknown', () => {
    expect(frontendCommit({})).toBe('unknown');
  });
});

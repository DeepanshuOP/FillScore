import { describe, it, expect } from 'vitest';
import { resolveDashboardMode } from './dashboardMode';

describe('resolveDashboardMode', () => {
  it('urlUserId=demo-disciplined, no token, no storage -> demo', () => {
    expect(resolveDashboardMode({ urlUserId: 'demo-disciplined', storageUserId: null, accessToken: null })).toBe('demo');
  });

  it('urlUserId=demo-disciplined, WITH token -> demo (explicit URL intent wins)', () => {
    expect(resolveDashboardMode({ urlUserId: 'demo-disciplined', storageUserId: null, accessToken: 'fake-token' })).toBe('demo');
  });

  it('no urlUserId, WITH token, storageUserId=demo-disciplined -> real (stale storage must not hijack)', () => {
    expect(resolveDashboardMode({ urlUserId: null, storageUserId: 'demo-disciplined', accessToken: 'fake-token' })).toBe('real');
  });

  it('no urlUserId, WITH token, no storage -> real', () => {
    expect(resolveDashboardMode({ urlUserId: null, storageUserId: null, accessToken: 'fake-token' })).toBe('real');
  });

  it('no urlUserId, NO token, storageUserId=demo-disciplined -> demo (guest fallback works)', () => {
    expect(resolveDashboardMode({ urlUserId: null, storageUserId: 'demo-disciplined', accessToken: null })).toBe('demo');
  });

  it('no urlUserId, no token, no storage -> redirect', () => {
    expect(resolveDashboardMode({ urlUserId: null, storageUserId: null, accessToken: null })).toBe('redirect');
  });

  it('urlUserId=some-real-id, WITH token -> real (URL id ignored, token wins)', () => {
    expect(resolveDashboardMode({ urlUserId: 'some-real-id', storageUserId: null, accessToken: 'fake-token' })).toBe('real');
  });
  
  it('urlUserId=some-real-id, NO token -> redirect', () => {
    expect(resolveDashboardMode({ urlUserId: 'some-real-id', storageUserId: null, accessToken: null })).toBe('redirect');
  });

  it('urlUserId=DEMO-disciplined or demo-fake (not in allowlist), no token -> redirect (strict allowlist)', () => {
    expect(resolveDashboardMode({ urlUserId: 'DEMO-disciplined', storageUserId: null, accessToken: null })).toBe('redirect');
    expect(resolveDashboardMode({ urlUserId: 'demo-fake', storageUserId: null, accessToken: null })).toBe('redirect');
  });
});

import { describe, it, expect } from 'vitest';
import { resolveDashboardMode } from './dashboardMode';
const REMOVED_DEMO_IDS = ['demo-bybit', 'demo-okx', 'demo-multi'];   // removed 2026-11-13: unknown ids now

describe('resolveDashboardMode', () => {
  it('urlUserId=demo-disciplined, no token, no storage -> demo', () => {
    expect(resolveDashboardMode({ urlUserId: 'demo-disciplined', storageUserId: null, accessToken: null })).toBe('demo');
  });

  it('urlUserId=demo-disciplined, WITH token, no sample flag -> real (a signed-in user never lands on demo by accident)', () => {
    expect(resolveDashboardMode({ urlUserId: 'demo-disciplined', storageUserId: null, accessToken: 'fake-token' })).toBe('real');
  });

  it('urlUserId=demo-disciplined, WITH token, sample=true -> demo (explicit opt-in)', () => {
    expect(resolveDashboardMode({ urlUserId: 'demo-disciplined', storageUserId: null, accessToken: 'fake-token', sample: true })).toBe('demo');
  });

  it('sample=true without a demo id, WITH token -> real', () => {
    expect(resolveDashboardMode({ urlUserId: null, storageUserId: null, accessToken: 'fake-token', sample: true })).toBe('real');
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

  it.each(REMOVED_DEMO_IDS)('guest with removed demo id %s (url or storage) -> redirect', (id) => {
    expect(resolveDashboardMode({ urlUserId: id, storageUserId: null, accessToken: null })).toBe('redirect');
    expect(resolveDashboardMode({ urlUserId: null, storageUserId: id, accessToken: null })).toBe('redirect');
  });

  it('urlUserId=DEMO-disciplined or demo-fake (not in allowlist), no token -> redirect (strict allowlist)', () => {
    expect(resolveDashboardMode({ urlUserId: 'DEMO-disciplined', storageUserId: null, accessToken: null })).toBe('redirect');
    expect(resolveDashboardMode({ urlUserId: 'demo-fake', storageUserId: null, accessToken: null })).toBe('redirect');
  });
});

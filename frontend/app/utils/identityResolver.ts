import { resolveDashboardMode, isAllowedDemoId } from './dashboardMode';

export interface IdentityState {
  mode: 'demo' | 'real' | 'redirect';
  effectiveUserId: string | null;
  shouldClearStorage: boolean;
  shouldSetStorage: boolean;
}

export function resolveIdentityState(
  urlUserId: string | null,
  storageUserId: string | null,
  accessToken: string | null,
  sample = false
): IdentityState {
  const mode = resolveDashboardMode({ urlUserId, storageUserId, accessToken, sample });
  
  if (mode === 'redirect') {
    return {
      mode: 'redirect',
      effectiveUserId: null,
      shouldClearStorage: false,
      shouldSetStorage: false
    };
  }
  
  if (mode === 'demo') {
    // Only allowed ids may become effective (and be persisted); skip hidden/unknown ones.
    const effectiveUserId = [urlUserId, storageUserId].find(isAllowedDemoId) ?? 'demo-disciplined';
    return {
      mode: 'demo',
      effectiveUserId,
      shouldClearStorage: false,
      shouldSetStorage: true
    };
  }
  
  // mode === 'real'
  return {
    mode: 'real',
    effectiveUserId: null,
    shouldClearStorage: true,
    shouldSetStorage: false
  };
}

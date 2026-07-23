import { resolveDashboardMode } from './dashboardMode';

export interface IdentityState {
  mode: 'demo' | 'real' | 'redirect';
  effectiveUserId: string | null;
  shouldClearStorage: boolean;
  shouldSetStorage: boolean;
}

export function resolveIdentityState(
  urlUserId: string | null,
  storageUserId: string | null,
  accessToken: string | null
): IdentityState {
  const mode = resolveDashboardMode({ urlUserId, storageUserId, accessToken });
  
  if (mode === 'redirect') {
    return {
      mode: 'redirect',
      effectiveUserId: null,
      shouldClearStorage: false,
      shouldSetStorage: false
    };
  }
  
  if (mode === 'demo') {
    const effectiveUserId = urlUserId || storageUserId || 'demo-disciplined';
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

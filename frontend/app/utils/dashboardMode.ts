const DEMO_ALLOWLIST = new Set([
  'demo-disciplined',
  'demo-moderate',
  'demo-aggressive',
  'demo-bybit',
  'demo-okx',
  'demo-multi'
]);

export function resolveDashboardMode({
  urlUserId,
  storageUserId,
  accessToken,
  sample = false
}: {
  urlUserId: string | null;
  storageUserId: string | null;
  accessToken: string | null;
  /** `?sample=1`: a signed-in user explicitly opted into the sample dashboard. */
  sample?: boolean;
}): 'demo' | 'real' | 'redirect' {
  // A signed-in user sees their own data unless they opted into the sample view.
  if (urlUserId && DEMO_ALLOWLIST.has(urlUserId) && (!accessToken || sample)) {
    return 'demo';
  }
  if (accessToken) {
    return 'real';
  }
  if (storageUserId && DEMO_ALLOWLIST.has(storageUserId)) {
    return 'demo';
  }
  return 'redirect';
}

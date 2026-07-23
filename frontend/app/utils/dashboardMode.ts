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
  accessToken
}: {
  urlUserId: string | null;
  storageUserId: string | null;
  accessToken: string | null;
}): 'demo' | 'real' | 'redirect' {
  if (urlUserId && DEMO_ALLOWLIST.has(urlUserId)) {
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

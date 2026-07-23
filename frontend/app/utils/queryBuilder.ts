export function buildQuery(mode: 'demo' | 'real', userId: string | null, extraParams?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (mode === 'demo' && userId) {
    params.set('userId', userId);
  }
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      params.set(key, value);
    }
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

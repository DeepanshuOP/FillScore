/** Host of the configured public site (NEXT_PUBLIC_SITE_URL); '' when unset so no unowned domain is printed. */
export function siteHost(env: Record<string, string | undefined> = process.env): string {
  const raw = env.NEXT_PUBLIC_SITE_URL;
  if (!raw) return '';
  try { return new URL(raw).host; } catch { return ''; }
}

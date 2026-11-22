/**
 * Permanent (308) redirects from every address that existed before IA v4 to its new home under /app (sixth order of
 * 2026-11-23, step 1). Next forwards the rest of the query string to the destination (userId, sample, symbol, order, ...);
 * a destination's own query (`?tab=patterns`) is merged with it. The old `view` parameter stays in the forwarded query and is
 * ignored by the new pages. A plain module (not TypeScript) so next.config.mjs can import it; tested in
 * app/utils/legacyRedirects.test.ts and, against a running server, in e2e/legacy-redirects.spec.ts.
 */
export const DASHBOARD_VIEWS = ['overview', 'orders', 'rules', 'rankings', 'council', 'evidence']

export const legacyRedirects = [
  // /dashboard?view=<section> -> /app/<section>; the section rows come first so they win over the plain /dashboard row
  ...DASHBOARD_VIEWS.map((view) => ({
    source: '/dashboard',
    has: [{ type: 'query', key: 'view', value: view }],
    destination: `/app/${view}`,
    permanent: true,
  })),
  // /dashboard with no view (or one that never existed) -> the app's Home
  { source: '/dashboard', destination: '/app', permanent: true },
  { source: '/trades', destination: '/app/fills', permanent: true },
  { source: '/analytics', destination: '/app/fills?tab=patterns', permanent: true },
  { source: '/check', destination: '/app/check', permanent: true },
  { source: '/settings', destination: '/app/settings', permanent: true },
  { source: '/onboarding', destination: '/app/connect', permanent: true },
]

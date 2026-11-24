/**
 * Permanent (308) redirects from every address that existed before to its home today. First round (IA v4, 2026-11-23): the old
 * dashboard, fills, check and settings addresses to /app/*. Second round (design v5, 2026-11-24, decision D1): the five renamed
 * sections. Every row points straight at the FINAL route, so no address redirects through another one (a test checks there are no
 * chains). Next forwards the rest of the query string to the destination (userId, sample, symbol, order, ...); a destination's own
 * query is merged with it. The old `view` parameter stays in the forwarded query and is ignored by the pages. A plain module (not
 * TypeScript) so next.config.mjs can import it; tested in app/utils/legacyRedirects.test.ts and, against a running server, in
 * e2e/legacy-redirects.spec.ts.
 *
 * Renamed in design v5:  overview -> costs, rules -> flagged, rankings -> compare, council -> review, evidence -> reports.
 */
export const DASHBOARD_VIEWS = ['overview', 'orders', 'rules', 'rankings', 'council', 'evidence']

/** The final route segment of each section name that has ever been a /dashboard view or an /app page. */
export const SECTION_ROUTE = { overview: 'costs', orders: 'orders', rules: 'flagged', rankings: 'compare', council: 'review', evidence: 'reports' }

export const legacyRedirects = [
  // /dashboard?view=<section> -> the final /app/<route>; the section rows come first so they win over the plain /dashboard row
  ...DASHBOARD_VIEWS.map((view) => ({
    source: '/dashboard',
    has: [{ type: 'query', key: 'view', value: view }],
    destination: `/app/${SECTION_ROUTE[view]}`,
    permanent: true,
  })),
  // /dashboard with no view (or one that never existed) -> the app's Home
  { source: '/dashboard', destination: '/app', permanent: true },
  // design v5: the five renamed /app pages (the query is kept)
  ...Object.entries(SECTION_ROUTE).filter(([from, to]) => from !== to).map(([from, to]) => ({
    source: `/app/${from}`,
    destination: `/app/${to}`,
    permanent: true,
  })),
  { source: '/trades', destination: '/app/fills', permanent: true },
  // the Patterns tab is gone (design v5, not-computed policy): its old address opens the fills
  { source: '/analytics', destination: '/app/fills', permanent: true },
  { source: '/check', destination: '/app/check', permanent: true },
  { source: '/settings', destination: '/app/settings', permanent: true },
  { source: '/onboarding', destination: '/app/connect', permanent: true },
]

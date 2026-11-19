/**
 * Whether the design lab (/design-lab) may be served. It is a working room for the M8 design choice, not a product page:
 *  - off in any production process (NODE_ENV=production), unless DESIGN_LAB is exactly "1" (a local production build
 *    run for the screenshots; the e2e server leaves it unset, so a test proves the 404);
 *  - always off on a deployed production site (VERCEL_ENV=production), whatever DESIGN_LAB says;
 *  - on in development and in tests.
 */
export function designLabEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV === 'production') return false
  if (env.NODE_ENV !== 'production') return true
  return env.DESIGN_LAB === '1'
}

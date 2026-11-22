/** The app's sections and accounts (IA v4: marketing site and app, 2026-11-23). Pure: tested in nav.test.ts. */
import { navHref } from '../../utils/navLinks'

/** The nine nouns of the sidebar, in order, with the one-line gloss shown in ⌘K and the phone's More sheet (PROPOSAL §3). */
export const SECTIONS = [
  { id: 'home', label: 'Home', path: '/app', gloss: 'Ask about this account, and its key figures' },
  { id: 'overview', label: 'Overview', path: '/app/overview', gloss: 'The five chapters of the audit' },
  { id: 'orders', label: 'Orders', path: '/app/orders', gloss: 'Every order, and its receipt' },
  { id: 'rules', label: 'Rules', path: '/app/rules', gloss: 'Orders that broke a stated rule' },
  { id: 'rankings', label: 'Rankings', path: '/app/rankings', gloss: 'Groups of orders compared, with noise' },
  { id: 'council', label: 'Council', path: '/app/council', gloss: 'A language-model review of the audit' },
  { id: 'evidence', label: 'Evidence', path: '/app/evidence', gloss: 'Signed packs and the record behind the grade' },
  { id: 'fills', label: 'Fills', path: '/app/fills', gloss: 'Each fill and its patterns' },
  { id: 'check', label: 'Check a broker file', path: '/app/check', gloss: 'Compare a broker export with public prices' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']
/** The sections that read the account's audit (everything but the two tools and Fills, which load their own data). */
export type View = Exclude<SectionId, 'fills' | 'check'>
export const VIEWS = ['home', 'overview', 'orders', 'rules', 'rankings', 'council', 'evidence'] as const
export const VIEW_LABEL: Record<SectionId, string> = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label])) as Record<SectionId, string>

/** The phone's bottom bar; every other section is in the More sheet. */
export const PHONE_BAR: readonly SectionId[] = ['home', 'overview', 'orders']

// Design v3.1 fixes A3: the labels state what the generated trader does (utils/demoProfiles.ts), not a quality.
export const DEMO_ACCOUNTS = [
  { id: 'demo-disciplined', label: 'Demo: limit orders, daytime' },
  { id: 'demo-moderate', label: 'Demo: mixed orders, mixed hours' },
  { id: 'demo-aggressive', label: 'Demo: market orders, night' },
] as const

/** The section a pathname belongs to ("/app/orders" -> orders; "/app" -> home); null outside the sidebar's sections. */
export function sectionOfPath(pathname: string): SectionId | null {
  const p = pathname.replace(/\/+$/, '') || '/'
  return SECTIONS.find((s) => s.path === p)?.id ?? null
}

/**
 * Link to a section. A demo account carries its id (and `sample=1` when signed in); a signed-in user's own data carries none.
 * `extra` adds parameters (an order to open, the Fills tab).
 */
export function viewHref(view: SectionId, userId: string | null | undefined, signedIn: boolean, extra: Record<string, string> = {}): string {
  const path = SECTIONS.find((s) => s.id === view)!.path
  const base = navHref(path, userId ?? undefined, signedIn)
  const [pathOnly, query = ''] = base.split('?')
  const params = new URLSearchParams(query)
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  const q = params.toString()
  return q ? `${pathOnly}?${q}` : pathOnly
}

/** Label of the account in the switcher. */
export function accountLabel(userId: string | null | undefined): string {
  return DEMO_ACCOUNTS.find((a) => a.id === userId)?.label ?? 'Your account'
}

/** True when a string typed in the command menu looks like an order id (the demo ids, or an exchange's numeric id). */
export function looksLikeOrderId(s: string): boolean {
  const t = s.trim()
  return /^ord-[a-z]+-[A-Z0-9]+-\d+$/.test(t) || /^\d{4,}$/.test(t)
}

/** The app's sections and accounts (IA v4: marketing site and app, 2026-11-23). Pure: tested in nav.test.ts. */
import { navHref } from '../../utils/navLinks'

/**
 * The nine nouns of the sidebar (design v5, PROPOSAL §3.1: Home, Costs, Orders, Fills; Review: Flagged orders, Comparisons,
 * AI review; Tools: Reports, Check an exchange export), in order, with the group each belongs to and the one-line gloss shown in
 * ⌘K and the phone's More sheet. Group titles: `GROUP_TITLE` (sentence case, 12 px in the sidebar).
 */
export const SECTIONS = [
  { id: 'home', label: 'Home', path: '/app', group: 'main', gloss: 'Your account at a glance' },
  { id: 'costs', label: 'Costs', path: '/app/costs', group: 'main', gloss: 'What the orders cost, and where the cost came from' },
  { id: 'orders', label: 'Orders', path: '/app/orders', group: 'main', gloss: 'Every order, what it cost, and its receipt' },
  { id: 'fills', label: 'Fills', path: '/app/fills', group: 'main', gloss: 'Each execution, with its price and fee' },
  { id: 'flagged', label: 'Flagged orders', path: '/app/flagged', group: 'review', gloss: "Orders that met one of FillScore's fixed rules" },
  { id: 'compare', label: 'Comparisons', path: '/app/compare', group: 'review', gloss: 'Median execution cost per group, with an interval' },
  { id: 'review', label: 'AI review', path: '/app/review', group: 'review', gloss: 'A language model explains the measured figures' },
  { id: 'reports', label: 'Reports', path: '/app/reports', group: 'tools', gloss: 'Signed reports you can verify without us' },
  { id: 'check', label: 'Check an exchange export', path: '/app/check', group: 'tools', gloss: "Compare an exchange's export with public prices" },
] as const
export type SectionGroup = (typeof SECTIONS)[number]['group']
export const GROUP_TITLE: Record<SectionGroup, string | null> = { main: null, review: 'Review', tools: 'Tools' }
export type SectionId = (typeof SECTIONS)[number]['id']
/** The sections that read the account's audit (everything but the two tools and Fills, which load their own data). */
export type View = Exclude<SectionId, 'fills' | 'check'>
export const VIEWS = ['home', 'costs', 'orders', 'flagged', 'compare', 'review', 'reports'] as const
export const VIEW_LABEL: Record<SectionId, string> = Object.fromEntries(SECTIONS.map((s) => [s.id, s.label])) as Record<SectionId, string>

/** The phone's bottom bar; every other section is in the More sheet. */
export const PHONE_BAR: readonly SectionId[] = ['home', 'costs', 'orders']

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

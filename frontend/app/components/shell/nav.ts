/** The app's sections and accounts (design v2 shell). Pure: tested in nav.test.ts. */
import { navHref } from '../../utils/navLinks'

export const VIEWS = ['overview', 'orders', 'rules', 'rankings', 'council', 'evidence'] as const
export type View = (typeof VIEWS)[number]
export const VIEW_LABEL: Record<View, string> = {
  overview: 'Overview', orders: 'Orders', rules: 'Rules', rankings: 'Rankings', council: 'Council', evidence: 'Evidence',
}

export const DEMO_ACCOUNTS = [
  { id: 'demo-disciplined', label: 'Disciplined demo' },
  { id: 'demo-moderate', label: 'Moderate demo' },
  { id: 'demo-aggressive', label: 'Aggressive demo' },
] as const

export function parseView(v: string | null | undefined): View {
  return (VIEWS as readonly string[]).includes(v ?? '') ? (v as View) : 'overview'
}

/** Link to a dashboard section. A demo account carries its id (and `sample=1` when signed in); the overview has no `view`. */
export function viewHref(view: View, userId: string | null | undefined, signedIn: boolean, extra: Record<string, string> = {}): string {
  const base = navHref('/dashboard', userId ?? undefined, signedIn)
  const params = new URLSearchParams(base.includes('?') ? base.split('?')[1] : '')
  if (view !== 'overview') params.set('view', view)
  for (const [k, v] of Object.entries(extra)) params.set(k, v)
  const q = params.toString()
  return q ? `/dashboard?${q}` : '/dashboard'
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

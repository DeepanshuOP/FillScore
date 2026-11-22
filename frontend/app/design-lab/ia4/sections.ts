/** The app's sections in the proposed sidebar (docs/design/IA-v4/PROPOSAL.md section 1), with where each lives today. A plain
 *  module, so the server page and the client shell can both read it. */
export const SECTIONS = [
  { id: 'home', label: 'Home', today: '/dashboard (Ask was under ?view=council)', proposed: '/app' },
  { id: 'overview', label: 'Overview', today: '/dashboard?view=overview', proposed: '/app/overview' },
  { id: 'orders', label: 'Orders', today: '/dashboard?view=orders', proposed: '/app/orders' },
  { id: 'rules', label: 'Rules', today: '/dashboard?view=rules', proposed: '/app/rules' },
  { id: 'rankings', label: 'Rankings', today: '/dashboard?view=rankings', proposed: '/app/rankings' },
  { id: 'council', label: 'Council', today: '/dashboard?view=council', proposed: '/app/council' },
  { id: 'evidence', label: 'Evidence', today: '/dashboard?view=evidence', proposed: '/app/evidence' },
  { id: 'fills', label: 'Fills', today: '/trades and /analytics', proposed: '/app/fills' },
  { id: 'check', label: 'Check a broker file', today: '/check', proposed: '/app/check' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']

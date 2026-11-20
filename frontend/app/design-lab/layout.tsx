import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { designLabEnabled } from './enabled'

// Design v2 prototype round (2026-11-20): two variants of the landing hero and of the dashboard overview, built from
// the production components and fixtures. Dev only: 404 in production (designLabEnabled), noindex.
export const metadata: Metadata = { title: 'Design lab', robots: { index: false, follow: false } }
// Evaluated per request: a build must not bake the 404 (or the page) in.
export const dynamic = 'force-dynamic'

export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (!designLabEnabled()) notFound()
  return <div data-ui-lab className="min-h-dvh bg-ui-surface">{children}</div>
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Hanken_Grotesk, Schibsted_Grotesk } from 'next/font/google'
import { designLabEnabled } from './enabled'
import './lab-tokens.css'
import './lab.css'

// The two candidate families that did not win (M8, question 2; Deepanshu chose IBM Plex Sans on 2026-11-20). They are
// loaded by lab routes only. IBM Plex Sans and Mono come from the root layout, as in the product.
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' })
const schibsted = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted', display: 'swap' })

export const metadata: Metadata = { title: 'Design lab', robots: { index: false, follow: false } }
// Evaluated per request: a build must not bake the 404 (or the page) in.
export const dynamic = 'force-dynamic'

export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (!designLabEnabled()) notFound()
  return <div data-ui-lab className={`${hanken.variable} ${schibsted.variable}`}>{children}</div>
}

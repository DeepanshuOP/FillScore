import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Hanken_Grotesk, IBM_Plex_Mono, IBM_Plex_Sans, Schibsted_Grotesk } from 'next/font/google'
import { designLabEnabled } from './enabled'
import './lab.css'

// Candidate families for the type choice (M8, question 2). Each ships a true tabular-figure feature; the specimen page
// measures it. Fonts are self-hosted by next/font at build time and load only for lab routes.
const plexSans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans', display: 'swap' })
const hanken = Hanken_Grotesk({ subsets: ['latin'], variable: '--font-hanken', display: 'swap' })
const schibsted = Schibsted_Grotesk({ subsets: ['latin'], variable: '--font-schibsted', display: 'swap' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono', display: 'swap' })

export const metadata: Metadata = { title: 'Design lab', robots: { index: false, follow: false } }
// Evaluated per request: a build must not bake the 404 (or the page) in.
export const dynamic = 'force-dynamic'

export default function LabLayout({ children }: { children: React.ReactNode }) {
  if (!designLabEnabled()) notFound()
  return <div data-ui-lab className={`${plexSans.variable} ${hanken.variable} ${schibsted.variable} ${plexMono.variable}`}>{children}</div>
}

import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import './globals.css'
import { AuthProvider } from './context/AuthContext'
import OAuthRedirectHandler from './components/OAuthRedirectHandler'
import SiteFooter from './components/SiteFooter'

// IBM Plex Sans for text and figures (equal-width default figures, measured in the design lab: 0.00 px spread);
// IBM Plex Mono only for hashes, ids and the key fingerprint. Both are SIL OFL 1.1, self-hosted at build time.
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FillScore — Execution Intelligence',
  description: 'Transaction cost analysis for retail crypto traders, graded against public Binance market data.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${plexSans.variable} ${plexMono.variable}`}>
      <body suppressHydrationWarning>
        <AuthProvider>
          <OAuthRedirectHandler />
          {children}
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  )
}

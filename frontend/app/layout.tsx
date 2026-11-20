import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import { AuthProvider } from './context/AuthContext'
import OAuthRedirectHandler from './components/OAuthRedirectHandler'
import { Providers } from './providers'

// Design v2: Geist Sans for text and figures (tabular figures on), Geist Mono only for ids, hashes and the key
// fingerprint. Both SIL OFL 1.1, served from the app by the `geist` package (next/font underneath).
export const metadata: Metadata = {
  title: 'FillScore: an audit of past crypto executions',
  description: 'FillScore grades how past crypto orders were executed, against the public market prints of the same seconds. It audits the past; it never advises.',
}

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: dark)', color: '#0B1015' }, { media: '(prefers-color-scheme: light)', color: '#F6F7F9' }],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body suppressHydrationWarning>
        <Providers>
          <AuthProvider>
            <OAuthRedirectHandler />
            {children}
          </AuthProvider>
        </Providers>
      </body>
    </html>
  )
}

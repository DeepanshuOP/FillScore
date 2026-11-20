import type { Metadata, Viewport } from 'next'
import './globals.css'
import { fontVariables } from './fonts'
import { AuthProvider } from './context/AuthContext'
import OAuthRedirectHandler from './components/OAuthRedirectHandler'
import { Providers } from './providers'

// Design v3 "Tape & Receipt": Cabinet Grotesk for text and figures, Departure Mono for the tape, receipts, ledger figures,
// ids and labels (app/fonts.ts).
export const metadata: Metadata = {
  title: 'FillScore: an audit of past crypto executions',
  description: 'FillScore grades how past crypto orders were executed, against the public market prints of the same seconds. It audits the past; it never advises.',
}

export const viewport: Viewport = {
  themeColor: '#F3F2EE',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={fontVariables}>
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

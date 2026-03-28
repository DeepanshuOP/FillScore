import type { Metadata } from 'next'
import { Playfair_Display, Inter, JetBrains_Mono } 
  from 'next/font/google'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  variable: '--font-playfair',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FillScore — Execution Intelligence',
  description: 'Institutional-grade transaction cost analysis for retail crypto traders.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html 
      lang="en" 
      data-theme="dark"
      suppressHydrationWarning
      className={`
        ${playfair.variable} 
        ${inter.variable} 
        ${jetbrainsMono.variable}
      `}
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}

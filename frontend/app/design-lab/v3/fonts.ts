import localFont from 'next/font/local'

// Design v3 lab only (2026-11-20). Candidates for the specimen; the chosen pair per direction is in each tokens page.
// Sources: Cabinet Grotesk and Clash Grotesk from Fontshare (Indian Type Foundry), Departure Mono (Helena Zhang, OFL,
// GitHub release 1.500), Martian Mono, Fragment Mono and Archivo from Google Fonts. Downloaded 2026-11-20.

// Cabinet Grotesk and Departure Mono are production fonts now (app/fonts.ts, design v3 chosen 2026-11-20).
export { cabinet, departure } from '../../fonts'
import { cabinet, departure } from '../../fonts'

export const clash = localFont({
  src: [
    { path: './fonts/clash-grotesk-400.woff2', weight: '400' },
    { path: './fonts/clash-grotesk-500.woff2', weight: '500' },
    { path: './fonts/clash-grotesk-600.woff2', weight: '600' },
    { path: './fonts/clash-grotesk-700.woff2', weight: '700' },
  ],
  variable: '--f-clash',
  display: 'swap',
})

export const martian = localFont({ src: './fonts/martian-mono-var.woff2', variable: '--f-martian', weight: '100 800', display: 'swap' })
export const fragment = localFont({ src: './fonts/fragment-mono-400.woff2', variable: '--f-fragment', display: 'swap' })
export const archivo = localFont({ src: './fonts/archivo-var.woff2', variable: '--f-archivo', weight: '100 900', display: 'swap' })

export const fontVars = [cabinet, clash, departure, martian, fragment, archivo].map((f) => f.variable).join(' ')

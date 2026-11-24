import localFont from 'next/font/local'

/**
 * Design v3 "Tape & Receipt" type (chosen by Deepanshu 2026-11-20). Served from the app by next/font/local.
 *  - Cabinet Grotesk (Indian Type Foundry, Fontshare, ITF Free Font License; downloaded 2026-11-20): display and UI,
 *    400 to 900. Measured in the browser at 100 px: all ten digits set at one width with `tnum` on
 *    (docs/design/v3-proposal/README.md, "Checks"), so it carries tables and figures.
 *  - Departure Mono (Helena Zhang, SIL OFL 1.1, release 1.500): the thermal printer. Tape, receipts, ledger figures, ids,
 *    hashes and small labels; never paragraphs.
 * The variable names are shared with the design lab's CSS.
 */
export const cabinet = localFont({
  src: [
    { path: './fonts/cabinet-grotesk-400.woff2', weight: '400' },
    { path: './fonts/cabinet-grotesk-500.woff2', weight: '500' },
    { path: './fonts/cabinet-grotesk-700.woff2', weight: '700' },
    { path: './fonts/cabinet-grotesk-900.woff2', weight: '900' },
  ],
  variable: '--f-cabinet',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

/**
 * Design v5 (decision D2 b, 2026-11-24): Geist Sans (Vercel, SIL OFL 1.1; the variable file of the `geist` 1.9.2 release,
 * licence text in fonts/GEIST-OFL.txt) carries all UI, body, table, label and axis text. Cabinet Grotesk stays only for page
 * titles, KPI figures and the marketing headline; Departure Mono only for the receipt, the stamp, ids and hashes. Reason: at 12
 * to 14 px Cabinet Grotesk broke letters in the prototype's images ("Unfil led", "Stat us").
 */
export const geist = localFont({
  src: './fonts/geist-sans-variable.woff2',
  weight: '100 900',
  variable: '--f-geist',
  display: 'swap',
  fallback: ['ui-sans-serif', 'system-ui', 'sans-serif'],
})

export const departure = localFont({
  src: './fonts/departure-mono.woff2',
  variable: '--f-departure',
  display: 'swap',
  fallback: ['ui-monospace', 'monospace'],
})

export const fontVariables = `${geist.variable} ${cabinet.variable} ${departure.variable}`

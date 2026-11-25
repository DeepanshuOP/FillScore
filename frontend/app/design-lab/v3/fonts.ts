// Design v3 lab only (2026-11-20). Candidates for the specimen; the chosen pair per direction is in each tokens page.
// Sources: Cabinet Grotesk and Clash Grotesk from Fontshare (Indian Type Foundry), Departure Mono (Helena Zhang, OFL,
// GitHub release 1.500), Martian Mono, Fragment Mono and Archivo from Google Fonts. Downloaded 2026-11-20.

// Cabinet Grotesk and Departure Mono are production fonts now (app/fonts.ts, design v3 chosen 2026-11-20).
export { cabinet, departure } from '../../fonts'
import { cabinet, departure } from '../../fonts'

// Design v5 step 7 (performance): the lab-only fonts (Clash, Martian, Fragment, Archivo) were `next/font/local` declarations, and
// Next puts every such declaration in the shared stylesheet of the whole site, so every production page preloaded eight font files it
// never uses (they slowed the first paint on a slow connection). They are plain `@font-face` rules now, in `v3.css` (loaded by the lab's
// own layout only), under the class `fs-v3-fonts`, which sets the same `--f-*` variables the lab's CSS reads.
export const fontVars = [cabinet.variable, departure.variable, 'fs-v3-fonts'].join(' ')

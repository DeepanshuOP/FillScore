# Design v5 step 1: audit of what is there (2026-11-23)

Deepanshu's review: the app reads as a styled document, not a product. This audit measures that, page by page, before anything
is proposed.

## Method

- **Build:** the production build of `0978190` (`npm run build` with `BACKEND_PROXY_URL=http://127.0.0.1:3199`), served by
  `PORT=3101 npm run start`. Every API answer comes from the offline demo fixtures (`frontend/e2e-shots/mock.ts`): no database, no
  network. For Lighthouse, which opens its own page, the same answers are served by `e2e-shots/mock-server.ts` on 3199 (and 3001 for
  server-side calls). Account shown: `demo-moderate` (245 orders, 607 fills, January 2024); Settings and Connect signed in.
- **Script:** `frontend/e2e-shots/audit5.ts` (committed). 20 pages (7 marketing, 13 app states) x 5 viewports x light and dark = 200
  states, 0 errors. Viewports: desktop 1440x900, desktop 1280x800, tablet 768x1024 (Chromium); iPhone 15 (393x659, touch) and Pixel 8
  (412x839 CSS px, touch, Chromium), at device scale 1. Per state: smallest visible font size and visible text nodes under 12 px (SVG
  text at its drawn size); uppercase runs with letter-spacing over 0.5 px, and how many are under 12 px; axe `color-contrast` at AA
  (every flagged node, muted text included) and serious or critical rules; "not computed", "insufficient data" and lone-dash cells;
  on phones, tap targets under 44 px (inline links inside running text exempt, WCAG 2.5.8). Tables: `node e2e-shots/audit5-summary.mjs`.
- **Deviation:** WebKit cannot start on this host (GTK 4 and GStreamer libraries missing; installing them needs `sudo`). The iPhone 15
  profile ran in Chromium with the same viewport, user agent and touch; its rows say "(chromium)". Safari-only issues are not covered.
- **Fixture fix during the audit:** the first Patterns capture showed "Failed to load analytics" because the fixtures lacked
  `/audit/analytics`. The fixtures now return the server's own answers for a rebuilt demo (`backend/src/routes/audit.ts:657`, `:798`,
  `:992`), and Patterns was measured again (the newer row replaces the older one).
- **Lighthouse:** `frontend/e2e-shots/lighthouse5.mjs`, Lighthouse 12.8.2 mobile defaults (simulated slow 4G, 4x CPU slowdown), three
  runs per page, medians. Local WSL machine, so absolute values differ from Vercel; they are the baseline for the prototype's numbers.
- Images: `audit/` (the ones cited below); all 200 captures are in `.work/audit5/` (local, not committed).

## Totals (200 states)

| Measure | Value |
|---|---|
| Smallest visible text | **10 px** (landing, the order receipt, Evidence, Settings) |
| Visible text nodes under 12 px | **3,670**, on 14 of 20 pages (Fills 650, landing 952, Council 350, Rankings 332, receipt 298, Orders 288, Overview 240) |
| Letter-spaced uppercase runs | **1,184**, of which **280** are under 12 px (Fills 84, Orders 62, receipt 62, Evidence 24, Settings 20) |
| axe color-contrast nodes (AA) | **0** (the tokens are contrast-tested, `app/ui/contrast.test.ts`); axe serious or critical: 0 |
| "Not computed" / "insufficient data" / lone dash | 30 / 20 / 0 (Fills: the not-computed sentence on 10 states; Patterns: a whole page on 10; Methodology explains both) |
| Phone tap targets under 44 px | **588** over 40 phone states (Methodology 72, Settings 72, Fills 68, Orders 56, Overview 48) |

Per page (sums over the 10 states of each page):

| Page | Smallest px | Text < 12 px | Caps runs (< 12 px) | Not computed / insufficient | Taps < 44 (phones) |
|---|---|---|---|---|---|
| landing | 10 | 952 | 60 (0) | 0 / 0 | 16 |
| how-it-works | 11 | 140 | 70 (0) | 0 / 0 | 8 |
| demo | 12 | 0 | 190 (0) | 0 / 0 | 8 |
| verify | 12 | 0 | 40 (0) | 0 / 0 | 24 |
| docs | 12 | 0 | 50 (0) | 0 / 0 | 8 |
| methodology | 12 | 0 | 40 (0) | 10 / 20 | 72 |
| login | 12.5 | 0 | 0 (0) | 0 / 0 | 32 |
| app-home | 10.5 | 50 | 58 (4) | 0 / 0 | 12 |
| app-overview | 11 | 240 | 118 (4) | 0 / 0 | 48 |
| app-orders | 11 | 288 | 86 (62) | 0 / 0 | 56 |
| app-orders-receipt | 10 | 298 | 116 (62) | 0 / 0 | 0 |
| app-rules | 11 | 30 | 28 (4) | 0 / 0 | 20 |
| app-rankings | 11 | 332 | 28 (4) | 0 / 0 | 36 |
| app-council | 11 | 350 | 28 (4) | 0 / 0 | 40 |
| app-evidence | 10 | 150 | 68 (24) | 0 / 0 | 20 |
| app-fills | 11 | 650 | 108 (84) | 10 / 0 | 68 |
| app-fills-patterns | 11 | 30 | 28 (4) | 10 / 0 | 12 |
| app-check | 11 | 30 | 28 (4) | 0 / 0 | 32 |
| app-settings | 10 | 130 | 40 (20) | 0 / 0 | 72 |
| app-connect | 12 | 0 | 0 (0) | 0 / 0 | 4 |

(The Patterns row is the re-run: 6 or 1 nodes under 12 px per state, 1 to 4 caps runs, 3 small targets on phones.)

## Lighthouse mobile (medians of 3)

| Page | Performance | LCP | CLS | TBT |
|---|---|---|---|---|
| `/` | 59 | 4.27 s | 0 | 1,165 ms |
| `/demo` | 66 | 4.24 s | 0.005 | 857 ms |
| `/app` (demo-moderate) | 50 | 8.05 s | 0.021 | 1,212 ms |
| `/app/orders` (demo-moderate) | 49 | 8.14 s | 0.021 | 1,334 ms |

The app's LCP waits for its data (the page renders its frame, then the figures after the client fetches); TBT over 1 s on every page
is script work on a 4x slowed CPU (the app's first load is about 400 kB of gzip JS, M8 §IA v4 polish).

## The 25 worst problems, ranked

Ranked by what a first-time visitor and a trader lose: can they read it, understand it, act on it.

| # | Problem | Where, measured | Image |
|---|---|---|---|
| 1 | **The landing hero breaks on a short phone**: the receipt's lines (SPREAD, IMPACT AND TIMING, FEES) are drawn over the headline "Every fill, held to the tape." | iPhone 15 (393x659); earlier QA used 390x844 and never saw it | `audit/landing-iphone-15-light.jpg` |
| 2 | **Text too small to read**: 3,670 visible text nodes under 12 px, smallest 10 px | 14 of 20 pages; Fills 650, landing 952, Council 350 | `audit/app-orders-receipt-pixel-8-dark.jpg` |
| 3 | **Letter-spaced uppercase mono labels everywhere**: 1,184 runs, 280 under 12 px (table headers, rail labels "01 TOTAL", "NOTE 1 OF 4", the phone bar) | Fills 84 under 12 px, Orders 62, receipt 62 | `audit/app-orders-desktop-1440-light.jpg` |
| 4 | **Overview spends the first screen on one 230 px figure** ($52.08) and a sentence; the grade is a second screen; no chart until the third | Overview 1440 | `audit/app-overview-desktop-1440-light.jpg` |
| 5 | **No chart reads as a chart**: Rankings draws dots and brackets on an axis from -0.53 to -0.00 bps, labels in 11 px red mono ("median -0.50 bps, 90% -0.53 bps to -0.46 bps") | Rankings | `audit/app-rankings-desktop-1440-light.jpg` |
| 6 | **The Orders ledger hides the cost** (the measure the product exists for) behind "Columns"; the default columns are time, symbol, side, type, status, notional, fees | Orders 1440 | `audit/app-orders-desktop-1440-light.jpg` |
| 7 | **Negative zero is printed**: "-0.00 bps  -$0.00" on the receipt, "-0.00 bps" on the Rankings axis and rows | receipt, Rankings | `audit/app-orders-receipt-pixel-8-dark.jpg` |
| 8 | **A whole tab says "not computed"**: Fills > Patterns for every demo ("The heatmap, symbol breakdown, score distribution and markouts need per-trade v1 fields") | Patterns, all 10 states | `audit/app-fills-patterns-desktop-1440-light.jpg` |
| 9 | **Fills opens with a not-computed sentence** ("Not computed for this data: slippage, score, grade and the average score...") above the figures | Fills, all 10 states | `audit/app-fills-pixel-8-light.jpg` |
| 10 | **Words a visitor cannot decode**: Council (Liquidity Scout, Risk Auditor, "Alpha verdict: NEGATIVE", "hourly HHI of 0.10", ">-0.01 bps"), Evidence, Rankings, "Theme: Paper" / "Carbon copy", "NOT ISSUED", "Method", "slip", "tape" | Council, Evidence, sidebar | `audit/app-council-desktop-1440-light.jpg` |
| 11 | **The page header is two cramped rows**: a dashed provenance chip, a pen mark, the account, the period "Jan 1 - Jan 31, 2024" and the venue in 13 px letter-spaced mono, then three actions; the period is text, not a control | every app page | `audit/app-home-desktop-1280-light.jpg` |
| 12 | **The phone's bottom bar is four mono uppercase words with no icons** (HOME, OVERVIEW, ORDERS, MORE) | every app page on phones | `audit/app-fills-pixel-8-light.jpg` |
| 13 | **Tap targets under 44 px**: 588 over 40 phone states | Methodology 72 ("On this page" links), Settings 72, Fills 68, Orders 56 | `audit/methodology-pixel-8-light.jpg` |
| 14 | **The sidebar's foot is fine print**: "SCORING V2.3.0, MEASURE 1.0.0" in 11 px caps; the theme control is an underlined text link "Theme: Paper" | every app page | `audit/app-overview-desktop-1440-light.jpg` |
| 15 | **Council reads as a typed memo**: TO / FROM / RE in mono, four "notes" with "Rating: good", "FINDING, AS RECORDED", "Model's label, as recorded: negative"; no summary a trader can use | Council | `audit/app-council-desktop-1440-light.jpg` |
| 16 | **Home leads with four recorded questions**; at 1280 the account's total and grade start below the fold line of the first screen | Home 1280 | `audit/app-home-desktop-1280-light.jpg` |
| 17 | **Evidence, for a demo, is two "NOT ISSUED" cards and two closed folds**: nothing to do, and the rule-based (v1) details sit here behind a fold | Evidence | `audit/app-evidence-desktop-1440-light.jpg` |
| 18 | **The receipt on a phone is 11 px mono throughout**, with the order id, a barcode and a 5-item NOTES fold | receipt on phones | `audit/app-orders-receipt-pixel-8-dark.jpg` |
| 19 | **No period picker and no comparison anywhere**: the period is fixed text; nothing says whether costs rose or fell against an earlier period | every app page | `audit/app-home-desktop-1280-light.jpg` |
| 20 | **Fills on a phone shows three columns** (No., Time, Symbol): price, size, fee and side are off-screen; the "NO." column spends width on a row number | Fills on phones | `audit/app-fills-pixel-8-light.jpg` |
| 21 | **Settings is one long column** without section navigation; three red "Disconnect" buttons are the most prominent things on the page | Settings on phones | `audit/app-settings-iphone-15-dark.jpg` |
| 22 | **Mono is used for prose**: the Council's benchmark lines, the footer disclaimer, the Rankings interval sentences | Council, Rankings, footer | `audit/app-council-desktop-1440-light.jpg` |
| 23 | **Slow on a phone**: Lighthouse mobile 49 to 66, LCP 8.1 s on `/app` and `/app/orders`, TBT 0.9 to 1.3 s on every page | the four pages measured | (table above) |
| 24 | **Pen marks (ring-and-dot buttons) after titles carry the explanations**: the reader must hover or tap a 16 px mark to learn what a panel shows | every panel title | `audit/app-rankings-desktop-1440-light.jpg` |
| 25 | **Section titles are sentences and labels are rails**: "Execution cost, ranked only where there are enough orders"; "01 TOTAL", "02 GRADE" as mono rails instead of headings a scanner can use | Rankings, Overview | `audit/app-rankings-desktop-1440-light.jpg` |

What is good and stays: contrast passes AA everywhere (0 axe nodes); provenance is printed on every app page; the receipt and the grade
stamp are memorable objects; the ValueState words keep measured, insufficient and not computed apart; the login and Connect pages have
no text under 12 px.

## Per-page tables (light / dark; generated)

<!-- pages:start -->

#### app-check

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 6 / 6 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-check-desktop-1440-light.jpg, app-check-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 6 / 6 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-check-desktop-1280-light.jpg, app-check-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 |  | app-check-tablet-768-light.jpg, app-check-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 8 / 8 | app-check-iphone-15-light.jpg, app-check-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 8 / 8 | app-check-pixel-8-light.jpg, app-check-pixel-8-dark.jpg |

#### app-connect

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 12 / 12 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 |  | app-connect-desktop-1440-light.jpg, app-connect-desktop-1440-dark.jpg |
| desktop-1280 | 12 / 12 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 |  | app-connect-desktop-1280-light.jpg, app-connect-desktop-1280-dark.jpg |
| tablet-768 | 12 / 12 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 |  | app-connect-tablet-768-light.jpg, app-connect-tablet-768-dark.jpg |
| iphone-15 (chromium) | 12 / 12 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 | 1 / 1 | app-connect-iphone-15-light.jpg, app-connect-iphone-15-dark.jpg |
| pixel-8 | 12 / 12 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 | 1 / 1 | app-connect-pixel-8-light.jpg, app-connect-pixel-8-dark.jpg |

#### app-council

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 38 / 38 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-council-desktop-1440-light.jpg, app-council-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 38 / 38 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-council-desktop-1280-light.jpg, app-council-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 33 / 33 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 |  | app-council-tablet-768-light.jpg, app-council-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 33 / 33 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 10 / 10 | app-council-iphone-15-light.jpg, app-council-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 33 / 33 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 10 / 10 | app-council-pixel-8-light.jpg, app-council-pixel-8-dark.jpg |

#### app-evidence

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 10 / 10 | 18 / 18 | 5 (3) / 5 (3) | 0 / 0 | 0/0/0 |  | app-evidence-desktop-1440-light.jpg, app-evidence-desktop-1440-dark.jpg |
| desktop-1280 | 10 / 10 | 18 / 18 | 5 (3) / 5 (3) | 0 / 0 | 0/0/0 |  | app-evidence-desktop-1280-light.jpg, app-evidence-desktop-1280-dark.jpg |
| tablet-768 | 10 / 10 | 13 / 13 | 8 (2) / 8 (2) | 0 / 0 | 0/0/0 |  | app-evidence-tablet-768-light.jpg, app-evidence-tablet-768-dark.jpg |
| iphone-15 (chromium) | 10 / 10 | 13 / 13 | 8 (2) / 8 (2) | 0 / 0 | 0/0/0 | 5 / 5 | app-evidence-iphone-15-light.jpg, app-evidence-iphone-15-dark.jpg |
| pixel-8 | 10 / 10 | 13 / 13 | 8 (2) / 8 (2) | 0 / 0 | 0/0/0 | 5 / 5 | app-evidence-pixel-8-light.jpg, app-evidence-pixel-8-dark.jpg |

#### app-fills

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 68 / 68 | 9 (9) / 9 (9) | 0 / 0 | 1/0/0 |  | app-fills-desktop-1440-light.jpg, app-fills-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 68 / 68 | 9 (9) / 9 (9) | 0 / 0 | 1/0/0 |  | app-fills-desktop-1280-light.jpg, app-fills-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 63 / 63 | 12 (8) / 12 (8) | 0 / 0 | 1/0/0 |  | app-fills-tablet-768-light.jpg, app-fills-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 63 / 63 | 12 (8) / 12 (8) | 0 / 0 | 1/0/0 | 17 / 17 | app-fills-iphone-15-light.jpg, app-fills-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 63 / 63 | 12 (8) / 12 (8) | 0 / 0 | 1/0/0 | 17 / 17 | app-fills-pixel-8-light.jpg, app-fills-pixel-8-dark.jpg |

#### app-fills-patterns

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 6 / 6 | 1 (1) / 1 (1) | 0 / 0 | 1/0/0 |  | app-fills-patterns-desktop-1440-light.jpg, app-fills-patterns-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 6 / 6 | 1 (1) / 1 (1) | 0 / 0 | 1/0/0 |  | app-fills-patterns-desktop-1280-light.jpg, app-fills-patterns-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 1/0/0 |  | app-fills-patterns-tablet-768-light.jpg, app-fills-patterns-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 1/0/0 | 3 / 3 | app-fills-patterns-iphone-15-light.jpg, app-fills-patterns-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 1/0/0 | 3 / 3 | app-fills-patterns-pixel-8-light.jpg, app-fills-patterns-pixel-8-dark.jpg |

#### app-home

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 10.5 / 10.5 | 8 / 8 | 4 (1) / 4 (1) | 0 / 0 | 0/0/0 |  | app-home-desktop-1440-light.jpg, app-home-desktop-1440-dark.jpg |
| desktop-1280 | 10.5 / 10.5 | 8 / 8 | 4 (1) / 4 (1) | 0 / 0 | 0/0/0 |  | app-home-desktop-1280-light.jpg, app-home-desktop-1280-dark.jpg |
| tablet-768 | 10.5 / 10.5 | 3 / 3 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 |  | app-home-tablet-768-light.jpg, app-home-tablet-768-dark.jpg |
| iphone-15 (chromium) | 10.5 / 10.5 | 3 / 3 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 | 3 / 3 | app-home-iphone-15-light.jpg, app-home-iphone-15-dark.jpg |
| pixel-8 | 10.5 / 10.5 | 3 / 3 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 | 3 / 3 | app-home-pixel-8-light.jpg, app-home-pixel-8-dark.jpg |

#### app-orders

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 13 / 13 | 8 (8) / 8 (8) | 0 / 0 | 0/0/0 |  | app-orders-desktop-1440-light.jpg, app-orders-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 13 / 13 | 8 (8) / 8 (8) | 0 / 0 | 0/0/0 |  | app-orders-desktop-1280-light.jpg, app-orders-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 8 / 8 | 11 (7) / 11 (7) | 0 / 0 | 0/0/0 |  | app-orders-tablet-768-light.jpg, app-orders-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 55 / 55 | 8 (4) / 8 (4) | 0 / 0 | 0/0/0 | 14 / 14 | app-orders-iphone-15-light.jpg, app-orders-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 55 / 55 | 8 (4) / 8 (4) | 0 / 0 | 0/0/0 | 14 / 14 | app-orders-pixel-8-light.jpg, app-orders-pixel-8-dark.jpg |

#### app-orders-receipt

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 10 / 10 | 14 / 14 | 11 (8) / 11 (8) | 0 / 0 | 0/0/0 |  | app-orders-receipt-desktop-1440-light.jpg, app-orders-receipt-desktop-1440-dark.jpg |
| desktop-1280 | 10 / 10 | 14 / 14 | 11 (8) / 11 (8) | 0 / 0 | 0/0/0 |  | app-orders-receipt-desktop-1280-light.jpg, app-orders-receipt-desktop-1280-dark.jpg |
| tablet-768 | 10 / 10 | 9 / 9 | 14 (7) / 14 (7) | 0 / 0 | 0/0/0 |  | app-orders-receipt-tablet-768-light.jpg, app-orders-receipt-tablet-768-dark.jpg |
| iphone-15 (chromium) | 10 / 10 | 56 / 56 | 11 (4) / 11 (4) | 0 / 0 | 0/0/0 | 0 / 0 | app-orders-receipt-iphone-15-light.jpg, app-orders-receipt-iphone-15-dark.jpg |
| pixel-8 | 10 / 10 | 56 / 56 | 11 (4) / 11 (4) | 0 / 0 | 0/0/0 | 0 / 0 | app-orders-receipt-pixel-8-light.jpg, app-orders-receipt-pixel-8-dark.jpg |

#### app-overview

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 27 / 27 | 10 (1) / 10 (1) | 0 / 0 | 0/0/0 |  | app-overview-desktop-1440-light.jpg, app-overview-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 27 / 27 | 10 (1) / 10 (1) | 0 / 0 | 0/0/0 |  | app-overview-desktop-1280-light.jpg, app-overview-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 22 / 22 | 13 (0) / 13 (0) | 0 / 0 | 0/0/0 |  | app-overview-tablet-768-light.jpg, app-overview-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 22 / 22 | 13 (0) / 13 (0) | 0 / 0 | 0/0/0 | 12 / 12 | app-overview-iphone-15-light.jpg, app-overview-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 22 / 22 | 13 (0) / 13 (0) | 0 / 0 | 0/0/0 | 12 / 12 | app-overview-pixel-8-light.jpg, app-overview-pixel-8-dark.jpg |

#### app-rankings

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 37 / 37 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-rankings-desktop-1440-light.jpg, app-rankings-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 37 / 37 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-rankings-desktop-1280-light.jpg, app-rankings-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 32 / 32 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 |  | app-rankings-tablet-768-light.jpg, app-rankings-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 30 / 30 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 9 / 9 | app-rankings-iphone-15-light.jpg, app-rankings-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 30 / 30 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 9 / 9 | app-rankings-pixel-8-light.jpg, app-rankings-pixel-8-dark.jpg |

#### app-rules

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 6 / 6 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-rules-desktop-1440-light.jpg, app-rules-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 6 / 6 | 1 (1) / 1 (1) | 0 / 0 | 0/0/0 |  | app-rules-desktop-1280-light.jpg, app-rules-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 |  | app-rules-tablet-768-light.jpg, app-rules-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 5 / 5 | app-rules-iphone-15-light.jpg, app-rules-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 1 / 1 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 5 / 5 | app-rules-pixel-8-light.jpg, app-rules-pixel-8-dark.jpg |

#### app-settings

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 10 / 10 | 13 / 13 | 4 (2) / 4 (2) | 0 / 0 | 0/0/0 |  | app-settings-desktop-1440-light.jpg, app-settings-desktop-1440-dark.jpg |
| desktop-1280 | 10 / 10 | 13 / 13 | 4 (2) / 4 (2) | 0 / 0 | 0/0/0 |  | app-settings-desktop-1280-light.jpg, app-settings-desktop-1280-dark.jpg |
| tablet-768 | 10 / 10 | 13 / 13 | 4 (2) / 4 (2) | 0 / 0 | 0/0/0 |  | app-settings-tablet-768-light.jpg, app-settings-tablet-768-dark.jpg |
| iphone-15 (chromium) | 10 / 10 | 13 / 13 | 4 (2) / 4 (2) | 0 / 0 | 0/0/0 | 18 / 18 | app-settings-iphone-15-light.jpg, app-settings-iphone-15-dark.jpg |
| pixel-8 | 10 / 10 | 13 / 13 | 4 (2) / 4 (2) | 0 / 0 | 0/0/0 | 18 / 18 | app-settings-pixel-8-light.jpg, app-settings-pixel-8-dark.jpg |

#### demo

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 12 / 12 | 0 / 0 | 19 (0) / 19 (0) | 0 / 0 | 0/0/0 |  | demo-desktop-1440-light.jpg, demo-desktop-1440-dark.jpg |
| desktop-1280 | 12 / 12 | 0 / 0 | 19 (0) / 19 (0) | 0 / 0 | 0/0/0 |  | demo-desktop-1280-light.jpg, demo-desktop-1280-dark.jpg |
| tablet-768 | 12 / 12 | 0 / 0 | 19 (0) / 19 (0) | 0 / 0 | 0/0/0 |  | demo-tablet-768-light.jpg, demo-tablet-768-dark.jpg |
| iphone-15 (chromium) | 12 / 12 | 0 / 0 | 19 (0) / 19 (0) | 0 / 0 | 0/0/0 | 2 / 2 | demo-iphone-15-light.jpg, demo-iphone-15-dark.jpg |
| pixel-8 | 12 / 12 | 0 / 0 | 19 (0) / 19 (0) | 0 / 0 | 0/0/0 | 2 / 2 | demo-pixel-8-light.jpg, demo-pixel-8-dark.jpg |

#### docs

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 12 / 12 | 0 / 0 | 5 (0) / 5 (0) | 0 / 0 | 0/0/0 |  | docs-desktop-1440-light.jpg, docs-desktop-1440-dark.jpg |
| desktop-1280 | 12 / 12 | 0 / 0 | 5 (0) / 5 (0) | 0 / 0 | 0/0/0 |  | docs-desktop-1280-light.jpg, docs-desktop-1280-dark.jpg |
| tablet-768 | 12 / 12 | 0 / 0 | 5 (0) / 5 (0) | 0 / 0 | 0/0/0 |  | docs-tablet-768-light.jpg, docs-tablet-768-dark.jpg |
| iphone-15 (chromium) | 12 / 12 | 0 / 0 | 5 (0) / 5 (0) | 0 / 0 | 0/0/0 | 2 / 2 | docs-iphone-15-light.jpg, docs-iphone-15-dark.jpg |
| pixel-8 | 12 / 12 | 0 / 0 | 5 (0) / 5 (0) | 0 / 0 | 0/0/0 | 2 / 2 | docs-pixel-8-light.jpg, docs-pixel-8-dark.jpg |

#### how-it-works

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 11 / 11 | 14 / 14 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 |  | how-it-works-desktop-1440-light.jpg, how-it-works-desktop-1440-dark.jpg |
| desktop-1280 | 11 / 11 | 14 / 14 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 |  | how-it-works-desktop-1280-light.jpg, how-it-works-desktop-1280-dark.jpg |
| tablet-768 | 11 / 11 | 14 / 14 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 |  | how-it-works-tablet-768-light.jpg, how-it-works-tablet-768-dark.jpg |
| iphone-15 (chromium) | 11 / 11 | 14 / 14 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 | 2 / 2 | how-it-works-iphone-15-light.jpg, how-it-works-iphone-15-dark.jpg |
| pixel-8 | 11 / 11 | 14 / 14 | 7 (0) / 7 (0) | 0 / 0 | 0/0/0 | 2 / 2 | how-it-works-pixel-8-light.jpg, how-it-works-pixel-8-dark.jpg |

#### landing

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 10 / 10 | 94 / 94 | 6 (0) / 6 (0) | 0 / 0 | 0/0/0 |  | landing-desktop-1440-light.jpg, landing-desktop-1440-dark.jpg |
| desktop-1280 | 10 / 10 | 94 / 94 | 6 (0) / 6 (0) | 0 / 0 | 0/0/0 |  | landing-desktop-1280-light.jpg, landing-desktop-1280-dark.jpg |
| tablet-768 | 10 / 10 | 94 / 94 | 6 (0) / 6 (0) | 0 / 0 | 0/0/0 |  | landing-tablet-768-light.jpg, landing-tablet-768-dark.jpg |
| iphone-15 (chromium) | 10 / 10 | 97 / 97 | 6 (0) / 6 (0) | 0 / 0 | 0/0/0 | 4 / 4 | landing-iphone-15-light.jpg, landing-iphone-15-dark.jpg |
| pixel-8 | 10 / 10 | 97 / 97 | 6 (0) / 6 (0) | 0 / 0 | 0/0/0 | 4 / 4 | landing-pixel-8-light.jpg, landing-pixel-8-dark.jpg |

#### login

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 12.5 / 12.5 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 |  | login-desktop-1440-light.jpg, login-desktop-1440-dark.jpg |
| desktop-1280 | 12.5 / 12.5 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 |  | login-desktop-1280-light.jpg, login-desktop-1280-dark.jpg |
| tablet-768 | 13 / 13 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 |  | login-tablet-768-light.jpg, login-tablet-768-dark.jpg |
| iphone-15 (chromium) | 13 / 13 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 | 8 / 8 | login-iphone-15-light.jpg, login-iphone-15-dark.jpg |
| pixel-8 | 13 / 13 | 0 / 0 | 0 (0) / 0 (0) | 0 / 0 | 0/0/0 | 8 / 8 | login-pixel-8-light.jpg, login-pixel-8-dark.jpg |

#### methodology

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 1/2/0 |  | methodology-desktop-1440-light.jpg, methodology-desktop-1440-dark.jpg |
| desktop-1280 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 1/2/0 |  | methodology-desktop-1280-light.jpg, methodology-desktop-1280-dark.jpg |
| tablet-768 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 1/2/0 |  | methodology-tablet-768-light.jpg, methodology-tablet-768-dark.jpg |
| iphone-15 (chromium) | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 1/2/0 | 18 / 18 | methodology-iphone-15-light.jpg, methodology-iphone-15-dark.jpg |
| pixel-8 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 1/2/0 | 18 / 18 | methodology-pixel-8-light.jpg, methodology-pixel-8-dark.jpg |

#### verify

| Viewport | Smallest px | Text < 12 px | Caps runs (< 12 px) | Contrast nodes | Not computed / insufficient / dash | Taps < 44 | Images |
|---|---|---|---|---|---|---|---|
| desktop-1440 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 |  | verify-desktop-1440-light.jpg, verify-desktop-1440-dark.jpg |
| desktop-1280 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 |  | verify-desktop-1280-light.jpg, verify-desktop-1280-dark.jpg |
| tablet-768 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 |  | verify-tablet-768-light.jpg, verify-tablet-768-dark.jpg |
| iphone-15 (chromium) | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 6 / 6 | verify-iphone-15-light.jpg, verify-iphone-15-dark.jpg |
| pixel-8 | 12 / 12 | 0 / 0 | 4 (0) / 4 (0) | 0 / 0 | 0/0/0 | 6 / 6 | verify-pixel-8-light.jpg, verify-pixel-8-dark.jpg |
<!-- pages:end -->

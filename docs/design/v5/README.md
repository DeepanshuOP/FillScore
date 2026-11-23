# Design v5 (orders of 2026-11-24): what is in this folder

| File | What it is |
|---|---|
| `AUDIT.md` | Step 1: the measured audit of every marketing and app page (200 states), the 25 worst problems, Lighthouse |
| `REFERENCES.md` | Step 2: reference sites (measured) and libraries (license, version, size) |
| `FEATURES.md` | Step 3: the SaaS features FillScore lacks, top 8 ranked |
| `PROPOSAL.md` | Steps 4 and 5: the not-computed policy, the words, readability rules, shell, pages, charts, motion, budgets, decisions |
| `audit/` | the before-images the audit cites |
| `refs/` | the reference captures and `measures.json` |
| `before-*.jpg`, `after-*.jpg` | the 22 images below |

## The prototype

`frontend/app/design-lab/v5/` (404 in production: `designLabEnabled`, the e2e guard spec lists its six paths). Run it with
`npm run build && DESIGN_LAB=1 PORT=3101 npm run start`, then open `/design-lab/v5` (landing hero) and `/design-lab/v5/app?userId=demo-moderate`
(Home; Costs, Orders with the receipt, Fills, Check a broker file from the sidebar or the phone bar). Light, Dark and System are in the
sidebar foot and in the phone's More sheet.

Data: every figure is a served value from the offline demo fixtures (`frontend/e2e-shots/fixtures/<account>.json`, the API bodies the QA
scripts serve) and the stored demo prints (`backend/src/data/demoPrints.ts`), read on the server (`lib/data.ts`), passed through the
production view models (`describeHeadline`, `describeStrip`) and formatted (`lib/format.ts`, tested: never "-0.00"). The page orders,
filters and selects; it sums, averages or derives nothing. Charts: Recharts (already a dependency); palette validated with the dataviz
validator (light and dark pass). Not built in the prototype: Rule breaks, Comparisons, AI review, Reports, Docs, Settings (shown disabled in
the sidebar), the period presets other than the whole history (they need the server, decision D6), and the Ask answers (layout only).

## Before and after

All captures from the same production build and fixtures, the "before" from `e2e-shots/audit5.ts` on the live pages, the "after" from the
same script with `AUDIT_PREFIX=/design-lab/v5`. iPhone 15 is emulated in Chromium (WebKit cannot start on this host).

| Before | After | What changed |
|---|---|---|
| `before-landing-iphone-15.jpg` | `after-landing-iphone-15.jpg` | The receipt no longer sits over the headline on a 393x659 phone (AUDIT #1); plain headline, readable sentence, two buttons |
| `before-landing-1440.jpg` | `after-landing-1440.jpg` | A conventional top bar ("Try the demo"); the real demo order's receipt prints in beside the headline |
| `before-home-1280.jpg` | `after-home-1280.jpg` | Home leads with four tiles, the cost per order chart and the costliest orders; the provenance banner replaces the 11 px chip |
| `before-costs-1440.jpg` | `after-costs-1440.jpg` | Overview becomes Costs: tiles, "Where the cost came from" as one labelled bar, charts with axis titles and units, instead of one 230 px figure |
| `before-costs-pixel-8-dark.jpg` | `after-costs-pixel-8-dark.jpg` | Dark theme on a phone: top bar, banner, title, period, tiles two by two |
| `before-orders-1440.jpg` | `after-orders-1440.jpg` | Cost and cost in bps are default columns; 14 px sentence-case headers instead of letter-spaced mono |
| `before-receipt-1440.jpg` | `after-receipt-1440.jpg` | The receipt stays (NOT SIGNED, published-rate fees, NOT COMPUTED rule) beside a chart of the public trades around the order with the fills marked |
| `before-receipt-pixel-8-dark.jpg` | `after-receipt-pixel-8-dark.jpg` | The receipt on a phone: 13 px, quantities to 8 decimals, no "-0.00" |
| `before-fills-pixel-8.jpg` | `after-fills-pixel-8.jpg` | No not-computed sentence; fills as row cards with price, size, fee and maker or taker |
| `before-check-1440-dark.jpg` | `after-check-1440-dark.jpg` | The broker-file check as a page with a drop zone and "Try the sample file" |
| | `after-home-1440-dark.jpg` | Home in the dark theme; the theme switch reads Light / Dark / System |
| | `after-orders-pixel-8-dark.jpg` | The phone shell: bottom bar with icons and labels (Home, Costs, Orders, More), row cards with the cost on the right |

Numbers: `PROPOSAL.md` §10.

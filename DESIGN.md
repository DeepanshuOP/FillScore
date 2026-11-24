# FillScore design system, design v5 (2026-11-24)

Approved by Deepanshu on 2026-11-24 from the proposal in `docs/design/v5/` (audit, references, features, proposal, prototype). It
replaces the app chrome of design v3 "Tape & Receipt" and IA v4: the app is now a conventional product (a sidebar of nouns with
icons, a page header with a title, one sentence, the period and one primary action, white cards on a neutral grey ground). The
receipt, the grade stamp and the marketing site keep the paper-and-ink story. Values live in `frontend/app/ui/tokens.css` (contrast-
tested by `app/ui/contrast.test.ts`, both themes); the printed objects in `app/ui/paper.css`; the landing page in `app/ui/landing.css`;
the app frame in `app/ui/appshell.css`. Every UI file follows this file.

## 1. Thesis

FillScore holds every fill against the public market and writes down what it cost. The app reads like work software: plain words,
body text at 14 px, nothing under 12 px, charts with labelled axes. The paper, the receipt and the stamp stay as signature objects.
The marketing site keeps its motion; the app's motion is fast and functional (150 to 200 ms).

## 2. Invariants (product rules, not style; never traded for looks)

1. No number written by a language model. Every figure comes from deterministic code and the existing APIs; the browser computes
   no figure it shows (it formats, orders and selects served values; chart positions are layout). Recorded model output is shown verbatim.
2. Past tense findings only. No advice, no prediction, no "could save", no "route flow to" (`adviceCopy.test.ts`).
3. Measured, insufficient data and not computed stay distinct (`ValueState`). Shape and words carry it; colour only repeats it. A
   missing figure reads "not computed" or "insufficient data", never a zero or a plausible number.
4. Demo accounts are labelled on every app page by the provenance banner ("Demo account · synthetic trader, real Binance prices · read-only"),
   on receipts ("synthetic trader, real prices", NOT SIGNED) and on the share card. Unknown provenance is never shown as the user's data.
5. Read-only exchange keys only; a refused key comes back as a returned receipt with the corrections printed.
6. Reduced motion and no JavaScript show the finished frame.
7. Correlation, never causation: "coincided with", never "caused" or "due to".
8. Published grades never change silently: the locked v1 grade is printed beside the measured one on Costs.

## 3. Colour and themes

- Themes are **Light, Dark and System** (default System; next-themes sets `data-theme="light" | "dark"`; key `fs-theme-v5`). The control is a
  sun, moon or monitor button with its word (`components/shell/ThemeToggle.tsx`).
- The root tokens are the paper tone (marketing, receipt, stamp). Inside the app (`data-app`, also set on `<body>` by `AppScope` so portals
  wear it) the same role names carry the app palette: a neutral grey ground (`#F4F4F2` light, `#0E0E0D` dark) with white cards (`#FFFFFF`,
  `#1A1A19`). A printed object inside the app (`.fs-paper`, `.fs-receipt`) takes the paper values back.
- Chart series 1 to 3 (blue, orange, green), grid and axis lines, the banner and the accent tint are tokens (`--ui-series-*`, `--ui-grid`,
  `--ui-axis`, `--ui-banner*`, `--ui-accent-soft`), validated in both themes. Money is never coloured good or bad. Light-theme green is
  under 3:1 on white, so a green part always carries a direct text label.

## 4. Type (decision D2 b)

- **Geist Sans** (OFL, variable file `app/fonts/geist-sans-variable.woff2`) for all UI, body, table, label and axis text.
- **Cabinet Grotesk** only for page titles (`page-title`, 24 px), KPI figures (`kpi-figure`, 28 px), display headings and the marketing headline.
- **Departure Mono** only in the receipt, the stamp, ids and hashes. Reason: Cabinet Grotesk broke letters at 12 to 14 px in the prototype.
- Sizes: body 14 px; card titles 16 px; labels, captions, tick labels and table headers at least 12 px, sentence case; no letter-spaced
  uppercase under 12 px anywhere (printed objects keep their uppercase at 13 px and up). Tabular figures everywhere; a true minus; never "-0.00".

## 5. Shell and pages

- **Sidebar** (248 px; a 64 px rail from 1024 to 1279 px): Home, Costs, Orders, Fills; Review: Flagged orders, Comparisons, AI review; Tools:
  Reports, Check an exchange export; Docs, Settings, the theme control, the account. The account switcher ends a long name in an ellipsis and
  shows it whole in a tooltip. Phones: a top bar (logo mark, page title, search, account), a bottom bar (Home, Costs, Orders, More with icons
  and 12 px labels) and a More sheet. ⌘K (`CommandMenu`) loads on its first open.
- **Banner and header**: the provenance banner, then the page header: 24 px title, one sentence, the period as a disabled label ("Period
  choice comes next"), one primary action and a "⋯" menu (`AppPage` in `appshell/shellContext.tsx`).
- **Cards** (`ui/blocks.tsx`): KPI tiles, cards with a 16 px title, one sentence, an info popover and a source line that names the data.
- **Charts** (Recharts, loaded by the pages that draw them): stacked cost bar per order type, the receipt's public-trades scatter; hand-drawn
  SVG for Comparisons (bars with 90% whiskers, zero line). Axis titles are HTML, ticks are round values (`ui/charts/ticks.ts`).
- **Routes**: `/app` (Home), `/app/costs`, `/app/orders`, `/app/fills`, `/app/flagged`, `/app/compare`, `/app/review`, `/app/reports`, `/app/check`,
  `/app/settings`, `/app/connect`. The old addresses answer one-hop 308 (`legacyRedirects.mjs`).
- **Words**: Costs, Flagged orders, Comparisons, AI review, Reports, Short review (1 AI call), Full review (9 AI calls), public trades (not
  prints or tape), Try the demo, Verify a report, Check an exchange export. Invariant words are kept: NOT SIGNED, "not independently measured",
  "Unfilled orders (modelled)", "Fees (published rate)", the language-model heading.

## 6. Receipt, stamp and the marketing site

The receipt (`app/dashboard/OrderReplay.tsx`) stays a printed object in the app: Departure Mono at 14 px (13 px on phones), NOT SIGNED for
demos, NOT COMPUTED for a missing cost line, with a chart of the stored public trades around the order. The grade stamp stays. The marketing
site (landing, `/demo`, `/how-it-works`, `/verify`, `/docs`) keeps the paper tone and its GSAP story, in Geist with Cabinet only for the headline.

## 7. Numbers

One style per kind (`app/lib/format.ts`, tested): money `$52.08`, below a cent `<$0.01`; bps one decimal with the unit; counts with the noun;
shares as whole percent (one decimal under 10%); grades as a letter with the score to one decimal "of 100" and its range. bps is glossed once per page.

## 8. Budgets and checks

First Load JS (gzip, `scripts/first-load-js.mjs`): the budgets and the measured values are in `docs/milestones/M8.md` ("Design v5 built").
`e2e-shots/audit5.ts` measures text under 12 px, caps runs, phone tap targets, contrast and errors on every page and viewport.

## 9. Decisions log

- 2026-11-24 (design v5 built, from the proposal in `docs/design/v5/`; decisions D1 to D13): sidebar of nouns with icons (D1), Geist for UI text
  (D2 b), Light / Dark / System (D3), Recharts (D4), neutral grey app with white cards and paper tone kept for the receipt and marketing (D5), AI
  review restructured (D7), the not-computed policy applied in part (D8; the period picker, fill against public trades, onboarding, changelog,
  usage and status are the next order), the landing hero fix for short phones (D10), "Check an exchange export" (D13). Deliberately changed
  guards, each with its reason in its file: theme names, orders columns, receipt copy, fills not-computed sentence, agent labels, review mode
  words, the " · " ban (one exemption, the provenance banner).
- 2026-11-23 (IA v4 built; the sixth order, from the proposal in `docs/design/IA-v4/`): a marketing site and an app under `/app/*`;
  Trades and Analytics merged into Fills (tabs Ledger and Patterns, the tabs are gone in v5); Home is "Ask FillScore" with the key figures
  under it; `/how-it-works` is a page; the hero tape carries a printed label with the order's own date. Every old address answers a permanent
  redirect with the query kept (`legacyRedirects.mjs`).
- 2026-11-22 (design v3.1 Part B, F1 to F3): the hero holds its content inside the first 700 px (gaps above and below the tape about 110 px at
  1440 x 900; the box stays 100svh).
- 2026-11-21 (design v3.1): "Quiet audit" rules. The small stamp prints the period without the scoring line.
- 2026-11-20: direction 1 "Tape & Receipt" chosen over direction 2 "Grid & Highlighter"; replaces design v2 "Instrument".
- 2026-11-21 (design v3 fixes B1 to B3): the month tape's ticks were each order's cost from `GET /audit/orders-ledger`; the All / Market / Limit
  switch read `byType`; the receipt drew fills only. (v5: the month tape is replaced by "Costliest orders", the order types are one stacked bar
  each, and the receipt draws the stored public trades; the ledger's per-order costs are the same server values.)

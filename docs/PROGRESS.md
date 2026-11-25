# FillScore — Progress

This file is the resume point for the work in `docs/agent/MASTER_BRIEF.md`. A new session reads the brief, then this file, then `docs/HANDOFF.md`, and continues from "Next concrete action".

## Orders of 2026-11-25: finish design v5 (steps 0-9 of the order), local commits

- **Next concrete action: step 7 (performance: the 10 largest modules of the shared first-load chunk with sizes; client providers out of the root layout; lazy toaster, Motion features, GSAP, Lenis, cmdk and Vaul; first figures on the server for demo accounts; budgets and Lighthouse).** Steps 0 to 6 done; 7 to 9 open. Design v5 is NOT finished.
- **Status:** 0 done. 1 done. 2 done. 3 done. 4 done. 5 done. 6 done. 7 open. 8 open. 9 open.
- **Step 6: done (cleanup).** Deleted: `Overview`, `MonthTape` (+ `monthTape.ts` and its test), `HomeFigures`, `PrintsTape`, `Patterns`, `WhaleCorrelation`, `MarkoutCard`,
  `AnalyticsCharts`, `heatmapCopy` (+ test), and what only they imported: `dashboard/ordersView.ts` (+ `ordersTotals.test.ts`), `dashboard/chapter.tsx`, `ui/charts/CostRuler.tsx`,
  `utils/makerAdvice.ts` and `utils/markoutCopy.ts` (+ their tests); `app/analytics/` is gone. The geometry and caption of `printsTape.ts` and their tests went with the
  tape. Kept because something live uses it: `Fold` (AskHome) moved to `ui/Fold.tsx`; `ui/Figure.tsx` (the kept v3 design lab imports it, so it is not removed). Invariants
  moved to the live code: the receipt chart's source line (which file, "60 of 140 trades, the ones nearest the fills", "no public trade fell in the window") is now
  `chartSourceLine` with the old caption's tests; "a total the server did not send is absent, never a zero" is `typeRows` (`costsView.test.ts`); "1 order / 2 orders that never
  filled" is in `tiles.test.ts`; the coach and advice label scan (`coachLabels.test.ts`) now scans Costs, the tiles, Costliest orders and Ask in place of Overview;
  `adviceCopy`/`rebuiltCopy` scan `REBUILT_FILES`, updated (removed files out, new v5 files in). The e2e guard for the old Patterns address already asserts Fills (step 2).
  Still in the tree and NOT removed (they pre-date this step and are not imported by the six): `components/NotComputed.tsx`, `ui/GradeBadge.tsx`, `ui/Tabs.tsx`, `lib/motion.ts`,
  `lib/landing/heroOrder.ts`, `utils/trend.ts`, `lib/constants.ts` (test-only or unused). Vitest 893 passed (91 files), tsc 0, lint 0 errors (17 warnings), build ok;
  e2e design-lab-guard, legacy-redirects, no-advice, ia4-app, v5-pages, markout-card: 49 passed. `chartSourceLine` was written with its tests in one step (not run red first).
- **Step 5: done (reviewer items).** (a) Receipt chart: time ticks are multiples of a round step (`niceTimeTicks`, `timeStep`, `clockTick`; 864 ms over 5 ticks gives
  .200 .400 .600 .800; milliseconds only under a 1 s step) and price decimals are the decimals the stored public trades use (`priceDecimals`; the symbol's tick size is not
  stored, and trade prices are multiples of it, so the decimals they use are the tick's). Hand values in `ticks.test.ts` (red first, 8 failed). (b) The gloss (`BPS_GLOSS`:
  "One basis point is 0.01% of an order's value, so 10 bps is 0.1%.") is printed once on Home, Costs and Orders (e2e in `v5-pages.spec.ts`). (c) "Council" is gone from every
  sentence in `councilStatus.ts` and `AgentCouncil.tsx` ("AI review"; "language model" for the model); a guard test scans their quoted strings and JSX text; red first (8
  failed). Left as they are: identifiers, comments, recorded model text, and the legal pages (`app/legal/content.ts` says "Agent Council" 3 times; it is legal copy: Deepanshu's call,
  recorded under "Waiting for Deepanshu" below). (d) 90% and 20 orders: the backend exports `RANK_LEVEL` and `MIN_GROUP_N` and the rankings route serves those constants instead
  of literals (no behaviour change; backend services and routes tests 698 passed, tsc 0); the Comparisons copy prints the served `level` and `minOrders`, and copy written before
  any body exists reads `app/utils/rankConstants.ts`, which `rankConstants.test.ts` pins to the backend values and scans the copy for literals (red first). (e) The Reports line for
  demos was done in step 3. Guards changed with the word change: `councilStatus.test.ts`, `askView.test.ts`, `auditMode.test.ts` (same sentences, "AI review"). Vitest 928 passed
  (96 files), tsc 0, lint 0 errors; e2e `v5-pages` and `rebuilt-demo`: 14 passed.
- **Waiting for Deepanshu (new):** the legal pages (`app/legal/content.ts`) still say "Agent Council" in three sentences; changing legal copy is yours to approve.
- **Step 4: done (not-computed rows).** Row 4: no whale or markout view in the app (Patterns gone in the last run) and Methodology says so (step 2); the dead whale UI code is deleted in step 6.
  Row 6: the v1 fold says the per-component details were not stored and that the grade itself stays as published, on Costs. Rows 7 and 12: `EmptyState` has an icon and
  14 px text; `ConnectPrompt` (a signed-in account with nothing scored) and the "Not measured yet" and "No grade yet" cards of a real account carry one primary action,
  "Connect an exchange" (`ConnectAction`); demos get no action (nothing to connect); the onboarding checklist stays the next order. Row 8: a missing fee is a dashed
  "pending" cell with its reason (`FEE_PENDING`), never a zero. Row 9: the receipt's empty cost section says "Not measured yet: the next sync measures this order." or
  the stored reason (`costTermsState`; the total line keeps NOT COMPUTED). Row 14 (part, class a): the AI review prints the benchmark line only when measured; for an
  account without a 5-minute average price there is no "insufficient data" line and one sentence says why (the computation from daily files stays later work). Row 15:
  broker-file rows say "no public trade within 5 s before this fill" (`plainReason`), and the Reason column is always visible. Guards changed deliberately, each with the
  reason in the file: `councilStatus.test.ts` (2), `csvCheckView.test.ts` (3 wording), `council-stream-resume.spec.ts` (the line is absent or measured). Red first for
  `costTermsState`, `plainReason`, `parseBenchmarkLine` and `alphaBenchmarkNote`; the empty-state tests (`emptyStates.test.tsx`) and `FEE_PENDING` were written after
  the code (not red first). Vitest 915 passed (95 files), tsc 0, lint 0 errors; e2e auth, council x2, csv x2, rebuilt-demo, no-advice: 23 passed.
- **Step 3: done (pages).** Reports (`EvidencePanel`, `ScoreRecord` and the v1 details on `Card`): a demo gets one line and no NOT ISSUED stamp; a real account gets a
  list of the two signed reports, each with Download and Verify; the record behind the grade is a card. Settings: own shell with the left list (Account, Exchanges,
  API keys, Usage, Data and privacy, About; `?section=`), destructive actions at the bottom of their card behind `ConfirmDialog` (Radix dialog; Cancel closes it without
  acting); Usage prints the AI review allowance from `GET /ml/agents/council/budget` through `usageView.ts` (red first, 6 hand-value tests; a limit that is off prints no
  figure; an unreadable answer is "insufficient data"). Connect: exchange cards (3 columns), page title and the read-only sentence, key form and sheets on the v5 card,
  the refusal banner kept. `/demo`: three cards (total cost in dollars and bps, orders, period, the synthetic line, Open). `/how-it-works`: visible title and the three
  steps above the pinned story (landing motion untouched; "prints" became "public trades"). `/verify`: "Check a signed report", one drop zone, the trusted-key
  explanation printed instead of a pen note, no text under 12 px. `/docs`: left list with the open document marked, bordered 14 px code blocks, 16 px body. Guards
  rewritten with a reason: `api-keys.spec.ts` (goes to `?section=api-keys`; confirm is a dialog), `verify-pack.spec.ts` (title says "report"). New:
  `e2e/v5-pages.spec.ts` (6 specs), `EvidencePanel.test.tsx` (4). Vitest 906 passed (94 files), tsc 0, lint 0 errors (21 warnings), 6 new e2e passed, plus api-keys,
  verify-pack and ia4-app (14 passed earlier in the same run). A fresh signed-in account has no trades, so its Reports page shows "No trades yet" (existing behaviour);
  the real-account list is asserted in the component test. The Evidence panel left Settings (Reports owns it).
- **Step 2: done (9 specs, 0 fixme or skip left in `frontend/e2e`).** `rebuilt-demo.spec.ts` x7 on Costs, Reports, Orders, Flagged orders, Comparisons and Fills with the
  same hand values (total $15.00, 4.3 bps, 3 orders; fees $30.00; unfilled $3.50, 1 order; by type 3 limit orders, execution $10.00; Fills 3 in 3 orders, $1,260.00,
  maker 0%; the strip's execution is the remainder 15.00 - 30.00 - 3.50 = -18.50 because the fixture's total is not the sum of its parts). `score-versions.spec.ts`:
  the locked v1 line beside the measured grade (A, 94.3 from the offline build's 94.34969957374337) and the no-grade state for an account without orders; the v1
  number in the e2e database is the locally seeded audit's (D 59.6), so the pattern is asserted and the published values stay pinned by `gradeInvariance.test.ts`.
  `markout-card.spec.ts`: the card is absent (old address opens Fills) and the class (a) line is printed: new sentence in Methodology "What the audit does not
  include" (PROPOSAL §4 row 4; `data-testid="research-views"`). Added `data-testid="scope-facts"` on Costs. Three specs run: 9 passed. Not changed: any assertion
  that v5 no longer shows (resting-time medians, margin notes) is not asserted as present. Vitest dashboard and methodology 193 passed, tsc 0.
- **Step 1: done (ml-service flaky failures).** Cause: `council_flow` sends a `scope` event first from `loader.scope_counts`, which opens a real
  Mongo client from `MONGODB_URI`. Four tests assert the exact event list and did not patch it (`test_main::test_stream_reports_empty_accounts_as_no_data`,
  two in `test_quick_deep.py`, one in `test_quick_deep_http.py`). With a Mongo that answers, the list gains a `scope` event and the four fail (reproduced
  with a throwaway local mongod: the same 4); with one that does not answer, every flow waits for server selection (~30 s) before `asyncio.run` closes
  (full run 8 min). Production code is correct (a count that cannot be read sends no event). Fix: `tests/conftest.py` autouse fixture makes the loader's
  default client raise at once; a test that wants counts patches it (as `test_council_scope.py` does). Red first: `tests/test_hermetic_database.py`
  (2 of 3 failed). Full suite, 1909 passed, twice (reachable mongod, then the dead URI): 42 s and 43 s. mongod stopped, temp dir deleted.
- The earlier line "Design v5 built" overstated the work: the previous run built steps 1-4 and part of 5 of its own plan, then ran out of turns.

## Orders of 2026-11-24, second: design v5 partly built (its steps 1-4 done, 5 partial, 6-9 open), local commits

- **Next concrete action (superseded by the orders of 2026-11-25 above).** The old line said "Design v5 built"; that was wrong. See `docs/milestones/M8.md` "Design v5 built" for the honest list.
- **Status of the steps:** 1 done, 2 done, 3 done, 4 done, 5 done in part, 6 done in part (words only), 7 done in part (budgets measured and missed, Lighthouse
  and server-rendered first figures not done), 8 done in part (docs rewritten; only `design-lab/v5` deleted, dead v4 code kept), 9 done in part (reviewer run
  and one fix pass; audit5, WebKit, keyboard pass, break-ui and the built images NOT run: out of this run's turn budget). Nothing is BLOCKED by a
  denial; the rest is unfinished work.
- **Final checks:** frontend vitest 896 passed (92 files), tsc 0, lint 0 errors (21 warnings), build ok; backend vitest 1145 passed (135 files), tsc 0; guard table
  214 passed; ml-service pytest 1902 passed, **4 failed** (`test_main::test_stream_reports_empty_accounts_as_no_data`, 3 in `test_quick_deep*`: they pass when
  run alone, no ml-service file changed in this order, cause not found); mcp-server has no vitest suite in its folder (not run). First run of the full e2e: 51
  passed, 26 failed (old words and layouts); after the spec fixes see the last line of this list. **Not done in the specs:** eight v4-layout specs are `test.fixme`.
- **Full e2e after the last change (2026-11-24): 66 passed, 0 failed, 9 skipped** (`test.fixme`: rebuilt-demo x7, score-versions x1, markout-card x1). The
  first run had 26 failures (old words and layouts), the second 3, fixed in the specs (button words, banner test id, section headings).
- **Step 5: done in part (the budget of this run did not allow all of it; see "Not done" below).** Built: `ui/blocks.tsx` (Tile, Card with an
  info popover, CostBreakdown, GradeRange) and `ui/charts/AppCharts.tsx` (Recharts: TypeBars as one stacked bar per order type with the
  negative parts named beside it and a $0 axis; PricePrintsChart for the receipt), `ui/charts/CompareBars.tsx` and `ticks.ts` (round
  ticks, tested). Home: four KPI tiles (`tiles.ts`, hand-value tests), Costliest orders (served costs, a receipt opens from a row; replaces
  the 245-bar chart because the server serves no per-order distribution), Where the cost came from, Ask. Costs: tiles, the cost parts, order
  types, grade card with the locked v1 line, Against the cost estimate (designed state "Needs 20 market orders; this account has N",
  `costsView.ts`), what it covers, the bps gloss once. Orders: Cost ($) and Cost (bps) are default columns, 13 px sentence-case headers, 44 px
  rows, "modelled, not paid" under an unfilled cost, "No fills" for maker share, row cards on phones, the demo fee column reads
  "Fees (published rate)". Receipt: 14 px lines (13 px on phones), nothing under 12 px, a Recharts chart of the stored public trades
  with the fills diamonds and the placement time. Fills: one page (tabs and Patterns removed; no not-computed sentence for accounts
  without v1 fields). Flagged orders and Comparisons rebuilt (bars with 90% whiskers and a zero line, "Too few orders to compare" with
  counts, venue comparison only with two venues, a Connect line for real accounts). AI review: summary first, four sections named
  Liquidity, Benchmark, Risk, Fees, each model text under its language-model heading, "Short review (1 AI call)" and "Full review (9 AI
  calls)", "Start review". Check an exchange export (D13). Settings: About prints the versions that left the sidebar. Guards changed
  deliberately, each with a reason in the file: contrast, theme names, ordersColumns, receipt copy (public trades), fillsView (class (a)),
  agent labels, review mode words, the " · " ban (one exemption: the provenance banner's fixed words). Vitest 890 passed, tsc 0.
  **Not done in step 5:** the Settings left-list shell (§3.4), the Connect page restyle, the Reports page restyle (still the v4 layout in the
  new tokens), the onboarding checklist, a side-by-side receipt sheet (the chart is inside the receipt), D8 rows 5 to 16 only where listed
  above (rows 6 to 9, 12 to 16 are not changed beyond the wording they already had).
- **Step 4: done (D1, D13).** Routes: `/app/costs` (was overview), `/app/flagged` (rules), `/app/compare` (rankings), `/app/review` (council),
  `/app/reports` (evidence); Home, Orders, Fills, Check, Settings, Connect unchanged. `legacyRedirects.mjs`: the six `/dashboard?view=`
  rows and the five `/app/<old>` rows point straight at the final route (one hop, query kept); `/analytics` goes to `/app/fills` (no
  Patterns tab). Unit tests added: no chains, every destination and every sidebar path has a `page.tsx`; e2e `legacy-redirects.spec.ts`
  extended to 16 cases (16 passed against the production build). Vitest 878 passed, tsc 0.
- **Step 3: done.** `AppFrame` rewritten: sidebar (248 px, 64 px rail from 1024 to 1279 px) with lucide icons in three groups (Home, Costs,
  Orders, Fills; Review: Flagged orders, Comparisons, AI review; Tools: Reports, Check an exchange export), Docs, Settings (signed in), the
  Light / Dark / System control and the account; the account switcher ends a long name in an ellipsis with the full name in a tooltip;
  versions left the sidebar. Full-width 14 px provenance banner (`ProvenanceBanner`: demo sentence, or a page's own source text; none for
  the user's own data, whose header shows the "Your exchange data" label). Page header: 24 px title, one sentence, the period as a
  disabled label with the tooltip "Period choice comes next" (`PeriodLabel`), the page's actions in a slot (`AppPage` takes `primary` and
  `more` for the one primary action and the "⋯" menu). Phone: top bar (logo mark, page title, search, account), bottom bar with icons and
  12 px labels, More sheet. ⌘K: `CommandMenu` is a dynamic import mounted on the first open (key or button). `data-app` wraps every app
  page, and `AppScope` marks `<body>` so portals wear the app tokens. Section ids and paths are unchanged until step 4. Tests:
  `shell.test.tsx` (banner, period label, sidebar model), `nav.test.ts` (labels and groups). Vitest 871 passed (90 files), tsc 0.
- **Step 2: done (D2 b, D3, D5).** Geist Sans variable (OFL, from the `geist` 1.9.2 tarball, `app/fonts/geist-sans-variable.woff2`, no new
  dependency) is `--ui-font` for all UI text; Cabinet Grotesk is `--ui-display` (page titles, KPI figures, hero headline, receipt title and
  total, stamps); Departure Mono unchanged. Themes are `light` / `dark` (next-themes, default System, key `fs-theme-v5`); the roots stay the
  paper tone (marketing, receipt, stamp); `[data-app]` gives the same role names the neutral grey ground and white cards, and
  `[data-app] .fs-paper` takes the paper values back for printed objects. New tokens: series 1-3, grid, axis, banner, accent-soft. Theme
  control: sun / moon / monitor button with a Light, Dark, System menu. `contrast.test.ts` parses blocks by selector and covers the app
  palette in both themes (hand value: banner text 8.87:1); `lib/format.ts` promoted from the lab with the "never -0.00 / -0.0" test.
  `headerAction.test.tsx` theme case changed deliberately (the names Paper and Carbon copy are retired; the intent, that the control says
  which theme is on, is kept). Vitest 863 passed (89 files), tsc 0. The e2e-shots scripts still set the old `fs-theme` key: updated in step 9.
- **Step 1: done (D10).** Landing hero on short phones: below 768 px the hero box now grows with its content
  (`min-height: max(100svh, 600px)`, stage `minmax(340px, 1fr)`), so the headline block no longer sits over the tape, its label or the
  amounts list. e2e `landing-short-phones.spec.ts` (393x659, 375x667, 360x640): red first (strip bottom 448 against copy top 336, 351
  and 250), green after.

## Orders of 2026-11-24: design v5 (step 0 Binance 418 fix, audit, research, proposal, prototype), local commits

- **Next concrete action: Design v5 proposal ready: Deepanshu chooses (docs/design/v5/).** Decisions D1-D13 in PROPOSAL §9.
- **Step 7: done.** One reviewer (Sonnet, read-only): 4 high, 12 medium, 11 low; fixed or kept with a reason (PROPOSAL §11). The audit
  re-run on the seven prototype pages (70 states): smallest text 12 px (was 10), 0 text nodes under 12 px (was 2,508), 0 caps runs
  under 12 px (was 220), 0 phone taps under 44 px (was 232), contrast 0 (was 0). Lighthouse mobile on the prototype: 51 / 60 / 69
  (before 59 / 50 / 49); app LCP about 5.0 s (was 8.1 s); budgets not met (no performance work in the lab; PROPOSAL §10).
  **Checks (2026-11-23):** frontend vitest 828 passed (88 files), tsc 0, lint 0 errors (21 warnings: the 19 before plus 2 unused
  destructured names in `e2e-shots/audit5.ts` and `refs5.ts`), build ok; lab guard spec `e2e/design-lab-guard.spec.ts` 15 passed;
  backend vitest 1145 passed (135 files), tsc 0. ml-service 1906 passed at step 0 (untouched after). Servers stopped; 2 e2e Mongo
  temp folders deleted; Lighthouse's stray `C:\...` profile folders deleted (cause and fix in LOG §AN).
- **Not verified:** Safari/WebKit (cannot start on this host, see step 1); the Ask answers, Flagged orders, Comparisons, AI review,
  Reports, Docs and Settings pages were proposed, not prototyped; the period picker's presets need server windowing (D6).
- **Waiting for Deepanshu:** the design choices (D1-D13); the push of the step 0 fix (production 418 relief; it changes Render and
  Vercel behaviour: market data and the probe move to data-api.binance.vision); optionally `sudo npx playwright install-deps webkit`
  so the audit covers Safari (D11).
- **Step 6: done.** `frontend/app/design-lab/v5/`: landing hero, Home, Costs (route `/overview`), Orders with the receipt sheet and the
  public-trades chart, Fills, Check a broker file; sidebar of nouns with icons, page header with the period control, provenance banner,
  phone top bar and bottom bar with More sheet, Light / Dark / System. Data: the offline fixtures and the stored demo prints, through
  the production view models; formatter tested (`lib/format.test.ts`, 5). 22 images and `docs/design/v5/README.md` (before beside
  after). The e2e guard spec lists the six v5 paths. First after-run of the audit on the prototype: 70 states, 0 errors, smallest text
  12 px, 0 under 12 px, 0 contrast nodes, 0 phone targets under 44 px.
- **Step 5: done.** PROPOSAL §0-§3, §5-§9: word table (33 terms, invariant words kept), readability rules and one style per number kind,
  the shell (sidebar groups, page header with period and one action, cards, tables, empty states, settings, phone), every page, charts
  per data shape, motion, budgets (`/` 300 kB, `/app` 340 kB; Lighthouse marketing 85+, app 75+), 12 decisions with recommendations.
- **Step 4: done.** PROPOSAL §4: 17 surfaces with file:line and class: (a) remove for accounts that never have it (v1 per-fill score and
  grade, Patterns tab, whale correlation, Council VWAP line for now), (b) compute server-side (each fill against the public price, test
  plan with hand values), (c) designed empty states with the next action (header figures, fees pending, receipts, venue comparison);
  true findings keep "insufficient data" with the missing count.
- **Step 3: done.** `docs/design/v5/FEATURES.md`, top 8: period picker with comparison to the previous period; each fill against the
  public price at its second (demo print coverage 82.9% / 84.0% / 77.9%, LOG §AN); onboarding checklist; sample-data switch; changelog
  with scoring versions; usage page; saved views; status page. Weekly email ranked 9th (needs an email provider: approval).
- **Step 2: done.** `docs/design/v5/REFERENCES.md`: 21 public pages captured and measured at 1440 and on a Pixel 8 (`e2e-shots/refs5.ts`,
  `refs/measures.json`; Koinly and CoinTracker desktop pages were Cloudflare checks, deleted); the cal.com app seen through Deepanshu's
  login (described in words, captures private); 16 libraries read with license, version and size (one read-only Sonnet research
  subagent). Not verified, so not adopted: Origin UI, Aceternity and 21st.dev licenses; Tremor on React 19.
- **Step 1: done.** `docs/design/v5/AUDIT.md`: 200 states (20 pages x 5 viewports x light/dark), 0 errors; smallest text 10 px, 3,670 text
  nodes under 12 px on 14 pages, 1,184 letter-spaced caps runs (280 under 12 px), axe contrast 0, 588 phone taps under 44 px; Lighthouse
  mobile 59 / 66 / 50 / 49 (LCP 4.3 / 4.2 / 8.1 / 8.1 s) on `/`, `/demo`, `/app`, `/app/orders`. Top finding: the landing hero's receipt
  overlaps the headline on a 393x659 phone. Scripts: `e2e-shots/audit5.ts`, `audit5-summary.mjs`, `lighthouse5.mjs`, `mock-server.ts`;
  `mock.ts` gained the server's answers for a rebuilt demo's v1-only views (Patterns showed a fixture gap before).
- **Step 0: done.** Public market data moved off api.binance.com to data-api.binance.vision (Binance lists aggTrades, exchangeInfo, klines
  and time there): backend klines (`MarketDataService.ts`), history-sync exchangeInfo (no key header), the reachability probe, the Vercel
  `/api/preflight` route, ml-service aggTrades and klines (`measure/data/rest.py`, `klines.py`; new refs say `data-api.binance.vision`), the
  receipt's source link. A second governor (`binanceDataGovernor`) holds the market-data budget and pauses; signed calls stay on
  api.binance.com under `binanceGovernor`, whose state the probe now reports as `accountApi` without sending anything. Smoke prints a
  second line for the account API. Finding: our own traffic cannot explain the ban (no real account syncs; the probe sent one weight-1
  request); Render's outbound ranges are shared across the region. LOG §AN step 0 (callers table, what a user sees during a ban, what
  to look for in the Render logs). Tests red first (21 backend, 4 ml, 1 frontend), then: backend 1145 passed (one existing case updated)
  and tsc 0; ml-service 1906 passed; frontend 823 tests, 822 passed in the full run and the one failure (`MarginNote.test.tsx`, timing,
  run under the audit's load) passed 2 of 2 alone; tsc 0.
- **Deviation (step 1):** WebKit cannot start on this host (missing GTK 4 and GStreamer libraries; `sudo npx playwright install-deps webkit`
  needs a password, which this run does not handle). The iPhone 15 profile is measured in Chromium with the same viewport, user agent
  and touch, and each row records its engine.
- **cal.com app:** Deepanshu logged in to the headed browser (temporary profile, deleted after); 12 captures of the app were taken. They
  show his username and avatar, so they stay in `.work/refs-private/` (gitignored); REFERENCES describes them in words.

## Orders of 2026-11-23, seventh: IA v4 polish (Part A) and typed claims for Ask (Part B), local commits

- **Next concrete action: IA v4 polish and typed claims for Ask: ready for Deepanshu's review.**
- **Status of every step:** A1 done, A2 done, A3 done, A4 done, A5 done (deviation: no Node egress guard or governor applies, the ml-service gate does; see A5 below), A6 done
  (suspect not confirmed, no code change), A7 done (3 commits), B1 done, B2 done, B3 done, B4 done. Nothing BLOCKED. **Live calls for Part B: 56 of 60** (48 for B3, 8 for the
  re-recording after the review), no 429, no stop, usage in memory, no Atlas write, nothing pushed.
- **QA and review: done.** qa3 pass 8 on the post-review build: 117 states, 0 problems, landing CLS 0 (1440 and 390); keyboard pass 29 of 29; break-ui all OK; Ask print 13 of 13.
  One reviewer (Sonnet): 2 high findings (a false interval sentence in the claims path; a validator matching by unit only), a limiter that counted failed checks, and smaller
  items: fixed, with tests, claim rules 1.1.0 and the four Home answers recorded again (`ask-recorded-claims-1.1.0.json`); the rest kept with a reason (LOG §AM).
- **Final checks (2026-11-23):** frontend vitest 822 passed, tsc 0, lint 0 errors (19 warnings), build ok; e2e full 61 passed, 2 failed on my fee wording, fixed, 17 passed over
  the four specs touched; backend vitest 1136 passed (134 files), tsc 0; ml-service pytest 1905 passed (9 deselected); evals offline 0 violations, ablation --check exit 0;
  mcp-server 26 passed; guard table 214 passed; roadmap ids ok. First Load JS: `/` 329.5, `/app` 401.6 (budget 404.6), `/app/overview` 401.6, `/login` 317.0 kB.
- Report: `docs/milestones/M8.md` "IA v4 polish"; images `docs/design/IA-v4/polish/` (8); ADR-0018 final state; README Evaluation; LOG §AM.
- **B3 and B4: done.** 12 questions committed first (`4dc47d6`), then 48 live calls of the cap of 60 (no 429, no stop): old path 5 written, 7
  degraded, 0 schema-invalid, 2.00 calls; new path 12 used, 0 degraded, 0 schema-invalid, 2.00 calls. Table in README Evaluation, LOG §AM, M5.md.
  Found: the new path omits what it has no claim for (no count claim; 3 claims at most) and prints `>-0.01 bps` for a tiny value. B4: the four
  new-path runs of the Home questions are the recording, verbatim, `frontend/app/lib/ask/ask-recorded-claims.json` (old file untouched); all four
  passed. UI: a claims answer has no language-model heading, one line says "The model chose which measured values to state; code wrote the
  sentence and placed the figures", the credit reads "Claims chosen by <model>"; `askView`/`askRecorded` tests; e2e `ia4-app.spec.ts` updated.
- **B2: done.** `ml-service/agents/ask_claims.py` (9 claim types, templates, validation, strict schema, prompt), `ask_flow(mode="claims")` in
  `agents/ask.py` (the free path is the default and unchanged), `ask_service.ASK_MODE = "claims"` (production), `LLMRouter.complete(response_format=)`
  sent to Groq candidates only (by provider, not model name: `tests/test_llm_router.py` forbids model names outside the YAML, and the YAML hash
  keys the Council cache so the YAML was not touched), `ASK_PROMPT_VERSION` 2.0.0 and `ASK_CLAIM_RULES_VERSION` 1.0.0 in `config/versions.py`.
  Tests `tests/test_ask_claims.py` (35, hand values $16.00 / 4.0 bps / 2.0 bps / $2.00 / order B $8.00): a valid set renders the exact
  sentence; a digit in a value id, an unknown id, a unit mismatch (bps in a dollar slot), an empty set, 4 claims, a repeat, a mixed-rank order
  claim, free text with a digit and extra keys each give the degraded answer unchanged. `test_ask_http.py` expectation moved to the claims sentence
  (the same $8.00). ml-service targeted suites 268 passed; the full suite runs at the end.
- **B1: done.** ADR-0018 is "Accepted (Ask only)" with the claim schema (9 claim types, 1 to 3 claims, ids and no digits), the validation, the
  Groq facts (strict `json_schema` listed for gpt-oss-20b, gpt-oss-120b, qwen3.8-27b; streaming and tool use unsupported with it; page read
  2026-11-23, first ~40k of ~75k characters verbatim), the unchanged degraded fallback, and the version bumps (Ask-only `ASK_PROMPT_VERSION`
  2.0.0 and `ASK_CLAIM_RULES_VERSION` 1.0.0; the Council's 1.8.0 and 1.4.0 are not moved because the goldens pin them).
- **A7: done.** PR #11 lucide-react 0.577.0 -> 1.75.0 = `f59bf51`; PR #12 jsdom 29.1.1 -> 31.0.1 = `2e5f336`; PR #13 eslint 9.39.4 -> 10.15.0 =
  the "Bump eslint to 10.15.0" commit after them. After each: tsc 0, vitest 818 passed, build ok; lint 0 errors, 19 warnings (the same 19 as before)
  after lucide and jsdom and after eslint 10. The PRs stay open for Deepanshu to close (nothing merged, nothing pushed). Caveat on #13: eslint
  10 runs with `eslint-config-next@16.4.5`, but its plugins (`eslint-plugin-import`, `jsx-a11y`, `react`, `react-hooks`) declare peer ranges up to
  eslint 9, so `npm ls` shows them as "invalid"; `npm ci --dry-run` passes and the warnings did not change. If CI complains, revert that one commit.
- **A6: done, suspect not confirmed, no code change.** Clean rebuilds with `scripts/first-load-js.mjs` (gzip kB, `/app` = `/app/overview`):
  step 6 (`339c5b0`) 397.8; IA v4 final (`178ed95`) 398.2; HEAD after A1-A5 398.9. The "400.9" in M8.md "IA v4 built" does not reproduce from a
  clean build of `178ed95` (the rise from step 6 is 0.4 kB, not 3). The ⌘K fix (`120ceee`, `components/ui/command.tsx`) wrapped the dialog's
  children in `<Command>`, a two-line change in a module the shell already imported: `cmdk` was in the `/app` first load before the fix
  (chunk `1r5k8l2hq-ibn.js`, 11.7 kB gzip, named in `/app/(shell)/overview`'s client manifest), so it was not pulled in by it. Because the
  suspect is not the cause the order's condition ("if so") is not met and the palette still loads with the shell; loading it on first open
  would take 11.7 kB off `/app` (listed under ideas).
- **A5: done.** "Try the sample file" on `/app/check` for everyone (signed out, demo, signed in). File: `ml-service/csv_import/sample/kraken_sample.csv`
  (24 synthetic Kraken rows, fee 0.1% of cost; times and prices are real BTCUSDT aggTrades prints of 2026-09-02 to 09-05, fetched
  2026-11-23 from api.binance.com; pinned by SHA-256 in `csv_import/sample.py`). Why not Jan 2024: Binance REST aggTrades answers `[]` for
  Jan 2024 today and its coverage rolls (BTCUSDT answered 2024-12-23, not 2024-09-14), so the file sits in Sept 2026 and will age out of the
  REST source in about two years: the date to re-cut it is recorded in LOG. Path: browser -> `POST /api/check/sample` (backend, no login,
  `routes/checkSample.ts`: per-IP 3 an hour then 200 a day overall, express-rate-limit, `req.ip` under `TRUST_PROXY_HOPS=2` from
  `render.yaml`) -> ml-service `POST /internal/csv-sample` (service token for the label `sample-file`, same `run_check`, same `gate`: 2 at once and
  a pause after a 418/429, one fixed Binance host) -> result plus `sample` marker; the page prints "Sample file: synthetic fills, real prices".
  **Deviation to report:** the "egress allowlist and Binance governor" are Node-side objects (`exchangeEgress.ts`, `binanceGovernor.ts`) that guard
  the backend's own exchange calls; the check's prints are fetched by the ml-service, so the equivalents that apply are its `gate` and its single
  constant host (`measure/data/rest.py:20`). The backend route makes no exchange call. Nothing stored, no file content logged (the file is a
  constant of the code; no upload). Tests: backend `checkSample.test.ts` (8: limiter hand cases 3+1, 3+2 then C, refused-IP-not-counted,
  trust-proxy spoof), ml `test_sample.py` (6: 24 fills, pinned hash, hand tape 0.0 bps + 10.0 bps fee, service token, pause), frontend
  `csvCheckView.test.ts` (+3), e2e `csv-sample.spec.ts` (3, with the answer mocked at the page; the real-backend one proves signed-out access, the
  503 "not configured" sentence and the 4th-call refusal). Live: `run_sample(rest_source)` measured 24 of 24 in 8.8 s. ARCHITECTURE.md route and
  limiter tables updated. Suites: ml-service 1858 passed, backend 1133 passed (134 files).
- **A4: done (code and unit tests; look and keyboard pass at QA).** The three icon-only header buttons (`DashboardContent.tsx`): **Method**
  opens the "How this audit was measured" side sheet; **Copy share link** (demo accounts only) copies the public share link; **Download
  report** downloads the PDF report. Each is now a `HeaderAction` (`appshell/HeaderAction.tsx`): visible text from 1024 px (`lg`, was `2xl`),
  below that the icon with `aria-label`, a tooltip and a 44 px target. The theme control reads "Theme: Paper" / "Theme: Carbon copy" and is a
  `role="switch"` with `aria-checked` (true = Carbon copy) (`shell/ThemeToggle.tsx`, words in `themeToggleView.ts`). Tests
  `appshell/headerAction.test.tsx`.
- **A3: done.** Removed: the "Synthetic trader, real prices" span in the Orders panel actions (`OrdersView.tsx`, under the Orders title; the
  header chip prints it) and the line under the hero's buttons (`TapeHero.tsx`; the tape label prints it). Test `provenance.test.tsx`
  (hero prints it twice: label and phone receipt). Kept, with a reason: the hero phone receipt, the `/how-it-works` receipt and its
  chapter line, the landing's end figure line (`StoryEnd`), the `/demo` slips and `DemoCards` (printed objects that can be screenshotted
  alone), the share card and its OG image, the order receipt, the Overview facts table "Data" row (a printed spec table), the account
  switcher's menu label (a menu, not page copy), the `/demo` intro sentence (the marketing bar has no chip). Dead code left: the Overview's
  `sampleNote` line is no longer passed (`DashboardContent.tsx:291`).
- **A2: done.** Fills: heading "Fills", "N fills on <venue>", tile "Fills", time `YYYY-MM-DD HH:MM:SS` under "TIME (UTC)" (Orders' `formatUtc` and
  header style), full symbol. Rules in `trades/fillsView.ts` (tests `fillsView.test.ts`, 10): a measure every loaded row lacks (slippage, score,
  grade; the score also takes the Average score tile) is left out, and the line `fills-not-computed` says which and why. The reason is read from
  the code that decides it: `backend/src/routes/audit.ts:139-142` (`hasV1Trades`) and `:146` (`v1Flag`) give `v1Computed: false` on the trades
  route (`:602`) for a demo none of whose trades has a v1 score, because v1 enrichment "needed invented arrival prices" (`:139-141`); the
  sentence says none was invented. Mixed columns keep their per-cell ValueState. e2e `rebuilt-demo` and `no-advice` selectors updated.
- **A1: done.** Fee line reads "Fees (published rate)" on the order receipt (`costLineLabel`, `receiptCopy.ts`), the `/how-it-works` mini
  receipt and the hero's phone receipt; tests `receiptCopy.test.ts`, `components/marketing/feeLine.test.tsx`. Other plain fee lines found and
  left (not receipt lines of the decision): Orders "Where the money went" totals row (`ordersView.ts:44`), Orders Fees column header
  (`OrdersView.tsx:55`), cost strip part label (`costStrip.ts:42`, its dashed part prints the published-rate caption), Overview rows
  (`Overview.tsx:201`, footnote at `:218`), month-tape tooltip FEES (`MonthTape.tsx:225`), score v2 shortfall term (`scoreV2.ts:81`),
  the hero tape's pen-note title "Fees" (`TapeHero.tsx:23`), Fills ledger "Fee" column (`TradesLedger.tsx:422`).

## Orders of 2026-11-23, sixth: IA v4 built in production (local commits)

- **Step 8: done.** The dashboard tab bar and "More" menu code left with `shell/AppShell.tsx` (step 2). The lab prototype `design-lab/ia4` is
  **deleted** (reason: nothing in production imports it, production replaced it, its tests asserted the old Ask view model that this order
  changed; the proposal's images stay in `docs/design/IA-v4/`, the guard spec keeps its paths). ARCHITECTURE.md section 4 rewritten (frame,
  routes and screens, redirects, qa3); README line, the MCP runbook (public, neutral, `/app/settings`), FIRST_REAL_USER, FREE_HOSTING and
  DEMO_SCRIPT paths updated in step 1; `scripts/smoke_prod.sh` has no page path (it checks API routes and the frontend's `/api` proxy), so it
  needed no change.
- **Next concrete action: IA v4 built: ready for Deepanshu's review.**
- **Step 9: done.** e2e: full run 60 passed (first run 8 failed on old routes and the old "Sample data" text, fixed by selector and route changes
  with a reason in each spec; new specs `ia4-app.spec.ts` 6 and `legacy-redirects.spec.ts` 11). qa3: 110 states, 0 problems, landing CLS 0, also
  with reduced motion; keyboard pass 16 of 16 (found and fixed a palette defect that predates this order); break-ui 48 of 48; Ask print 17 of
  17. One reviewer: 13 findings, 9 fixed, the rest kept with a reason, one older open item for Deepanshu (fee line on the receipt, M8.md
  "Review"). Final checks: frontend vitest 796 passed, tsc 0, lint 0 errors, build ok; backend vitest 1125 passed (133 files), tsc 0; ml-service
  pytest 1852 passed (9 deselected); mcp-server 26 passed; guard table 214 passed; roadmap ids ok. First Load JS: `/` 328.8, `/app` 400.9,
  `/app/overview` 400.9 (budget 404.6), `/login` 316.8 kB. Live LLM calls this order: 4 (step 0b). Atlas writes: none. Nothing pushed.
  Report: `docs/milestones/M8.md` "IA v4 built"; images `docs/design/IA-v4/built/`.
- **Earlier text:** Step 8 (cleanup: ARCHITECTURE.md section 4, README and runbook paths, smoke script paths), then step 9 (e2e specs to the new routes, qa3 run, break-ui, keyboard pass, reduced motion, one reviewer, final checks, M8 report and images).** Steps 0 to 9 follow the order; each is committed locally when done.
- **Step 7: done.** qa3 (`e2e-shots/qa3.ts`, rewritten for the new routes: 36 marketing and app states, apps also at 320, Carbon copy for Home,
  Overview, Orders receipt and Council): 110 states, landing CLS 0 at 1440 and 390, after fixes 0 with overflow, overlaps or axe problems on the
  states re-run. Fixes: Orders ledger default columns by width (`defaultOrderColumns`: 390 time, symbol, side, cost; 320 time and cost with
  the symbol under the time; a new "Cost" column from the server's per-order cost, one menu away on a desktop); the Settings evidence
  envelope no longer forces 10 px of page overflow at 320. The receipt is a Vaul drawer on a phone, Council and Rankings stack, Fills has its
  two tabs, the file check is the native file control, Settings has its own shell. Checker fixes (not product): text clipped by a scroll box
  and wrapped inline boxes no longer count as overlaps.
- **Step 6: done.** Receipt: first open of a session feeds in 420 ms on the drawer curve with its lines printing 18 ms apart (at most 360 ms),
  later opens 300 ms plain, tear 220 ms (`paper.css`; the phone drawer carries `data-enter` too); Ask slip prints (step 3); sidebar
  underline 180 ms; page fade 160 ms + 8 px keyed by pathname (a Fills tab change does not replay it); pen nib on the hero tape
  (`PenNib.tsx`, fine pointer only, quickTo 90 ms, off under reduced motion, no mark). DESIGN.md: layout section rewritten for the two
  shells, motion bullet, new section 12 "Numbers", decisions log is section 13. **Bundle (First Load JS, gzip, `scripts/first-load-js.mjs`):**
  `/app` 397.8 kB, `/app/overview` 397.8 kB against the budget 389.6 (`/dashboard` before) + 15 = 404.6 kB; `/` 325.9, `/login` 313.9.
- **Step 5: done.** Top bar (How it works, Demo, Verify, Docs, Log in, Open the demo; signed in: Open the app), phone Menu as a Vaul receipt
  sheet with the account actions pinned, footer with Product, Docs, Trust, Legal (every link exists), `/demo` (three slips: name, line,
  orders, fills, period, total bps from the API, the synthetic line), `/how-it-works` (HowItReads, left the landing, which keeps the hero
  button "How it works"), `/docs` hub + `/docs/mcp` + `/docs/package` (rendered from copies of the runbook and the package README in
  `app/docs/content/`, drift-tested; a 90-line Markdown renderer, no dependency, no raw HTML; the runbook lost its personal address and
  local path), `/methodology` and `/verify` use the new bar and footer. **Deviation from the order:** the tape label prints
  "One demo order · Jan 28, 2024 · synthetic trader, real prices": the order's date is 28 January 2024 in the fixture (`tape.date`, order
  `createdAt` 2024-01-28T20:41Z), not 31 January; a wrong date would be a fabricated fact, so the label reads the date from the data.
  The dots are drawn by CSS. Frontend vitest 792 passed, tsc 0, eslint 0 errors; looked at 8 pages at 1440 and 390 (axe 0, overlaps 0).
- **Step 4: done.** Overview, Orders, Rules, Rankings, Council, Evidence unchanged apart from the frame (Ask left Council; the broker-file
  check left Evidence). Fills (`/app/fills`) has two tabs, Ledger and Patterns (`?tab=patterns`; links, no motion): `TradesLedger` and
  `Patterns` are today's Trades and Analytics bodies. `/app/check` opens signed out and in demo mode (header text "Your file, public
  prices"; a banner says the check itself needs a signed-in account, which the ml-service enforces); `/app/connect` is the onboarding page;
  a signed-out visitor to `/app/*` without a demo account goes to `/login` (Home, Fills tabs; Settings and Connect already did).
  `e2e/legacy-redirects.spec.ts`: 11 passed against the real stack (each old URL 308 and lands on its new page, query kept). QA tooling:
  the mock pages `/audit/trades` like the real API and `checks()` skips text cut off inside a scroll box (both were false overlaps).
  Frontend vitest 777 passed, tsc 0.
- **Step 3: done.** Home (`/app`): `dashboard/AskHome.tsx` (demo: recorded chips, no input box, "Recorded answer, not live", code-built scope
  line "January 2024, 245 orders", passed answers first and degraded last; live: the existing agent, 2 units, four suggestion chips;
  blocked: disabled with "Ask needs measured orders." plus the connect empty state), `dashboard/HomeFigures.tsx` (chapters 01 total and
  02 grade as the small stamp, "Scoring v2.3.0 (measured), range 92.5 to 94.1", fees "not independently measured", "Read the full
  overview"). `askView.ts`: a degraded answer prints the one line and the meta "Model calls: 2 · answer not used", no model name, no LLM
  heading; the heading only over model text. Recorded fixture moved to `app/lib/ask/ask-recorded.json` (own chunk, loaded on demo pages
  only). Ask left the Council page (`AskPanel.tsx` deleted). Print CSS: paper and first line start in the same frame
  (`e2e-shots/ask-print.ts`: 17 checks pass, motion and reduced motion; axe 0, overlaps 0). Design test `rebuiltCopy` has one exempt
  line (the order's exact meta string). The IA v4 lab prototype `design-lab/ia4` is deleted (its tests asserted the old view model;
  nothing imported it; the guard spec keeps its paths). Frontend vitest 777 passed, tsc 0, eslint 0 errors.
- **Step 2: done.** Persistent frame in `app/app/(shell)/layout.tsx` -> `components/appshell/AppFrame.tsx`: sidebar (232 px; rail
  1024-1279 px with a toggle; account switcher only, no provenance), nine nouns with the pen underline (180 ms), bottom group
  (public score card for demo accounts, Methodology, Settings only when signed in, Carbon copy, versions read on the server from
  `methodology.json`, log in/out), page header on every app page (ProvenanceChip + the demo note behind a pen mark, account, period,
  venue, actions slot), phone bottom bar Home/Overview/Orders/More with a Vaul More sheet with one-line glosses, ⌘K lists the nine with
  glosses. Pages report their header through `AppPage` (`appshell/shellContext.tsx`). Settings has its own shell with Back
  (`SettingsShell`). The old top bar and "More" menu (`shell/AppShell.tsx`) are deleted. The overview's own "Sample data" line is gone
  (provenance prints once, in the header); e2e specs that read that text are updated in step 9. Class prefix `fa-` (`.fs-side` exists in
  landing.css). Looked at 1440, 1100 and 390: overflow 0, axe 0. Frontend vitest 778 passed (80 files), tsc 0, eslint 0 errors.
- **Step 1: done.** Routes `/app`, `/app/{overview,orders,rules,rankings,council,evidence,fills,check,settings,connect}` exist as thin
  wrappers over the old page bodies (kept in their feature folders: `dashboard/DashboardContent.tsx` takes a `view`, `trades/TradesLedger`,
  `analytics/Patterns`, `check/CheckFile`, `settings/SettingsPage`, `onboarding/ConnectExchange`). `frontend/legacyRedirects.mjs` (308,
  imported by `next.config.mjs`) + unit test (17) + measured with `next start` (every old URL 308, query kept; the old `view` stays in the
  forwarded query and is ignored). `/app` shows the overview until step 3; `/app/check` still needs login until step 4;
  `e2e/legacy-redirects.spec.ts` is written and runs in step 4/9. Old paths updated in frontend links, the OAuth return (`/` then `/app`;
  the provider callback URLs point at the backend and are unchanged), billing success/cancel URLs (backend, Stripe is off), README, 4
  docs, and path lists in 4 invariant tests (same scan coverage). No setting outside the repo changes for this step.
- **Step 0: done.** 0a: smoke and the probe read the same route (`/api/preflight/exchanges`, `ExchangeReachability.ts`, 60 s cache); a
  200 then a 418 seconds apart cannot come from stored state (a cached answer would repeat the 200); the real defect was the smoke line
  calling a cached answer "just now", fixed with a test (LOG §AL 0a). 0b: 4 live calls spent, both re-recorded answers degraded, kept
  verbatim (LOG §AL 0b). The provisional "shared egress IP" reading of §AK 0c is unchanged: still waiting for Render logs.

## Orders of 2026-11-22, fifth: two fixes, the production 418, IA v4 research and proposal (local commits)

- **Next concrete action: superseded by the sixth order above.** Also open: Deepanshu's probe output and
  Render log lines for the 418 (step 0c).
- **Step 4: done.** One reviewer (Sonnet, read-only): 15 findings (3 high, 8 medium, 4 low); 10 fixed in the prototype and proposal, 5
  kept with a reason (table in PROPOSAL.md section 9). Final checks: frontend vitest 760 passed (79 files; the pre-existing timing test
  `MarginNote` "opens on click and closes on Escape" failed once under full-suite load and passed on the rerun; this order does not touch
  it), tsc 0, lint 0 errors (17 warnings), build ok, `design-lab-guard.spec.ts` 9 passed, `ia4-shots.ts` PASS (10 states, overflow 0,
  axe serious/critical 0, reduced motion finished); backend vitest 1124 passed (133 files), tsc 0; ml-service pytest 1852 passed,
  9 deselected. First Load JS: `/dashboard` 389.6 kB; lab app 311.9 kB vs lab index 308.3 kB. Live LLM calls this order: 8 (the
  recorded Ask fixture, free tier, usage counted in memory). Atlas writes: none. Nothing pushed.
- **Step 3: done.** Prototype `frontend/app/design-lab/ia4/` (site: top bar, tape hero, demo entry, footer; app: sidebar, phone bar
  with More sheet, Ask home with 4 chips playing the recorded answers as a printing receipt slip, key figures from fixtures). 11 images
  and README in `docs/design/IA-v4/`. Checks: frontend vitest 760 passed (79 files), tsc 0, lint 0 errors (17 warnings), build ok,
  `design-lab-guard.spec.ts` 9 passed (ia4 paths added), `e2e-shots/ia4-shots.ts` 10 states: overflow 0, axe serious/critical 0,
  slip animated with motion and not under reduced motion. First Load JS: lab app 312.0 kB vs lab index 308.3 kB (+3.7 kB);
  `/dashboard` 389.6 kB.
- **Step 2: done.** `docs/design/IA-v4/PROPOSAL.md`: sitemap (marketing 5 items; app sidebar of 9 nouns + bottom group), Ask home
  with 4 chips, page inventory with 308 redirects for every moved route, proposed DESIGN §12 "Numbers", interaction and bundle
  budgets, phone plan, open questions. The Ask answers for the prototype were recorded from the real `ask_flow` on the committed
  demo-moderate files (`ml-service/scripts/record_ask_fixture.py`; 4 questions x 2 calls, groq qwen3.8-27b, in-memory usage store,
  no Atlas): `frontend/app/design-lab/ia4/fixtures/ask-recorded.json`, verbatim (1 of 4 degraded to the code-built answer).
- **Step 1: done.** `docs/design/IA-v4/REFERENCES.md` (cal.com site and app, 9 references, number rules, interaction shortlist with
  budgets; 21st.dev grants no copy licence, so nothing is copied from it; no new dependency). Captures in `.work/ia/` (not committed).
  Wealthsimple served a block page and was not retried. **1b:** the headed Chromium opened on app.cal.com, but cal.com refused the login as an
  automated browser (email and Google). Not worked around; the browser was closed and `/tmp/fs-calcom-profile` deleted; Deepanshu
  takes read-only screenshots from his own browser instead (the order's fallback). Open from 0c:
  Deepanshu's probe output and Render log lines, to confirm or reject the provisional egress-IP reading (LOG §AK 0c).
- **Step 1a: done** (notes and captures in `.work/ia/calcom/`, not committed; the write-up comes with Step 1's commit).
- **Step 0c: code done, diagnosis provisional.** At b380669 the probe did not go through the governor, so its 418 was Binance's answer to
  the probe's own request, not stored state. A fresh deploy sends nothing to Binance at boot; the scheduler's first tick (+60 s) sends
  only for a stale real account with a key; the smoke probe sends 1 request of weight 1. Now: the api.binance.com probe consults the
  governor (paused: nothing sent, `source: governor_paused`, `pauseRemainingS`, the earlier `retryAfterS`; otherwise `binance_sent` and
  its 418/429 pauses every caller; the 60 s cache kept); key validation goes through the governor; `smoke_prod.sh` prints the source and
  the pause (any non-reachable status still FAILs). Backend vitest 1124 passed (133 files), tsc 0.
  **Options if the logs show nothing of ours before the ban (shared Render egress IP), for Deepanshu:** (1) wait it out: bans run 2 min
  to 3 days, and the new probe no longer extends one; (2) public market data (klines, aggTrades, time) from data-api.binance.vision,
  which Binance documents for market data only (whether its IP limits are separate is not documented); signed account calls must stay on
  api.binance.com; (3) for users, the broker-file path (`/check`) needs no call from our IP. A paid static egress IP is not proposed (I8).
- **Step 0b: done.** Receipt cost lines wrap with their leader; label column floor = longest word; bps breaks before its unit under
  400 px; the TOTAL dollars wrap under TOTAL when they do not fit. Check `e2e-shots/receipt-lines.ts` (worst-case figures, every line):
  before 1 cut at 390 and 4 at 320, after 0 and 0. Frontend vitest 752 passed (one run had the timing test `MarginNote` "opens on click
  and closes on Escape" fail under load; it passed alone 3 times and in the full rerun), tsc 0, lint 0 errors (17 warnings), build ok.
- **Step 0a: done.** `BinanceClient.fetchFeeRate` (undocumented `/api/v3/tradeFee`, no callers) is now `fetchCommission` on the
  documented `GET /api/v3/account/commission`, weight 20, parsed by the sync's `mapBinanceCommission`. A real user saw nothing before:
  the method was never called. Tests `BinanceClient.test.ts` (5 new). Backend vitest 1107 passed (131 files), tsc 0. LOG §AK.

## CI `secrets` fix (2026-11-22)

- CI gitleaks found 1 false positive: `mongodb-uri-credentials` in `ml-service/tests/test_council_scope.py:59` (commit 92a3c62), a dummy
  `user:<6 letters>@host` in a test. Fixed: the test builds the string in pieces; the fingerprint is in `.gitleaksignore` with a reason.
  Full-history gitleaks exit 0. Detail in `docs/research/LOG.md` §AJ. Local commit, not pushed.

## Orders of 2026-11-22, fourth: honest AI layer, two hardened backend paths, prints on the receipt (local commits)

- **Next concrete action: Run 4 ready for Deepanshu's review** (local commits, not pushed).
- **Step 1: done.** `ml-service/evals/placeholder_compliance.py` (offline; test `tests/test_placeholder_compliance.py`, hand-computed on
  3 small runs) and the table in README "Evaluation". Unit = one agent output (regeneration and fallback are recorded per agent, not per
  sentence). Synthesis text was used as the model wrote it in 2 of 21 council runs and 3 of 18 single-call runs. ADR-0018
  (proposal, not built) is at `docs/research/decisions/ADR-0018-structured-claims.md`, beside ADR-0000 to 0017 (the order named
  `docs/adr/`, which does not exist; the ADRs live in `docs/research/decisions/`). The README line "runner exits 1 with 3 violations"
  was stale (v4 exists) and now says exit 0.
- **Step 2: done** (resolves the third order's BLOCKED benchmark label). `ml-service/agents/benchmark_line.py` builds the line from the alpha
  packet's `median_vwap_deviation_bps` (positive = paid more than the 5-minute VWAP = "worse than"; negative = "better than"; a median that
  prints as 0.0 = "equal to"; no VWAP fill = "insufficient data"), sent as `benchmark` in the `cited_values` event (live and replay; the
  recorded result is unchanged). The page prints the served sentence; the model's enum moved to "Model's label, as recorded: ..." under it.
  Tests: `tests/test_benchmark_line.py` (7, hand cases both signs, zero, rounding, singular, no packet), `test_cited_values.py`
  (event), `councilStatus.test.ts` (40). **Finding:** the rebuilt demo trades carry no `vwap5m`, so for the three demos the served line reads
  "insufficient data" (the model's enum had said negative, negative, positive); real accounts with `vwap5m` get the measured line.
- **Step 3: done.** Every Council SSE event has an `id:` per run; `ml-service/agents/stream_store.py` keeps a run's events in memory (32 runs,
  300 events, finished run 10 min; an unfinished run does not expire) and the pipeline no longer stops when the client disconnects; header
  `X-Council-Run` names the run; `GET /ml/agents/council/stream/{run_id}` + `Last-Event-ID` sends only later events (404 `stream_expired`,
  409 `unknown_event_id`, never a new run); `: keepalive` comment every 20 s; CORS allows `Last-Event-ID` and exposes `X-Council-Run`.
  Deviation: the page cannot use `EventSource` (it needs POST and an Authorization header), so `frontend/app/utils/councilStream.ts` reads
  the stream with fetch and implements the same resume protocol (reconnect with `Last-Event-ID`, skip ids already shown, give up with a
  clear message after 5 tries; 404/409 become the "not started again" message). The "TTL like the run cache": the run cache has none (it
  is by content hash), so the TTL is 10 minutes after finish. Tests: `test_council_stream_store.py` (8), `test_council_stream_resume.py` (6,
  including the fault injection: the ASGI client disconnects after 2 events; the resumed run's notes and `n_calls_ok` 9 equal an
  uninterrupted run and the fake provider's call count is equal), `councilStream.test.ts` (10), e2e `council-stream-resume.spec.ts`
  (demo stream cut after 4 events: one POST, one GET with Last-Event-ID 4, 4 notes once each). ARCHITECTURE.md §7 states the limit.
- **Step 4: done.** (a) `backend/src/services/exchangeEgress.ts`: allowed hosts `api.binance.com`, `data-api.binance.vision`, `api.bybit.com`,
  `api.bytick.com`, `www.okx.com`; https only, default port, no credentials in the URL, redirects never followed (axios `maxRedirects: 0`,
  fetch `redirect: 'manual'` and a 3xx is refused); used by BinanceClient, BybitClient, OKXClient, BinanceHistorySync, keyValidation,
  MarketDataService and ExchangeReachability. SECURITY.md says Helmet CSP protects browsers and this guard protects server egress.
  (b) `binanceGovernor.ts`: one process-wide weight budget (50% of the per-minute limit; X-MBX-USED-WEIGHT-1M; FIFO queue; 429 pause for
  Retry-After, 5 s if absent, at most 60 s; 418 refuses everything for Retry-After, 120 s if absent, requests already waiting are refused)
  for BinanceClient (myTrades weight 20), BinanceHistorySync (its private counter is gone), and klines (weight 2). `ccxtShadow.ts` does no
  I/O, so it needs no governor. Facts cited in the file header (docs-researcher; the docs do not say whether the header includes the
  request just made or whether the minute rolls: both are designed for conservatively). (c) `storeTradeIfAbsent`: a duplicate-key (11000)
  from a racing insert is "already stored", counted in `skipped` and `raced` (ingestion x3 and the history sync; `SyncReport.raced`).
  Tests: `exchangeEgress.test.ts` (20, incl. a real-socket redirect), `binanceGovernor.test.ts` (15: header sequences 10/45, 429 Retry-After 7,
  418 120 s boundaries, 10 concurrent syncs x 8 calls x weight 20 on a fake exchange with limit 1000: peak 500 per minute, 0 429, 3 waits of
  61 000 ms), `TradeIngestionRace.test.ts` (4, mongodb-memory-server: two concurrent writers of 50 trades give 50 rows and inserted sum 50).
  Backend vitest 1092 passed (129 files), tsc 0. **Found, not fixed (not asked):** `BinanceClient.fetchFeeRate` calls `/api/v3/tradeFee`,
  which is not in Binance's official docs (the documented fee endpoint is `GET /sapi/v1/asset/tradeFee`, weight 1).
- **Step 5: done.** `ml-service/scripts/cut_demo_prints.py` cut, offline from the cached checksummed daily files, a window per filled demo
  order (arrival - 5 s to last fill + 5 s, at most 60 prints, nearest the fills when over): **681 windows, 33,611 prints, 1.69 MB** in
  `ml-service/demo_v2/out/<demo>/prints.json` (aggressive 659,665 B, disciplined 401,911 B, moderate 624,437 B; under the 3 MB limit);
  182 windows are capped; every file hash equals `manifest.json`'s. The deployed backend holds only `backend/`, so a generated copy
  (the same 1.69 MB as TS strings) is `backend/src/data/demoPrints.ts` (a test fails on drift). `GET /api/audit/orders/:id/replay` adds `prints`
  for demo accounts only (a real account's payload is unchanged: no `prints` key; tested with a real account holding the same order id). The
  receipt draws it (`PrintsTape.tsx`, plain SVG, no motion so reduced motion sees the same finished frame): ticks in print order (filled up =
  buyer-initiated), fills ringed in pen, arrival dashed. Tests: `test_cut_demo_prints.py` (7, hand fixture + a local re-derivation of three
  real windows from the daily files), `demoPrints.test.ts` (5, two orders by hand), `replayPrints.test.ts` (3), `printsTape.test.ts` (10),
  `receiptCopy.test.ts`. Images `docs/design/v31b/receipt-prints-{1440,390}.jpg` (16 in the folder; two Carbon copies removed).
- **Step 6: done.** One reviewer (Sonnet): 7 findings, 6 fixed, 1 kept with a reason (LOG §AI). Final checks of 2026-11-22, after the fixes:
  ml-service pytest **1852 passed**, 0 failed, 9 deselected; `run_offline.py` exit 0 (36 runs x 6 invariants, 0 violations);
  `ablation.py --check` exit 0; `placeholder_compliance.py` exit 0; backend vitest **1102 passed** (131 files), tsc 0; frontend vitest
  **752 passed** (78 files), tsc 0, lint 0 errors (17 warnings, as before), build ok; full e2e **40 passed**; MCP **26 passed**;
  First Load JS (gzip kB, `scripts/first-load-js.mjs`): `/` 328.4, `/dashboard` 391.7, `/login` 315.9.
  Live LLM calls this order: none. Atlas writes: none. Nothing pushed.
- **Not verified / limits:** the stream resume is single-instance (ARCHITECTURE.md §7); the governor is per process; the real-file test of the
  prints needs the local daily-file cache and skips elsewhere (CI runs the fixture tests); the receipt tape was captured from fixtures plus
  the committed windows in a browser, and its DOM facts checked (60 ticks, 2 fill rings, arrival line, no overflow at 1440 and 390), not
  through the full stack with a real order id; Safari, Firefox and real phones are not covered.
- **Ideas, not done:** fix `BinanceClient.fetchFeeRate`'s `/api/v3/tradeFee` (not in Binance's docs; `GET /sapi/v1/asset/tradeFee`); wire the
  governor to a shared store for more than one instance; drop the backend's copy of the prints by serving them from a small store.

## Orders of 2026-11-22, third: Council scope, four copy fixes, launch kit (local commits)

- **Next concrete action: Council scope fixed and launch kit ready for Deepanshu's review (local commits, not pushed).** Golden set v4
  was dumped by Deepanshu (packets only, `recorded: false`); `test_eval_golden.py` reads v4 (versions 1.8.0 / 1.4.0) and
  `test_golden_sets.py` pins v4 as the newest set and v3 by name. Rerun: `run_offline.py` exit 0 (0 violations), `ablation.py --check`
  exit 0, `dump_golden_packets --check v4` hash-identical. Committed as one unit per step.
- **Step 1 (Council scope): done except one part.** Not done: the benchmark label (BLOCKED, below).
  Code, tests, golden v4 and the three re-recorded demo runs are committed (details and the sentences read: LOG §AH).
- **Step 2 (four copy fixes): done.** Chapter 03 is two sentences of 11 and 19 words (served values; improvement and cost cases tested);
  true minus in the formatters that printed a hyphen (`formatBpsDisplay` and the Council finding formatters; the legend's sign is set in
  the text face because the mono face draws U+2212 like a hyphen; the shared `formatBps` and the PDF are unchanged); a cancelled order with
  no fills shows fees "$0.00" and notional "$0.00 executed" (only when the exchange's own executed quantity is 0); images in
  `docs/design/v31b/` (16, README updated).
- **Step 3 (launch kit): done.** `README.md` top section (pitch, live link, check it yourself, Mermaid architecture, Evaluation table,
  test counts), `docs/runbooks/MCP_CLIENT.md`, `docs/launch/RESUME.md`, `docs/product/PRD.md`; drafts refreshed: `BLOG_1_MEASURED.md`
  (grades 93.4 to 94.3, from the file), `BLOG_2_EXPLAINED.md` (Council scope, parked re-record), `LAUNCH_CHANNELS.md` (same),
  `DEMO_SCRIPT.md` (light theme, demo names, download buttons exist in Settings, a Council scene).
- **Step 4 (checks, review): done.** One reviewer (Sonnet): 7 findings, 3 fixed, 4 kept with reasons (LOG §AH). Final checks of
  2026-11-22: ml-service pytest 1816 passed, 0 failed, 9 deselected (after v4: the first run had 5 failures that needed it, then one
  more, the "newest set is v3" pin, fixed by pinning v3 by name and adding a v4 test); backend 1053 passed (126 files), tsc 0; frontend vitest 727 passed
  (76 files), tsc 0, lint 0 errors (17 warnings), build ok; e2e 39 passed; MCP 26 passed; guard table 214 passed; roadmap ids OK;
  ablation `--check` exit 0; `run_offline.py` exit 0 (0 violations, after v4); `dump_golden_packets --check v4` hash-identical.
- **Step 1 detail:**
  Scope: `frontend/app/dashboard/page.tsx:303` hard-codes BTCUSDT; not changeable by the user. Fix: `scope` event with served fill counts
  printed beside the title; metrics 1.4.0 (a one-symbol packet has no concentration keys); prompt 1.8.0 (Risk Auditor prompt for a
  one-symbol packet); claim rules 1.4.0 ("rather than", "inherent to", "resulting in"); display label "Fee Reviewer".
  **BLOCKED: benchmark verdict label** ("worse than"/"better than" the 5-minute VWAP): direction not defined in code
  (`ml-service/agents/schemas.py:32`, `agents/alpha_architect.py:27`); label left as it was.
  Live runs used: 4 of 5 (three demos, then one more for demo-disciplined, not kept: LOG §AH).

## Waiting for Deepanshu (2026-11-22, third order)

- **Golden set v4: DONE** (dumped by Deepanshu; follow-up applied, first bullet of the third order). Still waiting: the benchmark label
  (BLOCKED, Step 1) and the push. Original request, kept for the record:
- **Golden set v4 (packets only).** The auto-mode classifier denied `cd ml-service && .venv/bin/python -m evals.dump_golden_packets --set v4`
  (it reads the demo trades from Atlas read-only and writes only the new folder `ml-service/evals/golden/v4`; v1 to v3 stay unchanged).
  Until it exists, `python evals/run_offline.py` exits 1 with 3 violations ("demo_runs/<id>.json: fixture matches no golden set"): the
  three re-recorded demo fixtures carry prompt 1.8.0 and metrics 1.4.0, which no golden set owns. After it: change
  `ml-service/tests/test_eval_golden.py:29` from `load_golden("v3")` to `load_golden("v4")`, and rerun.

## Orders of 2026-11-22, second: verify Part A, F1-F3, Part B screens, QA (local commits)

- **Next concrete action: Design v3.1 complete: all screens ready for Deepanshu's review (docs/design/v31b/).**
- **Step 3: done** (commits e61e9ec B1, f37ddf8 B2): words before and after per screen in `docs/milestones/M8.md`
  ("Design v3.1 complete"); Analytics, Error, Share, OG and the auth pages could not be measured or were already inside the
  rule (stated there). **Step 4: done**: qa3 48 states, keyboard 20/20, break-ui 76/80 (4 detector artefacts on clipped
  Orders rows), one reviewer (9 findings, fixed or kept with reasons), final checks green (vitest 715, tsc 0, lint 0
  errors, build ok, e2e 39, backend 1050, tsc 0). Images `docs/design/v31b/` (16 + README).
- **Step 1: done.** Full e2e on e5ddba8: 39 passed (1.6 min); nothing to fix, no commit.
- **Step 2: done** (commits 667b7aa F1, 0024e9b F2, 1d24822 F3). Backend 1050 passed; frontend vitest 714 passed.
  - F1: `/audit/orders-summary` `strip` has three parts that add up to the total (`execution` = total - fees - unfilled,
    `unfilled`, `fees`; `below` is the improvement's share, drawn below the line). Served demo-moderate: fees 41.98 +
    unfilled orders 10.63 + filled-order execution -0.53 = 52.08 (matches the order). The printed word "missed" is
    banned by `adviceCopy.test.ts` (counterfactual list), so the part reads "Unfilled orders", caption "the market moved
    away from them"; the server key stays `missed`.
  - F2: "The 245 orders cost $52.08, including $10.63 the market moved away from 11 orders that never filled." (count =
    the measured unfilled orders); receipt NOTES line; tape circle "$3.31, unfilled: market moved away".
  - F3: hero gaps at 1440 x 900, nav to tape and tape to headline: 247 / 172 px before, 110 / 109 after; CLS 0 at 1440
    and 390. The box stays 100svh (a shorter box let the next section peek in and shifted, CLS 0.22); the content is held
    inside the first 700 px, so a band of paper remains under the CTA (about 280 px at 900 px tall).

## Orders of 2026-11-22, design v3.1 fixes, all screens, status (step 0, A1-A7, Part B, QA; local commits)

v3.1 is approved and live. This order: STATUS.md, fix the review findings, bring every other screen to DESIGN.md
section 11, QA, then stop for review.

- **Next concrete action: Waiting for Deepanshu.** Reason: this run reached its 60-turn limit after step 0 and A1-A7.
  Part B (all other screens to the v3.1 rules) and QA are **BLOCKED: turn limit, not started** (no screen of Part B was
  touched; nothing is half done). To continue: Part B in at most 6 commits (Orders, Rules, Rankings, Council, Evidence |
  Verify, Onboarding, Settings, Auth | Trades, Analytics, Methodology, Check | Share card, OG image, Legal, 404, Error),
  recording `e2e-shots/words.ts` words and type sizes before and after; then qa3, the one reviewer, the checks and
  `docs/milestones/M8.md` "Design v3.1 complete". The ordered final next-action text is not yet true.
- **Step 0: done.** `docs/STATUS.md` (commit `334ec74`). Dependabot: 0 open alerts by API (`gh api ...dependabot/alerts`),
  `npm audit` 0 in frontend, backend and mcp-server, `pip-audit` clean; nothing to patch. The "1 high" banner is not
  reproduced; cause unknown (STATUS.md).
- **A1-A7: done, in ONE commit** (not one each: the items share `headline.ts`, `Overview.tsx` and the e2e specs, and
  staging by hunk is interactive, which is not available here).
  - A1 `unfilledCost()` in `orderSummary.ts`, `unfilledCost` on `/audit/orders-summary` (usd, count, measured; null
    dollars when unfilled orders exist and none was measured). Tests `unfilledCost.test.ts` (hand: A 25 bps x $1,000 =
    2.50, B 40 x 500 = 2.00, sum 4.50 over 2 orders; also the partly filled, open, unmeasured and per-symbol cases) and a
    route assertion in `rebuiltDemo.test.ts`. Copy: `totalSentence` in `headline.ts` (test `totalSentence`): before "The
    245 orders paid $52.08 in total."; after "The 245 orders cost $52.08, $10.63 of it in orders that never filled."
    (demo-moderate, served `unfilledCost.usd` 10.631536). Also the chapter title ("What the orders cost") and the strip's
    fallback sentence. No other surface said "paid" for such a total: landing, receipt, share card, OG image and PDF were
    grepped (the ruler's "Paid minus expected" and the Fees rows are filled market orders and fees, kept).
  - A2 `isUnfilled` / `circledLabel` in `ordersTable.ts` (test `unfilled outcome of a ledger row`): "$3.31, unfilled" from
    the ledger row's stored status and fill count.
  - A3 Names (decided by the generator `demo_v2/decisions.py` and the built orders: 144/144 limit; 161 limit and 84
    market; 242 market and 69 limit; 88%, 54%, 6% of fills 08-15 UTC): "Limit orders, daytime", "Mixed orders, mixed
    hours", "Market orders, night" (ids, locks and grades unchanged). Total cost printed on the landing receipts and in the
    demo picker from the server's `shortfall.totals.total.bps`: 11.2, 11.7, 10.2 bps (test `totalBpsLabel`, hand values
    20.39256/18174.007 = 11.2207, 52.07856/44411.78 = 11.7263, 62.35832/61261.90 = 10.1790).
  - A4 Chapter 02 reads "Graded A, 93.4 of 100."; the v1 line is in the stamp's note ("The earlier rule-based grade, B
    84.8, scoring v1, kept unchanged"). With no measured grade the v1 line and its note stay.
  - A5 Footer "Fills 607, in 234 orders" from `orderCounts` (withFills + unrecorded; test `scopeFacts`).
  - A6 `dotNote` (test): "Paid −0.095 bps, expected 0.110 bps, difference −0.205 bps." in a note on the ruler.
  - A7 Landing: the tape is centred in the stage (`landing.css`); the gap between the tape and the headline at 1440 fell
    from about 270 px to about 175 px, but the space above the tape grew from about 150 px to about 245 px, so the band
    moved more than it vanished (open: judge the image `.work/look/a7-after-1440.jpg`). The band above "Check it
    yourself" went from about 288 px of padding to about 144 px (set in CSS; not captured as an image). CLS was not
    re-measured.
  - e2e selector changes (text only): `rebuilt-demo.spec.ts` (two: "cost" not "paid"; "3, in 3 orders"),
    `removed-demos.spec.ts` (demo name), `score-versions.spec.ts` (measured-grade line and note). `nav.test.ts`: the
    account label.
  - Checks: backend 1047 passed, tsc 0 (run after A1; no backend file changed after); frontend vitest 707 passed, tsc 0,
    lint 0 errors (17 warnings, unchanged), `npm run build` ok; e2e: 37 passed and 2 failed, then the 2 failures fixed
    and `rebuilt-demo` + `score-versions` rerun 9 passed (the full e2e was not rerun after that fix).
- Part B, QA: **BLOCKED (turn limit), not started.**

## Orders of 2026-11-21 (second), design v3.1 "Quiet audit" (steps 1-6; local commits, not pushed)

Design v3 "Tape & Receipt" stays; the problem is sensory overload. Research first, then rebuild the landing page, the
overview and the receipt-opening flow with less text, designed visuals and better motion; then stop for review.

- **Next concrete action: Design v3.1 ready for Deepanshu's review (`docs/design/v31/`).** Reason: steps 1-6 are done
  (below; report `docs/milestones/M8.md` "Design v3.1"); local commits only, the push is his. The other screens follow
  later with the same rules (DESIGN.md section 11).
- Status: steps 1-6 done.
- **Step 6, done.** qa3 `v31-2` and `v31-3` (48 states each, 1440 and 390, Carbon copy): no overflow, axe 0 serious or
  critical, one transient overlap (the closing heading mid line-reveal at 390; clean with reduced motion), landing CLS
  0 at both widths; reduced-motion captures clean; keyboard `keys31.ts` 11/11; break-ui `break31.ts` 60/60 after one
  fix (2 px at 320); impeccable detector no findings, audit fixes (44 px touch target, memoised tape bars); margin-note
  popups load on use (First Load JS `/` 323.6 to 325.2, `/dashboard` 384.3 to 387.9, `/login` 313.2 unchanged).
  Reviewer subagent on the images: 15 findings, one fix pass (2 high fixed: two "paid" figures on the ruler, "every
  audit ships signed"; 13 of the rest fixed or kept with reasons in M8.md). Final words (1440 / 390): landing 381 to
  179 / 358 to 178, overview 378 to 122, receipt 113 to 52. Checks: frontend vitest 690, tsc 0, lint 0 errors
  (17 warnings, unchanged), build ok, e2e 39 passed; backend 1041 passed, tsc 0 (payload changed in step 3 only).
  DESIGN.md section 11, `docs/design/v31/` (14 images + README), M8.md section, LOG §AF.
- **Open for Deepanshu:** the demo v2 grades read A for all three synthetic traders (served v2.3.0 values; the landing
  shows them without the frozen v1 letters); the landing's type-size count did not fall (printed objects keep their
  scale); motion was judged in headless Chromium only (no Safari, Firefox or real phone; drag tested with a mouse).
- **Step 5, done.** Landing: hero and the giant $0.25 kept; the hero's proof paragraph moved into a pen note on
  "public prints"; the prints' B/S letters became up/down tape ticks (legend in that note); a visible "SYNTHETIC
  TRADER, REAL PRICES" line under the hero's buttons on a desktop (the phone prints it under the tape). New
  `HowItReads.tsx`: a pinned horizontal row of three printed objects (the tape: the hero's real prints; the receipt:
  the hero order's real terms; the stamp: demo-moderate's served grade, read live, no letter while loading), each with
  a masked SplitText title and one sentence, a "1 / 3" counter and one chapter provenance line; stacked and still on a
  phone, with reduced motion or without script. Demos, envelope, "never" line and close shortened (the "never" line
  keeps "language model": the expected cost is itself a fitted model). Visible words (`words.ts`): **1440: 381 to 180
  (−53%); 390: 358 to 179 (−50%)**. Landing CLS 0 at both widths; axe 0. e2e: `removed-demos.spec.ts` reads the
  picker's heading (its lede was cut).
- **Steps 3 and 4, done (one commit: the receipt's entry and the tape share files).** Overview in five chapters
  (`Overview.tsx`, `chapter.tsx`): 01 total (slim "Sample data: synthetic trader, real prices" line replaces the demo
  banner; bps in a note), 02 grade (stamp pressed on the chapter's first entry, its border drawn with DrawSVG, loaded on
  demand; band and the frozen v1 details in notes), 03 where it went (torn strip from the server's new `strip` shares,
  fees at the published rate dashed with "not independently measured" printed; the B2 term table and switch kept in a
  "Lines" fold), 04 the month (tape draggable with Draggable + Inertia when bars are under 4 px, keys unchanged, time
  loupe, pen circle on the largest order, a click opens the receipt in place), 05 against expected (ruler with the
  bracket drawn once, one sentence; outcomes as a tally). Margin notes: `app/ui/MarginNote.tsx` (Radix Popover on a
  fine pointer: hover 250 ms / focus / click, warm window 400 ms, Escape; Vaul sheet on touch). Server:
  `costStrip()` in `orderSummary.ts`, `strip` on `/audit/orders-summary` (test `costStrip.test.ts`, hand values: red
  then green); fixtures re-cut offline (only `strip` added, checked). Receipt (step 4): Flip from the clicked bar or
  ledger row on a desktop (`flipFrom`, GSAP Flip.fit + Flip.from, 300 ms; keyboard opens plainly), the footnotes in a
  printed "NOTES (n)" fold, a stepped print feed on the first open of the session only (`fs-receipt-fed`). Fixed on
  the way: the screen-reader options layer took the tape's pointer (Draggable never started); a click now opens the bar
  the preview shows. e2e selectors: `score-versions.spec.ts` (opens the v1 note), `rebuilt-demo.spec.ts` (opens the
  folds and the two notes). Checks: frontend vitest 690 passed, tsc 0, lint 0 errors; backend 1041 passed, tsc 0.
- **Step 2, done.** `docs/design/v31-plan.md`: rules, motion budget, and a keep/shorten/note/delete decision for every
  text block. Before (visible words, `frontend/e2e-shots/words.ts`, 1440): landing 381, overview 378, receipt 113;
  type sizes 18, 15, 8.
- **Step 1, done.** GSAP agent skills installed user-wide (`~/.claude/skills/gsap-*`, nothing in the repo) and read;
  gsap.com docs and the libraries read through two docs-researcher digests; 11 sites opened and measured (5 Awwwards:
  Hark, Equator, Grail, A24, CRL; 3 SiteInspire: Atalanta, 1984, Town; gsap.com showcase + Factura; 6 Osmo demos from
  their preview videos, the code being members-only). Skipped with reasons: Cyera, two Peachworlds sites (WebGL),
  Cafeteria (capture timeout). `docs/design/REFERENCES-v31.md`, 8 JPEGs in `docs/design/v31-refs/` (344 KB).

## Orders of 2026-11-21, design v3 fixes (A1-A10, B1-B3, QA; local commits, not pushed)

Design v3 is approved and pushed. This order fixes the review's findings (part A), adds three server-side numbers the
design needs (part B), then QA. One local commit per numbered item.

- **Next concrete action: Design v3 fixes ready for Deepanshu's review.** Reason: every item is done, kept or not
  built with its reason (below and in `docs/milestones/M8.md`, "Design v3 fixes, 2026-11-21"); local commits only, the
  push is his. Images: `docs/design/v3/` (12 of 14 recaptured). Open for him: A2 (84.57 vs the locked 84.809, if he
  holds a record that says otherwise), B3 options 1-2 (prints for the receipt), the reviewer's kept items below.
- **Status of every ordered item:** A1 done, A2 kept (no change; trace below), A3-A10 done, B1 done, B2 done, B3 not
  built (prints not readable without new storage; receipt chart removed); QA done.
- **QA, done.** qa3 (26 states incl. the receipt end, an unfilled receipt and the Council notes) two passes: `fix-1`
  then `fix-2`: no overflow, axe 0 serious or critical, landing CLS 0 at 1440 and 390; one overlap reported on the
  landing story end at 1440 (the hero copy scrolled under the top bar mid-pin; that screen is unchanged and the item was
  recorded in the previous QA). break-ui (`e2e-shots/break3.ts`: receipt with a 64-character id, 40 fills, an 8-figure
  cost and a tiny negative; an unmeasured unfilled order; a Council note with 1,600 characters, a 90-character token and
  25 cited values, another not traceable; at 1440, 390, 320): one fix pass (a not-computed total printed at display size
  and clipped; the hash column squeezed by the stamp at 320; a duplicate "NONE"), then clean. Refusal form check: 3 of
  3. Checks: frontend vitest 684 passed, tsc 0, lint 0 errors (17 warnings, unchanged), build ok, e2e 39 passed (two
  specs' assertions follow the ordered strings: `council-demo.spec.ts` for A7, `rebuilt-demo.spec.ts` for A3; none
  deleted), backend 124 files / 1037 passed and tsc 0, ml-service 1785 passed / 1 skipped, evals offline 0 violations,
  ablation --check exit 0, guard table 214 passed, roadmap ids OK; First Load JS `/` 323.6, `/dashboard` 384.3,
  `/login` 313.2 kB gzip (was 323.2, 383.2, 313.2).
- **Independent reviewer: no high or medium findings.** Fixed: LIMIT_MAKER shown as Limit in the ledger (the per-type
  totals already count it so); a line under the switch when measured orders of other types are in All only; the exact
  value below 0.000001 in words, not exponent form; `safe_trace` so the trace can never break a Council run (tested); a
  stale docstring. Kept: (1) `/orders-summary` says unavailable when no order is stored while `/orders-ledger` lists
  fills without stored orders, so an account with fills but no orders shows fill groups on the Orders page and no counts
  on the overview (the summary's behaviour is unchanged); (2) `/orders-summary` and `/orders-ledger` load every fill of
  the account (projected fields) to count them: real cost only from about 100k fills; a `$group` aggregation and one
  shared ledger fetch for the tape and the Orders page would remove it; (3) `notionalOf` uses 0 only if both notional
  and price were missing, which the Trade schema forbids.
- **B3, investigated; prints not built (receipt chart removed).** Where the source comes from today: `GET
  /api/audit/orders/:orderId/replay` (`routes/explain.ts` → `services/orderReplay.ts`) reads the order, its fills and
  its `order_measurements` document; the source is `marketDataRefs` (source `data.binance.vision`, dataset
  `spot/daily/aggTrades`, symbol, date, SHA-256 of the daily file), written by the measurement job. No print is stored.
  (a) Demo accounts: the committed build (`ml-service/demo_v2/out/`) holds trades, orders, measurements and fee
  snapshots, no prints; the only committed prints are the landing hero's 38 for one order. (b) Real accounts: the same
  refs; the prints are read by ml-service's measurement job from the daily archive into a disposable Parquet cache
  (`measure/data/cache.py`, `MARKETDATA_CACHE_DIR`, LRU, 2 GB, on Render's ephemeral disk), which the backend cannot
  read and which may be evicted, so reading it would not be deterministic. Neither case can be served without new
  storage, an ingestion change or a download or exchange call at request time, all excluded by the order. So the
  receipt omits the chart entirely (no near-empty plot) and keeps "Fills only; the public prints are in the source
  file." with the file name and SHA-256 under SOURCE. **Options for Deepanshu (not built):**
  1. Commit a capped window per demo order (arrival - 5 s to last fill + 5 s, at most 60 prints, cut offline from the
     daily files whose SHA-256 the refs carry): about 50 bytes a print, at most ~3 KB an order, 700 demo orders, at
     most ~2.1 MB of JSON in the repository (estimate; not cut). $0. Demo only.
  2. Store the same capped window in `order_measurements` when the measurement job runs (it already holds the day's
     prints): at most ~3 KB an order in Atlas (free tier 512 MB); needs an ingestion change, a backfill of existing
     measurements (an Atlas write, his permission) and a field-registry row. $0 until the tier's cap. Demo and real.
  3. Read Binance's public REST aggTrades for the window at request time: an exchange call per receipt (rate limits,
     no file SHA-256 to cite, non-deterministic availability); excluded by the order.
  4. Download the daily archive at request time: a whole symbol-day per receipt; excluded by the order.
- **B2, done.** `totalsByType(orders, measurements)` (`backend/src/services/orderSummary.ts`) gives the shortfall totals
  per order type family (market; limit incl. LIMIT_MAKER; other) and over all measured orders, by the existing
  `termTotals`; `/audit/orders-summary` returns it as `byType` (computed on read; `summariseOrders` and the evidence
  pack unchanged). Test `orderTypeTotals.test.ts` (hand values) checks the families add up to `all` term by term in
  dollars and orders. demo-moderate: market $14.70 (84 orders) + limit $37.38 (161) = $52.08 (245). The overview's
  cost receipt has the All / Market / Limit switch again (`totalsFor`, `describeTotals`, tested in
  `ordersTotals.test.ts`); a type with nothing measured says "not computed". Backend 1037 passed, frontend 680.
- **B1, done.** Each ledger row carries `cost` {usd, bps}: `orderTotalCost()` = shortfall.totalBps x intendedNotional /
  10,000, the formula the receipt uses (`orderReplay.ts`), null when unmeasured; computed on read, no stored data
  changed. On demo-moderate the 245 per-order costs sum to $52.0785604695634, the overview's total. The month tape's bar
  height is now the order's dollar cost on one linear scale; a price improvement hangs below the baseline (none in
  demo-moderate); an unmeasured order is a short dashed mark; the caption says so; the preview and screen-reader text
  give the cost. Payload (the ledger, which the tape reads) for 245 orders: 109,678 bytes, 20,482 gzip. Tests:
  `orderLedger.test.ts` (hand values incl. a negative and an unfilled order), `monthTape.test.ts` (shares, baseline,
  all-improvement case), `ordersTable.test.ts`. DESIGN.md decision log and ARCHITECTURE.md updated. Backend 1034
  passed, frontend 678.
- **A10, done.** Cause: below the desktop layout the stamp sits on the left margin and its -7° turn (about its left edge
  on phones, where it is scaled from there) swings the top-left corner and its outline 12 to 15 px left of its box,
  past the 16 px gutter. Fix: a 20 px left inset on the stamp's wrapper below 1024 px (`Overview.tsx`). Measured
  (outline's left edge against the gutter): 320 px 22/16, 390 px 22/16, 640 px 20/16.6, 900 px 27/23.4; 1440 unchanged.
- **A9, done.** /verify: the native "Choose File" is replaced by a secondary pill button ("Choose a pack file", then
  "Choose another pack file") that is the `<label>` of the real `<input type="file" id="pack">`; the input is visually
  hidden but stays in the tab order and shows its focus ring on the button (`peer-focus-visible`). Checked in the
  browser: 9 Tabs reach `#pack`, the label outline is drawn, its accessible name is "Choose a pack file"; the e2e and
  QA selectors (`#pack`) are unchanged. Not changed: the CSV check panel's file input (not in the order).
- **A8, done.** The refusal sentence is built from the same API data in plain words: "This key can do more than read
  your trades. Turned on: Spot & Margin Trading, Withdrawals. Needed: Reading only." (the exchange's "Enable " prefix
  dropped; `errorMapping.ts`). `refusalFollowUp(code, exchange)` decides the last correction and the form from the
  existing refusal map: Binance's corrections edit the same key, so the fields stay filled and the last line is "Press
  Connect again. Nothing from this attempt was stored."; Bybit and OKX ask for a new read-only key, and a key the
  exchange did not accept is pasted again, so key, secret (and passphrase) are cleared and the key field takes focus
  ("Paste the new key and its secret here. ..."); no answer keeps the fields. Tests: `errorMapping.test.ts` (each
  exchange); browser check `e2e-shots/refusal-form.ts`: Binance, Bybit and OKX all pass (plain words, last line,
  fields, focus).
- **A7, done.** Each specialist note prints its recorded finding verbatim (the explanation field and its flag sentences;
  tags stay chips) and its cited values as ledger lines (audit field, value as the audit rendered it, unit). The run
  records only a count, so the server traces them on read: `ml-service/agents/cited_values.py` renders every leaf of
  the specialist's packet namespace exactly as the placeholder renderer does and finds those strings in the text, whole
  tokens, in reading order; a rendering shared by several fields lists all of them. Shown only when every numeral in the
  note lies inside a traced value (the grounding guarantee); otherwise "could not be traced" (ValueState). The recorded
  count is not the gate: the claim check can replace an explanation with a fallback after it was counted
  (demo-disciplined liquidity: recorded 3, text "Liquidity verdict: GOOD."). Sent as a `cited_values` stream event just
  before `complete` (`complete` stays equal to the HTTP body, an invariant test), for demo, cached and live runs; the
  recorded run and the database are unchanged. Notes are receipt-white paper with a torn edge, no shadow, at natural
  height in two balanced columns. Tests: `tests/test_cited_values.py` (hand values, a served demo run),
  `councilStatus.test.ts`. QA fixture: `scripts/cut_cited_fixture.py` (offline build; on demo-moderate all four notes
  trace: liquidity 3, risk 4, fee 3, alpha none). Checks: ml-service pytest 1784 passed, 1 skipped; evals offline 0
  violations; ablation --check exit 0; frontend vitest 674.
- **A6, done.** Phone: each fee mark is a squarish pen loop (`loopPath`, superellipse) round the whole 128 x 104 fill
  tile, centred on its text and stopping short of the neighbouring prints' text; the fee note's leader starts on the
  second fill's mark (also on the desktop, where it ended in the gap). Bounds measured in the browser
  (`e2e-shots/probe-tiles.ts`: fill text x 9..119, y 23..97; neighbours' text from 9 px in) and checked in
  `heroGeometry.test.ts`. The desktop circles are unchanged. Hero end frames at 390 and 1440: no overlap, axe 0, CLS 0.
- **A5, done.** The receipt's sentences (expected cost or its insufficient-data reason, the chart legend, "no fills",
  "no cost terms", the bars note, errors) are sentence case in `app/dashboard/receiptCopy.ts` (tested); the stored
  notes (delay) were already. Capitals stay only on printed labels (ORDER, MARKET, PLACED, STATUS, FILLS, COSTS, TOTAL,
  SOURCE, the provenance line). qa3 gained `orders-receipt-end` and `orders-receipt-unfilled`.
- **A4, done.** Cause: the tab row ends in an ink rule, `main` adds 24-32 px, and the view's first `Panel` drew its own
  ink rule (the `panel` utility) with 16 px more. Fix (`globals.css`, `[data-view-body]` on the dashboard's view column
  and on Settings): the section that opens a view, or the top of each column of a grid view, draws no rule and no top
  padding. Probe `e2e-shots/probe-rule.ts` (first ruled element under the tabs): Orders, Rules, Rankings, Council,
  Evidence and Settings no longer have a panel rule under the tabs; Trades and Analytics had none (content between).
- **A3, done.** `app/ui/format.ts` only: a negative value below display precision prints "−0.00 bps" / "−$0.00", a
  positive one keeps "<0.01 bps" / "<$0.01"; `exactTitle()` gives "Exactly −0.004000 bps" for the title and the
  screen-reader text (`app/ui/Fig.tsx`), used on the order receipt's cost lines and total, the overview's cost receipt,
  medians and cost against expected. `utils/formatBps.ts` (shared with the backend PDF, parity-tested) is unchanged.
  `git diff --stat -- backend ml-service evals golden frontend/app/utils/formatBps.ts frontend/app/lib/downloads.ts` is
  empty: no evidence pack, PDF, CSV or golden output changes. Tests updated to the new strings (`format.test.ts`,
  `ordersTotals.test.ts`); e2e `rebuilt-demo.spec.ts` expects the new strings and the title (the ordered change).
- **A2, kept (nothing changed; for Deepanshu).** The overview shows 84.8 for demo-moderate's v1 grade. Chain: Atlas
  `audits` (latest document of `demo-moderate`, `avgFillScore`; not read here, Atlas is off limits) → `GET
  /api/audit/score` (`backend/src/routes/audit.ts`, serves the stored audit unchanged; `rebuiltDemo.test.ts` checks it
  for a rebuilt demo) → `app/dashboard/page.tsx` (`v1={{ score: audit.avgFillScore }}`) → `GradeBadge` → `formatScore`
  (`toFixed(1)`) → "84.8". The committed record of the locked grade is 84.80888516669383 in all three places that hold
  it: CLAUDE.md rule 5, `backend/src/scoring/__tests__/gradeInvariance.test.ts` and `frontend/app/utils/demoProfiles.ts`
  (tested in `demoProfiles.test.ts`); the QA fixture (`e2e-shots/cut-fixtures.ts`, `V1`) uses the same value. 84.570 is
  in the repository only as a **retired** grade set (`demoProfiles.test.ts`, "never carries a retired grade set":
  95.675, 84.570, 60.771; added in commit 164a8bf, audit follow-up 1/14). So the display equals its committed source and
  the source is not 84.57; the "84.57 on record" in the order is the retired value. If Deepanshu holds a record that
  says 84.57 is the locked grade, that record and CLAUDE.md disagree and he decides which stands; nothing was moved.
- **A1, done.** Cause: the Orders page built its rows in the browser by grouping the fills from `GET /audit/trades`, so
  the 11 demo-moderate orders that never filled (cancelled, no fills) had no row: 245 stored orders, 234 with fills, 607
  fills (`ml-service/demo_v2/out/demo-moderate`). The overview counted the stored orders (`/audit/orders-summary`).
  Fix: `GET /api/audit/orders-ledger` (`backend/src/services/orderLedger.ts`, computed on read from `orders` and `trades`)
  lists every stored order with its status and its fills summed on the server; `orderCounts()` is returned by both the
  ledger and `/audit/orders-summary` (`counts`), the summary's other fields and `summariseOrders` (used by the evidence
  pack) are unchanged. The ledger header prints "245 orders, 234 with fills, 607 fills." from those counts; an unfilled
  order shows its status and its receipt prints the audit's unfilled-order cost. The month tape reads the same ledger.
  Tests: `orderLedger.test.ts` (hand values), `rebuiltDemo.test.ts` (both routes return equal counts), frontend
  `ordersTable.test.ts` (the overview and the ledger counts come from one source, on the cut demo fixture). The browser's
  `groupOrders` and its test are gone (the sums moved to the server and are tested there).

## Orders of 2026-11-20 (second), design v3 conversion: "Tape & Receipt" chosen (local commits, not pushed)

Deepanshu chose direction 1 with four fixes (hero composition with connected pen notes; the story ends on a giant
$0.25 in penInk with "10.0 bps; fees were 99.99% of it" double-underlined; Carbon copy a real tested theme; DESIGN.md
rewritten), then conversion steps 1-8 (one commit each), then QA. Design v2 stays live until he pushes.

- **Next concrete action: Design v3 ready for Deepanshu's review (docs/design/v3/).** Reason: the order stops here; the
  fixes, conversion steps 1-8 and the QA are done and committed locally; pushing (which replaces live design v2) is his.
  Read `docs/design/v3/README.md` and the design v3 section of `docs/milestones/M8.md`.
- **Status of every ordered item:** fixes 1-4 done (hero, giant total, Carbon copy tested, DESIGN.md); conversion steps
  1-8 done (one commit each, details below); QA done: three passes of `qa3.ts`, the emil-design-eng and impeccable
  checklists, break-ui and the keyboard pass, one independent reviewer (findings fixed or kept with a reason in M8.md),
  14 images in `docs/design/v3/`, M8.md and ARCHITECTURE.md §4 updated. Final checks: frontend vitest 664 passed, tsc 0,
  lint 0 errors (17 warnings), build ok, e2e 39 passed, backend 122 files / 1023 passed and tsc 0 (unchanged), guard
  table 214 passed, roadmap ids OK, First Load JS `/` 323.2, `/dashboard` 383.2, `/login` 313.2 kB gzip. Not run:
  ml-service pytest and the evals (no ml-service code changed; one comment in `scripts/cut_hero_fixture.py`).
- **QA pass 2 and 3, and the reviewer:** pass 2 clean except the phone hero end frame captured before its fee marks;
  reviewer's 12 findings handled (M8.md lists each); pass 3 clean on all 22 states, CLS 0. Found while running the
  backend suite: `backend/src/__tests__/heroFixture.test.ts` reads the v2 hero fixture, which step 7 had deleted; it is
  restored at its path (`frontend/app/design-lab/fixtures/hero-order.*`), and the backend suite is green again.
- **QA so far:** fix 4 done: DESIGN.md rewritten for Tape & Receipt (tokens, type with the measured tabular figures,
  paper/ink/pen rules, receipt anatomy, stamp, tape, pen, motion, data, copy, invariants, anti-generic list; v2 rules
  deleted). QA script `e2e-shots/qa3.ts` (22 states: landing hero start and end, story end, overview, orders with the
  receipt, rankings, Council, verify after a check, onboarding refusal, settings at 1440 and 390, overview and receipt in
  Carbon copy; overflow, overlap and axe checks; landing CLS). Pass 1: CLS 0 at 1440 and 390, no overflow, axe 0 serious
  on every state; overlaps reported only under the fixed top bar (the check now leaves fixed/sticky layers out); fixes:
  rankings wait selector, the hero end frame captured inside the pin, more room under the giant $0.25. emil-design-eng
  checklist: `transition-all` only in unused shadcn primitives (tabs, toggle, toggle-group, badge deleted; the dialog's
  button primitive now names its properties); exit faster than enter already (receipt 560/220 ms); hover lifts are
  hover-gated by Tailwind v4. impeccable audit checklist: the receipt's Close and Copy controls get 44 px targets on
  coarse pointers. break-ui (`look.ts case=long|one|empty`, 320 px, 640 px for 200% zoom, `e2e-shots/keys.ts`): a
  12-million-dollar total overflowed its column (the figure now sizes to its container by character count), the order
  count lacked thousands separators (fixed), the phone receipt of very large figures widened the page (it now scrolls
  inside, focusable region), the top bar overflowed at 320 px (⌘K hidden on phones; the drawer has every section); one
  order and no orders render their states; the keyboard pass is 12 of 12 (tape tab stop, arrows, preview, Enter opens
  the receipt, Escape closes, focus returns to the row, verify's file input focus ring).
- **Step 8, done:** Verify as a drop envelope and a printed verification receipt (manifest lines tick OK or FAIL in turn,
  signature, key, file count, the outcome stamped VALID / CONSISTENT / INVALID / UNREADABLE with its line in words; the
  stamps differ in line style and words, colour only repeats them). Onboarding refusals as returned receipts (RETURNED
  stamp, corrections numbered in pen-ink; network errors as NO ANSWER). Share page as a receipt score card; Open Graph
  image redrawn as a receipt with the grade stamped, on the paper (labels synthetic demos). Auth pages: display title
  and a "terms of the audit" receipt beside the form. 404 ("404." and a NOT ON FILE stamp) and error (NOT PRINTED).
  Methodology: ink reading text, mono chips, ledger headings (generated text untouched). Trades: ledger stat cells,
  ledger table frame. Analytics: single-hue ink scales come from the tokens (measured = ink); not-computed blocks as
  ledger sections. Settings, check, legal and analytics charts restyle through the tokens. Fixed on the way: a visually
  hidden table caption widened the trades page on phones (scroll containers are now `relative`, also DataTable and
  Orders). Deleted v2 leftovers: ScoreGauge, StackBar, IntervalPlot and their geometry test; the lab keeps only v3.
  Checks: vitest 664 passed, tsc 0, lint 0 errors, build ok; looks at 1440/390 of verify, login, settings, trades,
  analytics, methodology, 404, onboarding: no overflow, axe 0 serious (the share page's axe finding is in the QA list).
- **Step 7, done (with fixes 1 and 2):** landing page rebuilt. Hero (`TapeHero`): headline bottom-left at editorial
  scale, lede and the call to action bottom-right, the tape of the 38 real prints full-bleed and feeding right to left
  from frame 0 (starts at -40 px, never an empty left side); pinned and scrubbed, it stops on the order and the pen draws
  the spread bracket, the impact bracket and the two fee circles, each with its amount in pen-ink tied to the mark by a
  hand-drawn leader (`leaderPath`); on a phone the two fee circles are centred with their note and leader, and spread,
  impact and fees are printed as receipt lines under the tape. The geometry (stop point, marks, leaders, notes) is
  computed on the server from the fixed entry widths (`heroGeometry.ts`, tested), so without script or with reduced
  motion the complete annotated frame shows; `html.fs-js` (inline script before paint) arms the first frame. The story
  ends (`StoryEnd`) on the order's $0.25 in pen-ink at display scale with "10.0 bps; fees were 99.99% of it" and a pen
  double underline, written left to right as it scrolls in. All figures from `lib/landing/heroData.ts` (tested against
  the replay fixture); the landing fixtures moved from the lab to `app/lib/landing/fixtures/`. Demo accounts as three
  receipts pinned with tape (grade stamp, total, orders, link); "Check it yourself" as an envelope whose manifest rises,
  lines tick "OK" and the signature stamps (CSS, once on view), with links to /verify, the method and fillscore-metrics;
  the "never" statement; the closing call to action. `pinnedStory.ts` no longer creates its own Lenis (LandingMotion owns
  it). Deleted: the v2 `HeroTape`, `tapeModel`/`geometry` and their tests (drawing tests of the deleted v2 tape; the
  order-choice invariant stays in `heroOrder.test.ts`), `ScrollStory`, `dot-pattern`, unused v2 hero fixtures. Checks:
  vitest 671 passed, tsc 0, lint 0 errors; looks: start, mid-story and end frames at 1440, start and finished at 390,
  demos and check-it: no overflow, axe 0.
- **Step 6, done:** Council as an auditors' memo: a TO/FROM/RE header in mono, Quick/Deep pill switch, the four
  specialists as typed notes ("NOTE n OF 4", slight tilt on wide screens), the debate as a transcript (speaker in mono,
  recorded words verbatim), the explanation block under its unchanged heading "Explanation (language model; every
  number was checked against the audit)", findings with a small "verified" stamp. Evidence as two stamped envelopes
  (drawn flap, "SIGNED Ed25519" stamp, contents, key fingerprint, an ink progress line and printed status); demo
  accounts show "NOT ISSUED" with the existing explanation. Found and fixed while doing it: the receipt's SIGNED stamp
  linked to evidence for demo accounts too, which have no signed pack; now only real accounts show SIGNED, and a demo
  receipt prints "NOT SIGNED, demo: nothing of yours to sign". Checks: vitest 678, tsc 0, lint 0 errors; looks:
  Council 1440/390 and Evidence 1440, no overflow, axe 0.
- **Step 5, done:** Rules as ledger rows: order id and symbol in mono, the finding, the cost circled by the pen
  (`PenCircle`, seeded) with the rule written beside it in pen-ink ("Met: High total cost"), the review state as a
  printed mark, review buttons only for signed-in accounts; a row prints the order's receipt. Rankings as a tape on a
  receipt strip: rank 1 first in Cabinet Black, a shared bps ruler with zero, the pen bracket (`PenBracket`) for each
  90% interval and an ink median dot, the interval also printed in pen-ink words, shared ranks in graphite with "not
  distinguishable from ...", groups under 20 orders listed after as "too few to tell"; `RankTable` kept as the table
  form; `rankingsView` tests unchanged. Checks: vitest 678, tsc 0, lint 0 errors; looks 1440/390: no overflow, axe 0.
- **Step 4, done:** Orders as a ledger (Departure Mono figures, ink header rule, dashed row rules, sortable, filter and
  side switch kept); `OrderReplay` rewritten as the thermal receipt (Radix Dialog printing down from a slot on a desktop,
  Vaul drawer with a torn top on a phone), wired to `GET /audit/orders/:id/replay` for every order: order record, fills,
  the fills drawn against time with "FILLS ONLY; THE PUBLIC PRINTS ARE IN THE SOURCE FILE." (the payload never carries
  prints today), cost lines with leaders and NOT COMPUTED for a missing value, perforation, heavy total, the expected-cost
  line or its insufficient-data reason, notes, sources with hashes, the SHA-256 of the order record and its bars
  (labelled not scannable), a SIGNED stamp linking to the Evidence section, "Copy order id" as a printed slip. Test id
  `explain-replay` kept. Checks: vitest 678 passed, tsc 0, lint 0 errors; looks at 1440/390 with the receipt open: no
  overflow, no overlap, axe 0 serious.
- **Step 3, done:** `Overview` rewritten: the total as the image (`SplitFigure`: ink dollars, graphite cents, NumberFlow
  only after a change), the headline sentence, measured and published-rate fee figures; the grade as a rubber stamp
  (`GradeStamp`, served v2 letter and score, band, the frozen v1 line beneath); the month tape (`MonthTape`, model
  `monthTape.ts` with hand-computed tests; one tick per order from `/audit/trades`, height = the order's value because the
  overview has no per-order cost without fetching every replay; hover/arrow-key receipt preview; Enter opens the order in
  Orders); "Where the $X went" as receipt lines (a real table, test ids kept) beside the medians; cost against expected
  as a pen bracket on a ruler (`CostRuler`, one axis: paid minus expected) or "insufficient data"; outcomes as a printed
  tally (one stroke per order, unfilled in pen with the count in pen-ink); scope facts and freshness as a footer line.
  Not done: the prototype's "All orders / Market / Limit" switch, because the served orders summary has no per-type
  totals (no number is made up in the browser). v2 lab pages `/design-lab/dashboard` and `/design-lab/hero` deleted
  (they no longer compiled); `monthLabel` added to `periodLabel.ts` with tests. e2e: `rebuilt-demo.spec.ts` drops the
  click on the removed "Table" toggle (the table is always shown); `design-lab-guard.spec.ts` adds the v3 paths. Checks:
  vitest 678 passed, tsc 0, lint 0 errors; looks at 1440/390 and Carbon copy: no overflow, no overlap, axe 0 serious.
- **Step 2, done:** `AppShell` rewritten: one top bar (wordmark with the orange dot, account switcher, synthetic badge,
  period in mono, actions, "Jump to ⌘K", Carbon copy toggle, log in/out), section tabs (six views, then "More": Trades,
  Analytics, Methodology, Settings when signed in), phone navigation in a Vaul drawer behind "Menu"; no sidebar (the
  tabs fit at 1440 with room to spare). Quick-look tools for the rest of the work: `e2e-shots/mock.ts` (fixture API and
  DOM/axe checks) and `e2e-shots/look.ts`. `rebuiltCopy.test.ts`: the v2 ban on uppercase is replaced by the v3 rule
  (uppercase and widened tracking only in the printer type, `font-mono` on the same line). Checks: vitest 668 passed,
  tsc 0, lint 0 errors; look at 1440/390 and the drawer: no overflow, axe 0 serious.
- **Step 1, done:** tokens rewritten for paper (default) and carbon (`app/ui/tokens.css`, roles kept, new `pen`,
  `pen-ink`, `stamp`; next-themes themes `paper`/`carbon`, storage key `fs-theme`); contrast test covers both themes and
  the pen rules (pen-ink >= 4.5, stamp >= 3, pen on paper < 3 so it only doubles pen-ink text, no blue-black ground);
  Cabinet Grotesk and Departure Mono via `app/fonts.ts`; printed objects in `app/ui/paper.css` (receipt, torn edges,
  perforation, sprockets, stamps, slip, pen); buttons as ink pills, DataTable as a ledger, GradeChip as a small stamp
  (one ink for every grade), ValueState's two empty states printed in mono, Sonner as printed slips, ⌘K as a receipt
  sheet. Geist and the aurora removed. Checks: vitest 72 files / 668 passed, tsc 0, lint 0 errors (18 warnings,
  baseline), build ok.

## Orders of 2026-11-20, design v3 (phases R and P; local commit, not pushed)

- **Superseded next action: Design v3 proposal ready: Deepanshu picks a direction** (he picked direction 1). Reason: the order stops after phase P
  for his choice; production screens are not converted until he picks. Read `docs/design/v3-proposal/README.md` (10
  images, the two directions, what each borrows, the recommendation: direction 1 "Tape & Receipt").
- **Phase R, done:** 13 viewport captures in `.work/refs/` (not committed) from Awwwards SOTD and honors (Sweet Tape,
  Santal, Deepbook, Grids by Obys, project://cult), aqryl, Synthesis Capital, Hark Capital, Equator, Stripe Press
  (SiteInspire), UGLYCASH (One Page Love). EverSwap (preloader stuck at 0%) and Tenity (black WebGL canvas) did not render
  under automation and were skipped; SiteInspire has no finance category any more. Write-up: `docs/design/REFERENCES.md`.
- **Phase P, done:** lab under `frontend/app/design-lab/v3/` (tokens, specimen, hero, overview, receipt per direction);
  scroll story in `frontend/app/components/marketing/v3/pinnedStory.ts` (the motion test allows pin and scrub only in
  components/marketing); month fixture cut from the offline demo build through the production `buildOrderReplay`
  (`cut-month.ts`); new tests `data.test.ts` (fixture adds up to the served totals), `tokens.test.ts` (contrast),
  `lib/hash.test.ts`. No new dependency.
- **Checks before the commit:** frontend vitest 72 files, 662 passed (625 before plus 37 new); tsc 0; lint 0 errors,
  18 warnings (baseline); build ok; `impeccable detect` no findings.
- **Still waiting for Deepanshu from design v2** (unchanged): the Council "Key dispute" re-record, the replay payload's
  public prints (the v3 receipt chart needs them too for orders other than the hero), the push. (The stray root
  `package.json` / `node_modules/` are no longer present.)

## Orders of 2026-11-20, design v2 "Instrument" (replaces the M8 2b part 2 order; local commits, not pushed)

- **Done (superseded as next action by design v3 above): Design v2 ready for Deepanshu's review (docs/design/v2/).** Reason: the order stops here for his review. Report and the reviewer disposition: `docs/milestones/M8.md`. Local commits, not pushed.
- **Steps 1 to 6 of the order of 2026-11-20 (resume after the usage limit), all done:** (1) pytest 1779 passed, `run_offline.py` exit 0, `ablation.py --check` exit 0; committed in five logical commits; `.mcp.json` (shadcn MCP config, no secrets) added to `.gitignore`; `.work/` not committed. (2) QA crash did not recur; passes 1 to 3 fixed what was seen (axe, 390 px overflow, top bar); passes 4 to 6 added curated states (the ordered maximum of three applies to the fix loop). Final pass 6: 16 states, **axe 0 serious or critical, landing CLS 0.00002**, no overflow. (3) `review-animations` is not an installed skill, so the motion review used `emil-design-eng` guidance by hand (sheet easing fixed); `break-ui` ran as `e2e-shots/break.ts` (focus return after the drawer, "1 values cited" fixed). (4) First Load JS before to after: `/` 359.9 to 332.7, `/dashboard` 400.8 to 380.9, `/login` 337.1 to 309.7 (Motion features and Sonner now load after first paint). (5) reviewer subagent, 12 findings: fixed, kept or refuted one by one in M8.md (one was a fixture bug, one was wrong). (6) 12 images in `docs/design/v2/`, `docs/milestones/M8.md`, ARCHITECTURE §4 updated. **Checks at the end:** frontend vitest 625 passed, tsc 0, lint 0 errors; backend 1023 passed; e2e 37 passed; roadmap IDs OK; build ok.
- **Waiting for Deepanshu (design v2):** review of `docs/design/v2/`; the recorded Council "Key dispute" sentence states a cause and "Fee Optimizer" reads forward-looking (re-record needed, rule 6); the drawer needs public prints in the replay payload to draw the full tape (backend); untracked stray `package.json`, `package-lock.json`, `node_modules/` at the repo root from running the shadcn CLI there (safe to delete); the push.
- **Phase 3 status: built, not yet committed.** Shell (`components/shell/`: sidebar, account switcher, top bar, ⌘K, theme toggle, Vaul nav, log out), Overview bento, Orders (tanstack table + replay Sheet/Drawer with the fill tape and ledger), Rules, Rankings (RankPlot + table), Council, Evidence, landing (HeroTape with GSAP story, Lenis + SplitText, sticky scroll story with ScrollTrigger scrub, live demo cards, Check it yourself, close), trades, analytics, settings, auth pages, onboarding (designed refusal states), methodology (TOC), verify (receipt), check, share (v2 grade first via public `/audit/v2`, frontend only), legal, `not-found.tsx`, `error.tsx`. Bridge block, old palettes, Plex, Navbar, AuthNav, ExplainPanel, Headline, CostPanels, OrdersPanel, StatBlock, old lab removed.
- **Checks so far:** frontend vitest 69 files, 625 passed; tsc 0; lint 0 errors, 18 warnings (29 before); build ok; backend 122 files, 1023 passed (unchanged), tsc 0; guard table 214 passed; roadmap IDs OK. e2e last run 32 passed, 5 failed (fixes above, unverified). First Load JS (gzip kB): `/` 359.9, `/dashboard` 400.8 (part 1: 326.9), shared base about 332 (part 1: about 250; Motion via LazyMotion, Radix tooltip, Sonner, next-themes); sections of the dashboard load by `next/dynamic`; GSAP and Lenis load by dynamic import on the landing only. Not yet measured: axe, landing CLS (the QA script does both).
- **Spec changes (each has a one-line reason in the file):** rebuilt-demo (sections by `?view=`, Table toggle), council-demo and council-demo-stale (`view=council`, "Run analysis"), score-versions ("Scoring v2"), api-keys (sentence-case heading), verify-pack (scoped locator), design-lab-guard (comment), e2e-lab/lab.spec.ts rewritten for the new lab, e2e-shots/shots.spec.ts wait text. Unit tests changed with reasons: contrast (dark/light), gradeColor (new chip set), rebuiltCopy (negative tracking allowed, widened banned), motion (scrub allowed in components/marketing only; Lenis/ScrollTrigger dynamic-import rule added), coachLabels (file list).
- **Open for Deepanshu:** the share endpoint returns only v1; the card reads `/audit/v2` for demos (no backend change). Real accounts' share cards still lead with v1 until the backend returns a measured grade.
- Phase 0 done: pinned geist 1.9.2, next-themes 0.4.6, @number-flow/react 0.6.2, motion 14.14.0, lenis 1.3.27, sonner 2.0.8, vaul 1.1.2, cmdk 1.1.1, @tanstack/react-table 8.21.3; shadcn 4.23.0 components (sheet, drawer, command, hover-card, popover, tooltip, tabs, table, dropdown-menu, dialog, toggle-group, badge, separator, skeleton, scroll-area, chart); Magic UI dot-pattern (the one decorative effect). Removed simplex-noise and the old wave background. References in `docs/design/references/` (linear, vercel, stripe, mercury via `npx getdesign add`). `DESIGN.md` at the repo root.
- Phase 2 done: design lab round (hero split vs stage, overview bento vs strip); choices and reasons in DESIGN.md section 12; losers deleted.
- Rankings check (order item): the backend `rankWithNoise` is right (the lowest interval always gets rank 1). The part 1 screenshots were wrong because `e2e-shots/cut-fixtures.ts` numbered groups `i + 1` with min-max intervals and status `too_few`; it now calls the production `rankWithNoise` (demo-moderate: SOLUSDT 1, ETHUSDT 2, BTCUSDT 3, BNBUSDT too few with 16 orders). Frontend view model `app/dashboard/rankingsView.ts` with a hand-computed test (`rankingsView.test.ts`, red first: module missing).
- Landing hero order: rule in `app/lib/landing/heroOrder.ts` (nearest the lower median of demo-moderate's 84 measured market-order execution costs; ties earliest) picks `ord-moderate-BTCUSDT-968874`; fixture cut with `ml-service/scripts/cut_hero_fixture.py --order ... --out landing-order.inputs.json` (new optional flags; default run unchanged), replay from backend `buildOrderReplay`; test pins rule, data and fixture together. The lab's BNB fixture (`hero-order.*`, pinned by backend `heroFixture.test.ts`) is unchanged.

## Orders of 2026-11-20 (decisions, item 4 part 1; local commits, not pushed)

State given by Deepanshu: commits through `2f4861a` are pushed; CI green; smoke 15/15; `/design-lab` answers 404 in production; Vercel Node 26.x. Decisions: direction A "Audit report" (light) with IBM Plex Sans (Plex Mono only for hashes, ids and the key fingerprint), one theme, no toggle; the GSAP licence check; the renderer fix; claim rules 1.3.0; the re-record of the three demo Council runs (at most 5 live runs).

- **Next concrete action: M8 2b part 1 ready for Deepanshu's review (screenshots in `docs/design/2b-1/`); part 2 next: landing with hero, trades, analytics, methodology, verify, check, share.** Reason: the order stops after part 1 for his review. **Note for part 2 (recorded as ordered, not built):** the hero shows the market tape from frame 0 and animates only the order's story; the ledger area keeps its space with a muted axis, so there is no blank gap and no layout shift; the hero order is chosen by a stated deterministic rule (for example the market order nearest the account's median execution cost), shown in "Figures and sources".
- **Decision, GSAP licence (item 28): done, commit `d730253`.** Read from https://gsap.com/community/standard-license/ (HTTP 200): "Standard "No Charge" GSAP License", effective 2025-04-30, modified 2025-05-30. Commercial use at no charge including all plugins; a Prohibited Use is a tool that lets users build visual animations without code and materially assists a solution competing with Webflow; Webflow may modify (no material degradation of security, integrity or functionality) or terminate (on non-compliance); not an OSI licence by our reading. Nothing contradicted the orders (two nuances in `THIRD_PARTY_LICENSES.md`: the competition test is "encourages, induces or materially assists", and termination follows non-compliance). The page incorporates Webflow's Terms of Service, which I did not read.
- **Decision, renderer (item 25): done, commit `b5cae9a`.** `format_value` formats a key with `_bps_` inside (`alpha.median_opportunity_bps_unfilled`) as bps. Hand test first (red: `RenderError: unformatted`). LOG §AB records that `evidence_cited` read 0 in runs 1 to 6 for this structural reason; the recordings stay as recorded.
- **Decision, claim rules 1.3.0 (item 27): done, commit `c0eaa3b`.** The specialists' flags, as the card shows them (humanised like `flagLabel`), go through the counterfactual and advice lists; no passed finding excuses a flag. Hand cases and false-positive guards (34 passed; red = import error), the live path drops such a flag (red first: "needs_to_widen_limits" survived because only the displayed form matches "needs to"). Measured invariant extended: `claim_rules_1_3_0` beside `claim_rules_1_2_0` (pinned at 1.2.0, results reported as they were). The serving path refuses `demo-moderate`'s old run too.
- **Decision, re-record (item 26): done, commit `4b06361`; 3 of the 5 Council runs of this session used, no retry.** `demo-aggressive` (POOR), `demo-moderate` (GOOD), `demo-disciplined` (GOOD): each accepted, `n_calls_ok` 9 of 9, `degraded` false, prompt 1.7.0, rules 1.3.0, serving check clean, sweep for `failed:`, `Max retries`, `_default_`, `rate limit`, `RouterExhausted`, `REJECTED`, `fell back` zero; `http_429` appears once in each of runs 2 and 3 (retried on the same model, recovered, `n_calls_ok` still 9). Models: specialists qwen3.8-27b, debate gpt-oss-20b, synthesis qwen3.8-27b in all three. Table, the text I read and what I left as recorded (an intent attribution, two contradictory debate claims, thin fallback sentences): LOG §AB. The e2e exemption for "Unfilled Opportunity Cost Assessed" is deleted; `test_demo_runs_no_causal_wording` expects all three served; e2e adds two served specs and two refusal specs (a stored run changed on purpose). Offline: `claim_rules_1_2_0` flags 18 of 39 (20 before the re-record), `claim_rules_1_3_0` 18 of 39.
- **Item 4, M8 phase 2b part 1: done, commit `61f2e0e`; report and the reviewer table: `docs/design/2b-1/README.md` (16 screenshots).** Built: production tokens A and Plex fonts (old fonts, old tokens, the unlayered resets removed), the app shell, one auth layout for the five account pages, the dashboard rebuilt around one headline, settings, the evidence panel (downloads with progress, a 503 state, an explanation for demo accounts, the fingerprint in mono, a link to /verify, the `evidence_pack_download` event), `formatUsd` and `formatSignedBps` (hand-computed tests). **Results:** frontend 64 files, 545 passed (61 files, 483 before), tsc 0, build ok, lint **50 warnings before, 29 after, 0 in rebuilt files**, 0 errors; backend 122 files, 1023 passed, tsc 0; ml-service 1778 passed, 1 skipped; `run_offline.py` exit 0, `ablation.py --check` exit 0; e2e **37 passed** (35 before; updated specs and the reason for each: `council-demo*` heading and panel locator, `api-keys` destructive confirm, `score-versions` and `rebuilt-demo` markup, plus the two backend/e2e copy tests below); lab spec 22 passed; guard 214; roadmap IDs OK; **axe 0 serious or critical** on dashboard, settings and login at 390 and 1440 px, no horizontal scroll. **First Load JS (gzip kB):** `/dashboard` 390.4 to **326.9** (budget +30: met, −63.5); `/` +8.7; `/analytics` +2.4; `/trades` +8.9; `/check`, `/settings` and the account pages +46 to +50 (GSAP through `Button`). **Review:** reviewer subagent, 17 findings; fixed the high one (a no-number case as plain text), the disconnect button, the totals column, the long sentence, footer alignment and more; kept 8 with reasons (table in the README). Two older tests changed with a stated reason: `backend/src/__tests__/copyHonesty.test.ts` (the venue card left the dashboard; the component label is sentence case now) and `app/utils/coachLabels.test.ts` (the coach and insights sections are gone). **Removed from the dashboard, flagged for review:** v1 component cards (now a disclosure), cost breakdown, trend chart, exchange comparison, coach and insight cards (not in the ordered list; routes and data untouched).
- **TDD notes:** red phases shown for the renderer, rules 1.3.0 (both the hand cases and the live path), `formatUsd` (5 failed first) and the evidence-pack helper (one red from my own miscount of a 42-character fixture: the hand value was wrong, the code was right; fixed and noted in the test). The `headline.ts` view model and the Field-id fix were written with their tests; their first run was green (no separate red run); the copy/style test (`rebuiltCopy.test.ts`) was written after the files and checked with a negative control against six sample strings.
- **Not verified:** no real phone; the signed-in screens only with mocked API answers (and e2e); the Explain panel's queue and rankings in the screenshots are layout stand-ins; Flip, disclosure and toast motion by tests only, not by eye; `docs/design/2b-1/README.md` lists the open performance item (load GSAP on first use so the account pages stop paying for it).
- **Waiting for Deepanshu, new:** (1) review of part 1 (the screenshots) and the call on the removed v1 dashboard sections; (2) a stray git worktree registration: `git worktree add` was used once to build a baseline, my `git worktree remove` was blocked by the guard (correctly), so `.git/worktrees` still lists a detached checkout in the scratchpad folder (it holds nothing of value): run `git worktree prune` after the folder is gone, or `git worktree remove --force <path>`; (3) the push of the local commits (this order's: `d730253`, `b5cae9a`, `c0eaa3b`, `4b06361`, `61f2e0e`, and this note).

## Orders of 2026-11-19, second batch (items 1-4; local commits, not pushed)

State given by Deepanshu: commits through 62441b1 and "quote env example values" are pushed; CI green; smoke 15/15; Vercel Node 26.x; Deployment Checks cover all seven jobs; key-envelope migration applied (legacy 0); item 24 done by him. No live Council or Groq call in this session.

- **(Superseded by the orders of 2026-11-20 above: he chose A and IBM Plex Sans, and part 1 is built.) Was: Next concrete action: M8 lab ready: Deepanshu picks A or B and the fonts.** Reason: the choice of direction and type is his (M8 is collaborative), and phase 2b (production screens) cannot start before it. Everything he needs is in `docs/design/lab/README.md` (23 screenshots in the same folder).
- **Item 1 (JWT secrets): done, commit `4c4d460`.** `REFUSE_SHORT_JWT_SECRET = true` (`backend/src/config/env.ts`). Four older tests booted a "production" process with short fixture secrets; their fixtures now use 64-character secrets (they test other things). Test 1d now expects the refusal. Backend 121 files, 1020 passed, tsc 0.
- **Item 2 (claim rules 1.2.0, v3 flip): done, commit `f248d32`.** Details and numbers: LOG §Z. (a) Rules 1.2.0 in `agents/claims.py` with hand cases and guards (`tests/test_claim_rules_1_2_0.py`, red = import error, then 31 passed); new runs are checked and redacted under them. (b) Measured, not gated: `claim_rules_1_2_0` in `evals/invariants.py`, shown by `run_offline.py` and as a column of the ablation table. (c) `golden/v3/MANIFEST.json` `recorded: true` with the note naming the three runs that state a cause; 18 recordings committed as recorded. `run_offline.py` exit 0 ("39 runs x 6 invariants: 0 violation(s)", claim_rules_1_2_0 20 of 39 runs); `ablation.py --check` exit 0; the three ml tests that waited on the flip pass. ml-service: 1733 passed, 1 skipped. **evidence_cited, runs 4-6: Council 0/9, single 0/9; runs 1-3: 0/9 and 0/9; with or without the two gpt-oss-20b specialist runs also 0.** **Claim rules 1.2.0, runs 4-6: Council 6/9 runs flagged (4/7 without the two 20b runs), single 2/9; runs 1-3: Council 8/9, single 2/9.** **Finding: evidence_cited cannot pass today.** The required alpha key `alpha.median_opportunity_bps_unfilled` ends in `_unfilled`, `render.format_value` formats `_bps` only, so the placeholder cannot be rendered and no run could state it (LOG §Z). Not fixed, because a formatter change alters the conditions of a later re-record: waiting item 25. (d) The serving path now refuses a demo run that fails 1.2.0 (`council_service.fails_current_claim_rules`, tests red then green). **Demos that go dark ("Demo analysis not yet generated for the current demo data"): `demo-aggressive` and `demo-disciplined`** (both "..., resulting in ..." in one specialist field); `demo-moderate` is served. Re-record of those two: waiting item 26. I did not read Atlas for newer stored runs. TDD note: the older tests whose fixtures used number-free judgements or "drove" were adjusted with a stated reason (council_grounded, specialist_claims, claims, reapply_claim_check); no hand-computed value was changed.
- **Item 3 (M8 phase 2a, the design lab): done, commit `5914b05`; report `docs/design/lab/README.md`.** Built: `/design-lab` (4 pages; 404 in production by `designLabEnabled`, proven by an e2e spec on the production build; no sitemap; noindex), tokens A and B (`frontend/app/ui/tokens.css`, parsed by the contrast test), 14 components (`app/ui/`), the motion module (`app/lib/motion.ts`, GSAP 3.15.1 and @gsap/react 2.1.2 pinned exactly, `@axe-core/playwright` 4.14.0 pinned), the hero prototype from one real demo order (fixture = `buildOrderReplay` output, pinned by a backend test), the dashboard headline and evidence mock. **Results:** frontend vitest 61 files, 482 passed (was 52 files, 387), tsc 0, lint 0 errors and the same 50 warnings, build ok; backend 122 files, 1023 passed, tsc 0; e2e 35 passed (was 29; +4 lab 404 specs, +2 refused-demo specs); lab browser spec 44 passed, **axe 0 serious or critical on all four pages, both directions, 390 and 1440 px**; contrast tests 31 passed. **First Load JS (gzip kB, estimated from the build, before to after):** `/dashboard` 390.2 to 390.4 (budget +30), `/` 259.4 to 259.4, `/analytics` 373.7 to 373.7, `/trades` 261.2 to 261.2; the lab routes are about 304. **Fonts, measured in the browser:** IBM Plex Sans and Hanken Grotesk have true tabular figures (0.00 px digit-width spread); Schibsted Grotesk does not (1.00 px) and widens punctuation; proposal A Plex Sans, B Hanken Grotesk. **Token deviation:** A's ochre fails as text (3.91:1), so a text variant (#8A5A0B, 5.46:1) was added; edges, danger and the chart floor are in the README. **Independent review** (reviewer subagent, 23 screenshots): 11 findings, 9 fixed, 2 kept with reasons (README table); the high ones were a "measured" marker on a headline total that is mostly fees at the published rate, and phone hero text that was too small. **Not run / not verified:** the GSAP standard licence could not be read (site down), so its terms are NOT verified (waiting item 28); plugins ScrollTrigger and SplitText are not used (nothing to dynamic-import yet); no lab page was reviewed on a real phone; TDD note: component tests were written together with the components (first runs green, no separate red run), the red phases were shown for the contrast, motion, format and hero-geometry modules. Two production stylesheet lines were touched (an import and a scoped reset); no screen changed.
- **Item 4: done.** Stopped here as ordered. The next action above is the one ordered.
- **Waiting for Deepanshu, new:** items 25 to 28 below, and the choice itself.

## Orders of 2026-11-19 (items 1-11; local commits, not pushed)

- **(Superseded by the second batch above: the proposal was answered and phase 2a is built.) Was: M8 proposal ready for Deepanshu** (`docs/design/M8_PROPOSAL.md`, questions in its section 5). Reason: M8 is a collaborative phase and I stop after phase 1, as ordered. **Also waiting for Deepanshu, none of which blocks me:** items 23 (what to do with the ablation runs 4-6, which blocks the `golden/v3` flip and the three failing ml tests), 24 (quote the `.env.example` values; I cannot read those files), the Vercel Node setting (`docs/runbooks/DEPLOY.md` §4), item 20 (his export of the Render boot lines; then flip `REFUSE_SHORT_JWT_SECRET`), the key-envelope migration (dry run, then `--apply`), item 17 (live CCXT run), the first real-trade validation, and the push. **Local commits of this session (not pushed):** `3076076` (1), `bce3291` (2), `5aee75a` (3), `ad9c264` (4), `ff4e03b` (5), `9c56df0` (6), `65dfb4b` (7), `c1ae9b8` (8), `f8adbd8` (9), `9a2555e` (10), `62441b1` (11).
- **Item 11: done (commit follows).** `docs/design/M8_PROPOSAL.md`: screen inventory of `ARCHITECTURE.md` §4 (purpose, data, current problems per screen), design-system proposal (type, colour with measured contrast, spacing, components, and one component for measured / not computed / insufficient data), M8 notes (the 50 lint warnings by rule and file, the missing evidence-pack download button, renaming "Alpha Architect" as a display label only, the "Left, on purpose" items of M9), and 8 questions. No UI code. Limit stated in the file: no screen was reviewed visually; the problems are code-level facts and measurements.
- **Suites at the end of the session (2026-11-19, final tree):** ml-service 1685 passed, 1 skipped, 3 failed (the three offline-runner tests that need the untracked recordings out of the folder or `golden/v3` flipped; item 23); backend (Node 26, after item 6) 121 files, 1020 passed, tsc 0; frontend (Node 26) 52 files, 387 passed, tsc 0, lint 0 errors (50 warnings), build ok, e2e 29 passed, mcp-server 26 passed (those three last run after the Node move and before items 5-11, which did not touch them except the `@types/node` bump, tsc 0 after it); guard 214 passed; roadmap IDs OK; run_offline and `ablation.py --check` ran at item 1 (exit 0; `evidence_cited` still unflipped). Not run this session: the Docker builds, the CI run (the push is his).

- **Item 1: done as a verification, NOT flipped (reason below).** All 18 recordings checked offline (LOG §W). Sweep: no match. `check_council_run.py`: 9 of 9 Council runs ACCEPTED, `n_calls_ok` 9/9 in each (the 11-15 in `tokenUsage.n_calls` are HTTP-level successes that include grounding regenerations; 429s 0-3 per run, all recovered). Models: all debate and synthesis calls on the primary; one specialist call served by gpt-oss-20b in disciplined-4 and aggressive-6. **Failed (d):** `council-demo-disciplined-5` states a cause ("inherent to the limit-order strategy rather than a routing error"); `single-demo-disciplined-5/-6` say "resulting in a fee drag". Several runs also carry ungrounded judgements ("efficient routing", "low fee drag", "within acceptable range"). So `golden/v3/MANIFEST.json` stays `recorded: false`, no recording deleted or moved, the three ml tests still fail locally. Decision for Deepanshu (waiting item 23).

- **Item 2: done except 2(b) (blocked, see below).** (a) `ml-service/scripts/env_report.py` (new; loads both service env files with python-dotenv, prints variable names only; 4 tests) and `check_demo_seeded.py` (new). `rerecord_ablation_v2.sh` and `validate_real_account.py` now load values themselves and print only names (dry run of the script showed the names and "demo-moderate orders: 245"). No script or doc told anyone to source an env file; the only matches are the guard's own deny tests and an old plan's deny-list. `tests/test_no_env_sourcing.py` fails if a tracked file ever does (2 tests). The sweep in step 3 of the re-record script also lacked `http_429`; added. (c) Waiting item 17 and the `ccxtShadow.ts` header now use `read -rsp` into exported variables, then `unset`. (d) Searched docs, scripts, READMEs, CONTRIBUTING: nothing else. TDD note: the red phase was shown for `env_report` (module missing); the `validate_real_account` wiring test and the no-sourcing test passed at once (written after the edit / characterisation of a clean repo). **2(b) blocked:** the permission settings deny me read access to the `.env.example` files (and the guard refuses printing them), so I cannot see which values need quotes. Prepared in `.work/proposed/env-example-quoting/test_env_example_quoting.py` (detector with hand cases plus a test over the three templates). Waiting item 24.

- **Item 3: prepared, not enabled.** `backend/src/config/env.ts`: `export const REFUSE_SHORT_JWT_SECRET = false`; `loadEnv(warn, { refuseShortJwtSecret })` (the option is for tests). When true, a deployed or production process with `JWT_ACCESS_SECRET` or `JWT_REFRESH_SECRET` under `JWT_SECRET_MIN_LEN` (32) throws a message naming the key and its length (never the value); a test process is never refused, because the test suite uses short secrets (`test1`). Tests `env.test.ts` 1d-1f (31 refused, 32 accepted, off by default); red first (2 failed), then 14 passed; tsc 0. Boot warning unchanged. **To flip after Deepanshu's export shows no short-secret line:** set the constant to `true` (one line); nothing else. Remember the ml-service reads `JWT_ACCESS_SECRET` too and must hold the same value.

- **Item 4: done (one commit).** Node 26.13.1 is the Active LTS (nodejs/Release `schedule.json`: 26 "Lithium" LTS from 2026-10-28, 24 maintenance from 2026-10-20, 20 ended 2026-04-30; Vercel lists 26.x as default; `docs/runbooks/DEPLOY.md` §4 has the citations). No dependency broke, so no fallback to 24. Changed: `.nvmrc` 26 (CI reads it), `backend/Dockerfile` `node:26-alpine` (tag exists on Docker Hub), `engines.node >=26` in backend, frontend and mcp-server, `@types/node` ^26.6.6 (both lockfiles), `scripts/dev.sh`, the rules files, CLAUDE.md, ARCHITECTURE.md, SECURITY.md. **Suites on Node 26.13.1 after a clean `npm ci`:** backend 119 files, 1004 passed, tsc 0; frontend 52 files, 387 passed, tsc 0, lint 0 errors (50 warnings), build ok; mcp-server 26 passed; e2e 29 passed (ml-service does not use Node). The `@types/node` bump came after these runs; tsc is 0 on both after it, and the final full run (end of the session) repeats the suites. Vercel instruction for Deepanshu: Project, Settings, Build and Deployment, Node.js Version, 26.x, then redeploy (steps in DEPLOY.md §4). Waiting item 21 is decided and built; the setting in Vercel is his.

- **Item 5: done (commit follows).** `ml-service/Dockerfile` installs from `requirements.lock`. `scripts/audit_gate.py` + `security/audit-allowlist.json` (empty) + SECURITY.md section: the gate fails on high/critical npm advisories and any pip advisory; an allowance needs no fix available, an unexpired date and the id recorded in SECURITY.md. Steps added **inside existing jobs**: `backend`, `frontend`, `mcp` (replaces its old `npm audit` step), `ml-service` (`pip-audit==2.10.1`, pinned). Today: backend, frontend, mcp-server 0 vulnerabilities; lock file 84 packages, 0 vulnerabilities (all run locally through the gate: "ok"). All 5 actions pinned by commit SHA with the version comment (checkout v7.0.1, setup-node v7.1.0, setup-python v7.1.0, cache v6.1.0, upload-artifact v7.0.2; resolved with `git ls-remote`). Tests `tests/test_audit_gate.py` (9; red = module missing, then 9 passed). Not verified: a Docker build of the image (no docker run here) and the CI run itself (push is Deepanshu's). **CI job names after this change (unchanged, none added or renamed): `secrets`, `backend`, `frontend`, `mcp`, `ml-service`, `eval`, `e2e`** — the Vercel Deployment Checks list stays as it is.

- **Item 6: done (commit follows).** `utils/encryption.ts`: `encryptApiKey(plaintext, ctx)` / `decryptApiKey(payload, ctx)`; AAD is the JSON array `["fillscore-key-envelope", 2, userId, exchange, field]` (field = apiKey, apiSecret or passphrase, added so a key cannot be presented as the secret); payload carries `v: 2`; no `v` = legacy, still decrypts. A version 2 blob read without or with another context fails the tag check; stripping `v` fails too. `services/keyEnvelope.ts` (`openConnection`, `readConnectionSecrets`): `SyncService` reads through it and legacy blobs are stored again as v2 on that read (a failed write is logged by class and does not stop the sync); `/connect` writes v2. `scripts/migrateKeyEnvelope.ts`: **dry run by default** (counts: total, already v2, legacy, failed; writes nothing), `--apply` is Deepanshu's; a connection that cannot be decrypted is counted and left untouched; output is counts only. Model: `v` added to the encrypted-field schema. Tests (16 new; red first: 8 failures plus a missing module, then green): moved to another account, another exchange and another field fail; old blobs still read; re-encrypted blob has `v` 2; second read writes nothing; dry run writes nothing; apply upgrades legacy only; undecryptable left untouched; no value printed; a scan test that every production `encryptApiKey` call passes a context. Backend full suite after: 121 files, 1020 passed, tsc 0. SECURITY.md updated, including the residual: until every connection is v2, a legacy blob moved by someone with database write access still decrypts. **For Deepanshu after the push:** `cd backend && npx ts-node src/scripts/migrateKeyEnvelope.ts` (dry run, read-only), then `--apply` (writes Atlas; I did not run either).

- **Item 7: recorded, nothing built.** Items 16 (funding costs) and 19 (EVM DEX audit) are **deferred by Deepanshu, 2026-11-19**. For 16, Binance's official documentation does **not** say whether a key with only "Enable Reading" can read USDⓈ-M futures income: `GET /fapi/v1/income` is "USER_DATA" ("signed endpoint", "An API Key is required"), the General Info page says "USER_DATA | Endpoint requires sending a valid API-Key and signature", and neither page names a permission; the key-creation article (updated 2026-11-06) says only that unrestricted-IP keys "won't have any permission other than reading". Citations with quotes: LOG §X. Result: not confirmed; I3 stays (keys with a futures permission are refused). Items 16 and 19 below are marked deferred.

- **Item 8: done (commit follows).** 120 seeded random symbol-hours of January 2024 (4 symbols, 28 days): max absolute difference of the kline context against the aggTrades context **sigma 7.82e-13 bps, volume 4.19e-9 base units (relative 3.31e-14)**; all 120 compared, no None mismatch. Kept as `tests/measure/test_kline_equivalence.py` (4 tests; the cache-recompute test skips where the caches are absent, i.e. CI) with the committed result `tests/fixtures/market/kline_equivalence_2024-01.json`. Details and limits: LOG §Y. TDD: red = module missing, then 3 passed and the result-file test red until the real run produced the file, then 4 passed.

- **Item 9: done; something was missing, so I built it (commit follows).** Before: the report printed the score, component lines and an order count only. Missing and added to `ml-service/scripts/validate_real_account.py`: (1) the kline hook (`expected_cost.runtime.kline_expected_cost_hook`, as production) so market orders get an expected cost, and `cost_vs_expected` with "insufficient data ... at least 20 are needed" below 20; (2) order outcomes by type from the order records; (3) the cost of orders below a full fill (USD total, median bps, not-measured count); (4) fees paid against the account's stated rates (BNB-aware, 1% band, no-snapshot count). Exact printout for a 30-order fixture (24 market, 6 limit of which 3 cancelled, no BNB): `docs/runbooks/REAL_ACCOUNT_VALIDATION.md`. Tests (hand-computed): `test_validate_report_sections.py` (4; red = no such functions, then green) and `test_validate_real_account_shape.py` (6, written after the code, green first run; the unfilled total 0.03 USD and median 1e4/42028 bps are hand values). ml-service scoring_v2 folder: 182 passed. Not run on a real account, and the live kline path was not exercised here.

- **Item 10: done (commit follows).** The milestone table now matches the reports that exist (M2 row, M3 "reviewer pass and report next" and "(to write)" replaced by the finished state and `docs/milestones/M3.md`, M5-M7 rows, real commit hashes in place of "CCXT commit", "DP commit"). The scratchpad worktree note is removed: the folder does not exist and `git worktree list` shows only the main tree.

## Short task of 2026-11-18 (CI failure, deploy gate): done, local commit, not pushed

- **Next concrete action: Waiting for Deepanshu: push the CI fix; apply the Vercel gate from `docs/runbooks/DEPLOY.md`.** (M8 stays the next stop after that.)
- **Cause (b), a real bug:** `resyncScheduler.ts` let a tick that was already running keep starting syncs after `stop()` returned (the tick searches the database first, then calls `start()` for up to 3 accounts one after another). Fix: a stop flag checked after the search and before each `start()`. Deterministic tests added (red first: `expected 6 to be 5` reproduced locally, and the new in-flight test failed). The scheduler test now uses fake timers and an injected finder.
- **Other timing tests made deterministic:** `SyncJobService.test.ts` (3) and `syncJobRoute.test.ts` (3) now wait for conditions (`src/test-utils/waitUntil.ts`) instead of sleeping.
- **Alert 272:** `picomatch`, advisory withdrawn by GitHub, alert closed as fixed, no patched version; build-time only; recorded in `SECURITY.md`; no change.
- **Deploy gate:** `docs/runbooks/DEPLOY.md` (Render button rule, Vercel Deployment Checks steps, fallback with proposals in `.work/proposed/`, smoke test with the live commit). Nothing changed in Vercel or Render.

## Orders of 2026-11-18 (Deepanshu's updates; priority order 0 to 4, then the rest of M6, M7, M9; stop at M8)

Facts from Deepanshu: M3-M5 are pushed (CI green, Render deployed, smoke 15/15). **Item 12 done:** the signing key is set; fingerprint `ba11aa53c4961be4` (recorded in LOG §T and `docs/milestones/M5.md`). **Security rule from now on:** never put a connection string on a command line in any script, doc or suggested command; scripts read it from the environment only. (The Atlas password for `fillscore-app` leaked through a job notice and was rotated on 2026-11-17.) **Item 10:** Deepanshu runs the re-record on day 1 (2026-11-18) and day 2 (2026-11-19). **Until he reports both days done: no live Council or Groq call, and no change to `ml-service/evals/recordings/` or `golden/v3`.** After that: set `"recorded": true` in `golden/v3/MANIFEST.json`, run `run_offline.py` and `ablation.py --check`, report the first `evidence_cited` numbers. **Item 13 declined** (client-side verification instead; the 10 kb body limit stays). **Item 15 approved with constraints** (read-only scope only, shown once, SHA-256 hash with visible prefix, 90-day default expiry, revocable, at most 5 per user, per-key rate limit, `lastUsedAt`, account-isolated, cross-user tests, settings page). **Item 14:** no Kraken or Coinbase account; build the Kraken mapping from the official documentation, label it "not yet checked against a real file"; Coinbase only through a user-supplied mapping; do not block on samples.

- **Priority 0 done (`058d4e4`):** `backend/src/services/signingKey.ts` (both PEM forms load; one startup line with present yes/no, length, PEM lines yes/no and the parser's error class, never the value), `EVIDENCE_SIGNING_KEY` with `sync: false` in `render.yaml`, `rerecord_ablation_v2.sh` accepts `MONGODB_URI` (the name ml-service reads), `MONGO_URI` or `MONGODB_URL` and prints only the name it read. 6 new tests. One slip to record: while testing the script I put a dummy `mongodb://127.0.0.1:1/x` on a command line (no secret in it; the rule above forbids the habit and I will not repeat it).
- **Priority 1 done (commit follows this entry): cost vs expected for real accounts.** Klines source, equivalence check, request-weight handling, lineage and limits: LOG §U. The measurement job's hook (`expected_cost/runtime.py`) reads the hour before each MARKET order from Binance public 1-minute klines (`measure/data/klines.py`, no key, cached per symbol and hour, job budget of 40 requests, stops on 418/429 or a used weight of 80% of the limit); `/internal/score-v2` stores `costVsExpected` beside the grade; `/api/audit/v2` and the evidence pack return it. Tests with hand-computed values and a committed real kline fixture: ml-service `test_klines.py` (15), `test_kline_hook.py` (8), `test_internal_score.py` (+2), backend `auditV2.test.ts` (+2). TDD notes: red phases shown for the score route (`KeyError: 'costVsExpected'`), the backend field (value undefined) and the stamp matcher; the klines module was written right after its tests without a separate red run (the first run was the green run; the real-fixture equality test is the check that matters).
- **Found: the offline runner mis-owned single-call recordings** (`golden_sets.stamp_matches` ignored `single_prompt_version`). Fixed with a test. Effect after Deepanshu's day-1 run: the nine single recordings are now owned by golden v3 and `run_offline.py` asks for the manifest flip. **Until day 2 is done and v3 is flipped, three ml-service tests fail locally because his untracked day-1 recordings are in the folder** (`test_eval_golden.py::test_offline_runner_is_green_on_fixtures`, `test_golden_sets.py::test_v1_provenance_passes`, `test_run_offline_gate.py::test_evidence_miss_is_measured_identically_for_both_arms`). They pass in a clean checkout of HEAD plus my files (18 passed, 1 skipped), which is what CI sees. Not touched, as ordered.
- **Priority 2 done (commit follows this entry): client-side evidence verification, the `/verify` page.** `frontend/app/lib/evidenceVerify.ts` + `frontend/app/verify/page.tsx`; WebCrypto Ed25519 with `@noble/ed25519` 3.2.0 (MIT, pinned exactly) as the fallback; the pack never leaves the browser; offline script and the 10 kb limit unchanged. Details and tests: `docs/milestones/M5.md` (update of 2026-11-18). Frontend: vitest 47 files 355 passed, tsc 0, lint 0 errors (89 warnings), build 0, e2e 26 passed. TDD: red = module missing (unit tests); the e2e first failed on a real defect (the trusted key was ignored once a file was loaded), which I fixed in the page. Also fixed on the way: `shared/fieldRegistry.json` had no row for `ScoreV2.costVsExpected` (the registry test caught it). The footer links to the page.
- **Priority 3 done (commit follows this entry): personal API keys for the MCP server (ADR-0016).** `backend/src/models/ApiKey.ts`, `services/apiKeys.ts`, `services/reauth.ts`, `routes/apiKeys.ts` (`GET/POST /api/keys`, `DELETE /api/keys/:id`), key branch in `resolveAccount`, deletion and export in `routes/account.ts`, registry rows, route-table rows, Settings section (`frontend/app/lib/apiKeys.ts`, `app/settings/page.tsx`), `FILLSCORE_API_KEY` and README in `mcp-server/`. All constraints of the order are met; two additions: creating a key asks for the password again (a stolen 15-minute token must not mint a 90-day key), and the read scope is the six MCP routes, not every GET. Tests: backend `apiKeys.test.ts` (15, including cross-user reads and revocation), `accountRights.test.ts` (deletion leaves no key), frontend `apiKeys.test.ts` (9), e2e `api-keys.spec.ts` (create, shown once, read, refused elsewhere, revoke), mcp-server 17 passed. TDD: red = missing module (backend and frontend); then the first full run failed on my own test volume against the management limiter (fixed by a resettable limiter) and on the deletion test's list of collections (now includes `api_keys`). The security reviewer pass for priorities 3 and 4 comes after priority 4.
- **Priority 4 built (M6 §1: the broker-file check; review in progress, commit follows the review fixes).** `POST /ml/csv/check` (`ml-service/main.py`, `csv_import/service.py`, `route_budget.py`, `mapped.py`): signed-in only (a demo id gets 403), at most 200,000 characters and 200 fills (a bigger file is refused, never cut), 6 checks an hour and 20 a day per account (a refused file does not use one), a 60-second market-data deadline (a fill whose data did not arrive is listed as unmeasured), nothing stored, no row of the file in any log or error. Two readings: Kraken (from Kraken's documentation, labelled "not yet checked against a real file") and **mapped** (the user names the columns; this is the only way to read a Coinbase file; times without a zone are read as UTC, the fee is read in the quote currency and a fee in another currency skips the row, a file without a fee column is checked without fees and says so). The panel is on the dashboard for signed-in accounts and on a new page `/check` (linked from the empty state, for people whose trades are in a broker app). Tests: ml-service `tests/csv_import/` 46 passed (22 new: mapped parser, service, route), frontend `csvCheckView.test.ts` (10), e2e `csv-check.spec.ts` (2: the findings with the market-data call answered by a fixed hand-computed result; a refusal through the real service). Suites: ml-service 1619 passed, 1 skipped, 3 failed (the three offline-runner tests that need Deepanshu's day-1 recordings out of the folder, see above); backend 113 files, 950 passed, tsc 0; frontend 49 files, 374 passed, tsc 0, lint 0 errors (89 warnings), build 0. TDD: red = missing modules for the parser, service and route; the frontend view model was written right after its test without a separate red run.
- **Independent review of priorities 3 and 4 done (reviewer subagent, 2026-11-18).** No high finding; the keys cannot do more than the six GETs (path, method, `userId`, `requireAuth`, logging, expiry, revocation and the settings page were probed and found sound). Fixed with tests, red first: **(B1, medium-high)** the CSV budget is now reserved before the work and given back only for a file refused before any market data was fetched, one check at a time per account, so parallel requests cannot all pass and a crafted file has no free attempts; **(B2, medium-high)** at most 2 checks run at once in the whole service, at most 150 market-data requests per check, the first 418 or 429 from the source ends the check and pauses every check for the source's Retry-After (60 s default), answered "market_data_busy" without using a check; **(B3, medium)** `inf`, `nan`, an underflowing cost and a field over the CSV limit are skipped or refused with a reason, never a 500; any unexpected error answers a fixed 500 and logs only its class; **(B4, medium)** a 422 no longer echoes the input, and a body over 400,000 bytes is refused before it is read; **(A1, medium)** a password reset revokes the account's API keys; plus: key creation answers 403 `reauth_required` (a 401 made the web client retry the password check), the key list returns the 50 newest, the check panel uses the token refresh and does not send a file over 200,000 characters. Not changed: the 60-second deadline is checked between requests (one request can run longer; the unmeasured label says "could not be fetched"), the limiters live in memory (one instance, reset on deploy), no "revoke all keys" button. Suites after the fixes: ml-service 1628 passed, 1 skipped, 3 failed (the three offline-runner tests, as above); frontend 50 files, 383 passed, tsc 0, lint 0 errors (89 warnings), build 0.
- **M6 scheduled re-sync with a stale-data indicator: built (commit follows).** `backend/src/services/resyncScheduler.ts` (a tick starts a background sync for the oldest stale accounts, at most 3; stale = newest `lastSyncAt` older than 24 h, createdAt for a connection that never synced; left alone: all connections need attention, a sync running on a live lease, a failed sync in the last 6 h), `services/syncPipeline.ts` (the sync steps moved out of the route so the button and the schedule share the same lock and steps), `getSyncStatus` now returns `lastSyncAt`, `stale`, `staleAfterHours`, one line on the dashboard (`SyncFreshness.tsx`, `syncFreshness.ts`: "Data last synced 3 days ago (...). Fills made since then are not in these numbers."), `RESYNC_ENABLED` in `render.yaml` (default "true"; not started in tests). **Honest limit:** the API runs on a free instance that sleeps after 15 idle minutes, so the timer runs only while it is awake (first tick 60 s after the start, then every 10 minutes); the indicator is what tells the truth. Tests: `resyncScheduler.test.ts` (hand-computed fixture of 9 accounts, tick, failure isolation, no overlap, freshness fields), `syncFreshness.test.ts` (7). TDD: written together with the modules, no separate red run.
- **Commits:** `4f59d35` (broker file check, bounded load, review fixes), `c55e556` (scheduled re-sync, stale-data line, lint 89 to 50), the CCXT commit follows this entry. Suites for the two commits: backend 114 files, 960 passed, tsc 0; frontend 50 files, 383 passed, tsc 0, lint 0 errors (50 warnings), build 0; e2e 29 passed; ml-service 1628 passed, 1 skipped, 3 failed (the offline-runner tests that need Deepanshu's day-1 recordings out of the folder); guard 214; roadmap IDs OK.
- **Lint debt:** 89 warnings to 50. Every unused variable and import is gone, and the `any` types in libs, utils and tests are typed or carry a stated reason. The 50 left are React-compiler rules (`static-components` 10, `set-state-in-effect` 8, `exhaustive-deps` 7, `immutability` 4), 10 `window.location.href = '/...'` assignments and 11 `any` in the dashboard, trades and Council components. They need a change of structure in screens that M8 redesigns, so they are left for M8 on purpose.
- **M6 state:** §1 done (CSV check with review), re-sync done, lint done as above, CCXT in shadow mode built and tested offline (live run is waiting item 17), perpetual funding costs **not built, waiting item 16** (a key with a futures permission is refused by invariant I3). Report: `docs/milestones/M6.md`.
- **M7 in progress (2026-11-18).** (1) **zkTLS feasibility spike done: `docs/research/ZKTLS_FEASIBILITY.md`.** Verdict: feasible in principle, not buildable now. TLSNotary is v0.1.0-beta.1 and its README says it should not be used in production; both options need a live verifier or a trusted attestor; Reclaim has no full trade-history provider and its pricing could not be confirmed; a transcript proof shows only "this response came from that server", never completeness. Measured: `api.binance.com` negotiates TLS 1.3 and also accepts TLS 1.2. Nothing was built; "when to look again" and the items to confirm are in the note. (2) **`fillscore-metrics` package done (`packages/fillscore-metrics`, commit `7030aab`).** Pure Python, no dependencies, generated from `ml-service/measure/{registry,metrics,fees,orders}.py` by `ml-service/scripts/sync_metrics_package.py` (one change: the measurement version is written into the registry); `tests/test_metrics_package.py` (7) fails when the package differs from the generated one and checks package and service agree on a grid; the package's own 7 tests run the worked examples of the metric documentation; the wheel builds (1.0.0). Not published to PyPI (the owner's outward-facing step; add to waiting list at M9).
- **M7 (3) the MCP App done (`bc5935c`):** the view of `fillscore_score`, with no network access, text-only rendering, host-window check; tested with a fake host against the specification's message shapes (mcp-server 26 tests); **not yet tried in a real client** (none available). **(4) DP baselines done as a tested mechanism (ADR-0017, 18 tests), not wired in** (no users; the floating-point noise limit is stated). **(5) the EVM DEX wallet audit: not built, waiting item 19.** Report: `docs/milestones/M7.md`.
- **M9 done (2026-11-18), report `docs/milestones/M9.md`, final report `docs/FINAL_REPORT.md`.** Security review by an independent reviewer (no high finding; the medium findings are fixed with tests, red first: raw bodies in logs, account deletion and export, the refresh-rotation race, frontend headers, the required Binance variables; a per-account login limit mitigates the forwarded-address bypass), secrets scan (two dummy keys of mine recorded in `.gitleaksignore`), dependency audits, k6 script (not run: k6 is not installed), README and ARCHITECTURE rewritten, Stripe prepared and off, launch drafts, claims audit (analytics heatmap wording, the OKX "Low fees" card, the hero line). Suites at the end: backend 119 files, 998 tests (996 on the first run: one wording test fixed, one timing test passed alone), tsc 0; ml-service 1655 passed, 1 skipped, 3 failed (the offline-runner tests that need Deepanshu's day-1 recordings out of the folder); frontend 52 files, 387 passed, tsc 0, lint 0 errors (50 warnings), build 0; e2e 29 passed; guard 214; roadmap IDs OK; gitleaks: no leaks; mcp-server 26 passed.
- **Next concrete action: M8: stop for Deepanshu.** Reason: M8 (design and UI) is a collaborative phase and the brief says to stop and tell Deepanshu before starting it; I have not started it. What I would bring to it: a design-system proposal and a screen inventory (the screens are listed in `ARCHITECTURE.md` §4; the notes for M8 are the "Left, on purpose" items of `docs/milestones/M9.md`, the 50 remaining lint warnings in `docs/PROGRESS.md`, the missing evidence-pack download button, and the "Alpha Architect" name). Also waiting for him, and not blocking any work of mine: items 10 (both ablation days, then I set `recorded: true` in `golden/v3`, run `run_offline.py` and `ablation.py --check`, and report the first `evidence_cited` numbers), 16 (funding costs), 17 (a live CCXT run), 19 (the EVM DEX audit), 20 to 22, and the push of the local commits.

## Architect review of 2026-11-17 (items 1-5; local commits, not pushed)

Deepanshu reported: `c5adac6` and `575e200` are pushed, the production smoke test passed, the live demo-moderate dashboard shows the fixes and v2.3.0.
1. **Claim check, done (`f52e7e0`).** Measured first (LOG §R): a bare "because" occurs in 4 sentences of 48 stored files (the old demo-aggressive run and three recordings); golden v1-v3 and the two accepted demo runs hold none. Decision: claim rules have their own version (`CLAIM_RULES_VERSION` 1.1.0; results carry `claim_rules_version`, none = 1.0.0), so the offline check judges each recording by its own rules and the three recordings still pass. 1.1.0 adds the causal words, reads look-alike dashes, and the claim check now also covers the specialists' own text (it did not before; found by the re-record). demo-disciplined and demo-moderate pass under 1.1.0. demo-aggressive was re-recorded: **2 of the 5 Council runs of this session used** (run 1 was refused by the stricter rules and exposed the two defects), 9 of 9 calls, accepted, served. Also found and fixed: packet order was not stable for fills in one millisecond (LOG §R); without the fix all live demo Council runs would have read "not generated" as soon as Atlas returned another order.
2. **PDF report, done (`9b959be`).** A rebuilt demo's PDF prints the v2.3.0 components (equal weights, fees marked not independently measured for a demo), the shortfall totals in USD and bps with the order count, the timing note and order outcomes. The v1 grade on the cover is labelled "Published grade of the earlier demo data (scoring v1), kept unchanged", with the v2.3.0 grade beside it. Best/worst hour and symbol and the stored v1 recommendation lines are not printed for it. Tests: `backend/src/__tests__/pdfMeasured.test.ts` (hand-computed totals; pure builder, rendering and the `/report` route).
3. **M3 §2 sources (I7), done.** Tóth et al. 2011 and Donier and Bonart 2015 were read in full; the exact equations and sections are in `ml-service/expected_cost/impact.py`, ADR-0015 and LOG §Q. Almgren et al. 2005 could not be read (HTTP 403) and is cited for nothing.
4. **M3 §2 finished, done (commit follows this entry).** Calibration `ec1.0.0` on the January 2024 tapes; coverage on held-out days 0.894 to 0.948 in all 16 cells (target 88-92%; LOG §Q). `expectedCost` field on the order measurement (registry row, model, hook in the measurement job; `MEASURE_VERSION` stays 1.0.0, reason in ADR-0015). "Cost vs expected" with its interval or "insufficient data" is the line beside the letter in the v2 panel (stored beside the grade, not inside it). The v2.3.0 grades and integrity hashes are unchanged (the rebuilt `grades_v2.json` has no removed line). Not built: the residual model (needs scikit-learn; plan condition not tested); an hour-context source for real accounts (below).
5. **Ablation re-record: listed as item 10** below, with its dry-run output.
- **M3 §3 and §4 (Quick/Deep, budget engine): built on the ml-service side and in the Council panel** (tests below). Quick (one model call) is the default in the dashboard; the API default stays Deep for older callers. Budget: Deep 9 units, Quick 1, one allowance; a refused Deep run says whether Quick is still allowed; `GET /ml/agents/council/budget` reports what is left.
- **M3 reviewer pass done (2026-11-17):** no high finding; 4 medium and 5 low fixed with tests (report `docs/milestones/M3.md`, table "Review").
- **M4 built (plan `docs/superpowers/plans/2026-11-17-m4-explain-and-act.md`, report `docs/milestones/M4.md`):** exception queue with review states and grounded one-line findings (`GET/PATCH /api/audit/exceptions`), order replay with source-linked figures (`GET /api/audit/orders/:orderId/replay`), noise-aware rankings (`/rankings`), matched venue comparison (`/venue-comparison`), integrity badge, and a minimal dashboard panel (`ExplainPanel.tsx`; M8 redesigns it). Not built: fee-schedule gap A12 (needs the fee table per fill), stop-order audit A13 (no stop price stored).
- **M4 reviewer pass done:** no isolation or invariant defect; one high (the bootstrap blocked the server on big groups: fixed, 15 s to under 1 s), one medium and seven low, all fixed with tests (table in `docs/milestones/M4.md`). Local commits: `195a8a3` (M3 §2-§4 and M4), `af3f2e7` (M5 part 1).
- **M5 part 1 done: signed evidence packs (`af3f2e7`).** `backend/src/services/evidencePack.ts` (Ed25519 over a canonical-JSON manifest that lists every file with its SHA-256), `GET /api/evidence/pack?kind=scorecard|best-execution`, `GET /api/evidence/public-key`, `POST /api/evidence/verify`, and `scripts/verify_evidence_pack.mjs` (offline check with Node only). The best-execution pack says "supports your documentation" and never claims compliance (tested). The account id is not in the pack (a 16-character hash is). Without `EVIDENCE_SIGNING_KEY` the routes answer 503 and nothing unsigned is written. **Waiting items 12 and 13 below.** Not built yet in M5: the read-only MCP server, "Ask your execution" (deterministic tools only), the prompt-injection red-team in CI, rate limiting and caching, privacy-safe analytics.
- **M5 part 2 done (2026-11-17), commits `a848fd0`, `4a040fd`, `19af398`:** limiters and a one-minute cache for the evidence routes; the read-only MCP server (`mcp-server/`, SDK 1.32.2 pinned, 0 vulnerabilities, 16 tests, its own CI job that gates the deploy); privacy-safe analytics (daily counters, no identifiers, honours Do Not Track); "Ask your execution" (`agents/ask*.py`, `POST /ml/agents/ask`, `AskPanel`) with an offline red-team of 113 cases that found and closed three gaps. No Promptfoo (reason in `docs/milestones/M5.md`). Report: `docs/milestones/M5.md`.
- **M5 reviewer pass done (`d03bf67`):** three high findings (Ask's blacklist, a model number passing grounding, ids and secrets sent to the model), four medium, several low; all fixed except the verify body limit (item 13). Suites after the fixes: backend 111 files, 926 passed, tsc 0; ml-service 1550 passed, 1 skipped; mcp-server 17 passed, 0 vulnerabilities; frontend 46 files, 340 passed (run before the last change; unchanged since); e2e 24 passed (run before the Ask panel); guard 214; offline evals 0 violations.
- **M6 §1 sources read (LOG §S):** Kraken's Trades export is documented officially; Coinbase's CSV columns are not on any page we could read, so no Coinbase mapping is built. A real Kraken export file and a Coinbase sample are needed from Deepanshu (Waiting item 14).
- **M6 §1 core done (not yet reviewed, not wired to a route or the UI):** `ml-service/csv_import/kraken.py` (Trades CSV parser, header-name based, refuses what it cannot ground) and `csv_import/check.py` (each fill against the public mid, same rules as the measurement job; unmeasured fills listed, never zero; assumptions stated). 24 tests, hand-computed. **Next concrete action:** a backend/ml route that takes the CSV text (size-capped, signed-in only, at most about 200 fills, budget-limited), a small dashboard panel, an independent review, then the rest of M6 (scheduled re-sync with a stale-data indicator, lint debt, CCXT in shadow mode, funding costs). Full suites were last run green before this step; run them all again first.
- **(Earlier order, still valid after §1) M6 order:** (1) CSV import with the hidden-cost checker for broker-style exports (Coinbase and Kraken columns: fill price against the public mid at that second); (2) scheduled re-sync with a stale-data indicator; (3) lint debt (89 warnings); (4) the CCXT adapter in shadow mode beside the native Binance connector (a pinned MIT dependency; read its docs first, I7); (5) perpetual funding costs. Then M7 (zkTLS feasibility spike first, MCP App, EVM DEX audit, differentially private baselines, `fillscore-metrics` package), then M9. M8 is a stop for Deepanshu.
- **Open, not blocking:** (a) real accounts read "insufficient data" for cost vs expected until the measurement job has a source for the hour before an order (a REST kline request per order would do; the Binance kline endpoint must be read and cited before use); (b) residual model; (c) `scripts/build_demo_v2.py` now takes about 11 minutes.

## Live-site review of demo-moderate after the seed (2026-11-14, done, local commit)

Honest-number fixes found on the live site after item 9. All six have tests (backend, frontend, ml-service, e2e).
1. **Header cards:** `GET /api/audit/score` adds `current` (fills, orders, notional, maker ratio from the current trades and orders) for an account without v1 fields; the dashboard header and the PDF key metrics use it and say "fills" and "orders" apart. The frozen v1 grade is unchanged.
2. **No negative zero:** one formatter, `formatBps` (frontend and backend copies, equal by test): `0.0 bps` for exact zero, `<0.01 bps` or `>-0.01 bps` for a real value below 0.01, one decimal from 1 bps, two below. Used in the orders panel, component cards, venue panel and PDF. The CSV keeps the raw value (empty cell when not computed).
3. **Shortfall totals:** `shortfall.totals` per term (execution, spread, impact and timing, unfilled orders, fees, total) in USD and bps of intended notional, with the order count, beside the medians. It is null when a measurement states no notional.
4. **Grammar:** "their median cost" for several unfilled orders, "its" for one.
5. **Agent Council demo:** a stored run or fixture is served only if its four packet hashes equal the hashes of packets built from the current demo data; else "Demo analysis not yet generated for the current demo data." Found on the way: the packet loader ignored `MONGO_DB_NAME` (fixed, test), and the e2e ml-service read a different database than the backend seeded (fixed in `playwright.config.ts`).
6. **Trades card:** for rebuilt demos it reads "See every fill · Sortable table · Price, size and fee of each fill · Per-trade scores not computed for this data".
(The PDF's component-score rows and best/worst hour came from the frozen v1 audit for rebuilt demos; fixed 2026-11-17, see above.)

## Current milestone

**M2. Real demos** — built and verified offline (report `docs/milestones/M2.md`, with the closing steps of 2026-11-13). Done in the closing steps: v2.2.0 (timing from the excess cost of the hour, ADR-0013), the three demos regraded (90.28 A, 90.48 A, 90.06 A), `demo-okx`/`demo-multi`/`demo-bybit` removed, the rebuilt-demo dashboard (v1 views "not computed", measured order views, e2e), and the re-lock prepared (`demoV2Invariance.test.ts`). Still waiting for Deepanshu: item 9 (seed into Atlas and re-lock go-live, ready) and item 10 (ablation re-record, after 9).

**M2 closing UI task, part 1 done (commit `97a83a7`):**
- `GET /api/audit/v2` serves a demo's offline-built v2 grade (`backend/src/data/demoV2Grades.ts`, kept equal to `grades_v2.json` by a test) only once that demo's rebuilt orders are in the database. Before the seed, nothing changes.
- The response carries `demo: {dataSource: 'synthetic-demo', basis}` and `computedAt: null`.
- The v2 panel shows the provenance note and marks the fee component "not independently measured".
- The v1 grade shows "Published grade of the earlier demo data, kept unchanged".

**Part 2 (decision 11, option A, done 2026-11-13):** eight backend routes read per-trade v1 fields (`/trades`, `/trades/export`, `/report`, `/analytics`, `/analytics/exchange-comparison`, `/coach`, `/analytics/whale-correlation`, `/share/:userId`). For an account whose trades have no v1 fields: `/trades`, `/trades/export`, `/analytics`, `/analytics/exchange-comparison`, `/coach`, `/analytics/whale-correlation` and `/score` now say so (`v1Computed: false`, `notComputed: true`, null slippage, empty CSV cell); the frontend shows "not computed for this data". The PDF report says "not computed for this data" in place of the cost breakdown and the worst-trade list (it printed $0.00 before; found while writing this note, fixed with `pdfNotComputed.test.ts`). `/share/:userId` still shows the frozen, published v1 grade. A new route `GET /api/audit/orders-summary` feeds the measured order views. `seedDemoV2.ts` now also writes `order_measurements` (the offline build exports them). M8 redesigns all of this.

**M3 §1 steps 1-4 and the rebuilt-data packets done 2026-11-14; Scoring v2.3.0 done 2026-11-14 (architect order of the day).** Summary (details: `docs/research/LOG.md` §O, ADR-0014):
- Packets for rebuilt data (metrics **1.3.0**): a value that was not measured is absent from the prompt view; the measured order shortfall (`order_measurements`) takes its place. Required-evidence rule extended; `prompt_line` wired into the synthesis and single-call prompts; each specialist prompt names its headline value. Versions: prompt **1.7.0**, single **1.2.0**.
- Golden set **v3** dumped read-only from the seeded Atlas data (`--check v3` reproduces). v2 is now a pinned historical set.
- Demo Council runs re-recorded on 1.7.0: demo-disciplined and demo-moderate accepted (9 of 9). **demo-aggressive's accepted run holds a causal "because"** (`fee.recommendedAction`); the serving path now refuses any demo run whose text states a cause, so that demo reads "not yet generated for the current demo data" until it is re-recorded. The 5-run Council budget of the session is spent. Recorded output was not edited.
- Scoring **v2.3.0**: execution cost, fees, unfilled orders (equal weights); timing information only. Demo grades 94.35 A / 93.41 A / 93.68 A (v2.2.0: 90.28 / 90.48 / 90.06). `demoV2Invariance.test.ts` re-pinned; the panel leads with the dollar costs. The score does not separate the demo profiles (ADR-0014).
- **M3 §2 started (2026-11-14):** `ml-service/expected_cost/` has the square-root model and the numpy split-conformal functions with hand-computed tests (16 passed); citations verified (LOG §P). Remaining in §2: calibrate Y on the January 2024 tapes in `ml-service/.cache/market/zips` (split by day), report coverage on held-out days in LOG, add the `expectedCost` field family to the order measurement (registry row in `shared/fieldRegistry.json`, `MEASURE_VERSION` 1.1.0, ADR), and show it past-tense on the order panel.
- **(Superseded 2026-11-17: §2, §3 and §4 are built; the claim-check change and the demo-aggressive re-record are done. See "Architect review of 2026-11-17" at the top.) Next concrete action: M3 reviewer pass and report (`docs/milestones/M3.md`), then M4.**

**M3 in progress.** Plan: `docs/superpowers/plans/2026-11-12-m3-cost-and-ai-quality.md` (commit `ec9abe2`).
- (done) Plan §1, part 1: `agents/required_evidence.py` (`required_keys`, `prompt_line`) with `tests/test_required_evidence.py` (red: `ModuleNotFoundError`; then 4 passed).
- (done 2026-11-13) Plan §1 step 4: `test_evidence_cited_checks_exactly_the_keys_the_rule_names` in `tests/test_required_evidence.py` (a characterisation test: green at once, no red phase).
- **Finding 2026-11-13: plan §1 steps 1-3 (prompt wiring, version bump, golden v3) must wait for the demo Council re-record.** A bump of `PROMPT_VERSION` makes the stored demo runs (`demo_runs/*.json`, prompt 1.6.0) "from an older prompt version", and they are then not served: the live demo Council would read "not generated". Also, packets for the rebuilt demos need per-trade v1 fields (slippage, VWAP) that the rebuilt trades do not have, so golden v3 packets need a packet design for rebuilt data first. Do steps 1-3 together with item 10, after Deepanshu's seed.
- **Next concrete action (no seed needed): plan §2, expected cost per order.** Cite the square-root impact formula first (docs-researcher: Almgren et al. 2005, Tóth et al. 2011), then numpy-only fit of Y on public taker events of January 2024 with a split by day, split conformal in numpy, coverage on held-out days reported in LOG; then §3 (Quick/Deep `mode`) and §4 (budget engine). After the seed: §1 steps 1-3 below.
- **§1 part 2, to do after the seed (care: recorded outputs must not be orphaned):**
  1. Wire `prompt_line(packets)` into the synthesis prompt (`agents/synthesis.py`, where the packet placeholders are listed) and into the single-call prompt (`agents/single_call.py`), with tests that the prompt text contains every required placeholder.
  2. Bump `PROMPT_VERSION` to 1.7.0 and `SINGLE_PROMPT_VERSION` to 1.2.0 in `config/versions.py`. Do **not** touch golden v1/v2 or `demo_runs/*.json`: those fixtures carry prompt 1.6.0, and `run_offline.py` fails on a fixture whose versions match no golden set, so golden v2 (1.6.0) must stay.
  3. Create unrecorded golden set **v3** (prompt 1.7.0 / single 1.2.0 / metrics 1.2.0). `tests/test_golden_sets.py:142` expects the newest unrecorded set to match the current versions; check how it picks the set. Its case packets come from `python -m evals.dump_golden_packets --set v3`, which needs a database with the demo data, so v3 is generated after Deepanshu's seed (item 9). Until then, make `dump_golden_packets` fill `required_evidence.synthesis` from `required_keys(packet)`, with a test.
  4. `evidence_cited` itself stays as it is (it already reads `required_evidence.synthesis`). Add a test with a fixture result that cites the rule's keys (passes) and one that omits one (fails, naming the key).
  5. Live check: at most 5 Council runs this session, only after v3 exists.
- Then plan §2 (expected cost: square-root impact plus split conformal in numpy, on the January 2024 tapes in `ml-service/.cache/market/zips`), §3 (Quick/Deep), §4 (budget engine). Original M2 closing-task list, for reference:
- label the frozen v1 audit as the published grade of the earlier demo data;
- serve the v2 grade from `ml-service/demo_v2/out/grades_v2.json` via `GET /api/audit/v2` for demo ids, instead of today's `v2_not_available_for_demo`;
- mark the fee component "not independently measured" for demo accounts;
- hide or label the panels that read per-trade v1 fields;
- add tests against new-shape trade documents.
Keep it minimal: M8 is the design phase.

**Then M3** (it does not depend on the M2 re-lock). Write `docs/superpowers/plans/<date>-m3-cost-and-ai-quality.md`, starting with the item that needs no new dependency: **find why `evidence_cited` fails on all 18 recorded runs, and fix the cause** (offline: `ml-service/evals/invariants.py`, `evals/recordings/`, `run_offline.py`). Then the expected-cost model (square-root impact calibrated on the v2.1.0 day summaries, `ml-service/.cache/market/summaries`; residual model; conformal intervals — check MAPIE/crepes licences and pin), Quick vs Deep audit, and the budget engine.

M1 and its correction pass M1.1 are done.

**M1.1 (done 2026-11-12, report `docs/milestones/M1.md` §"M1.1 corrections", ADR-0012, LOG §K):** the spread baseline is measured on taker events (the v2.0.0 bias came from multi-level orders counted print by print; quote age is second-order, 5 s cap kept); user spread is scored per event; calibration v2.1.0 over 90 days (360 files, streamed, raw files deleted; day summaries stay in `ml-service/.cache/market/summaries`, local only); `ML_SERVICE_TOKEN_SECRET` (fail closed); CI secret scan (gitleaks); R6-G13 closed. Grade the M2 demos with `SCORING_V2_VERSION` (v2.1.0), and remember that its spread unit is the taker event: a simulated fill keeps its real print's time, so fills taken from one public event share a millisecond and are scored together, and fills at later prints are separate events, each measured against the mid before its own millisecond.

**Plan written:** `docs/superpowers/plans/2026-11-11-m2-real-demos.md`. The venue archives are verified (`docs/research/LOG.md` §J): Bybit and OKX both publish daily spot trade files whose `side` is the aggressor. OKX days are UTC+8. Neither publishes a checksum.

**Done in M2 so far (commit `af3b737`, plan commit `a3d85da`):**
- `ml-service/demo_v2/prng.py`: an exact mulberry32 port, matching node values.
- `decisions.py`: a line-by-line port of the current `generateSyntheticTrades.ts`, with the same PRNG call order. It gives 313 / 248 / 145 decisions.
- `simulate.py`: taker orders walk prints; maker orders fill only when a print trades through the limit; a 30 min TTL. All 9 hand cases of plan §3 pass.
- Finding: the committed `backend/src/data/synthetic/*.json` files come from an older generator and cannot be reproduced (`test_committed_old_files_come_from_an_older_generator`). A read-only Atlas count check is listed below.

**Next concrete action (M2), in order:**
1. (done) prng and decisions. (done) simulate.
2. (done, uncommitted) `ml-service/demo_v2/tapes.py` with `tests/demo_v2/test_tapes.py` (5 passed): Bybit loader tested on the committed real fixture `tests/fixtures/market/bybit-BTCUSDT-2024-01-15_1400-1402.csv.gz` (329 rows; full-file SHA-256 `ad4c8b873f3c1823bbac3d9311a9c2fec5eaa7f50fce87cc3b8d0314825140ee`, ours); OKX loader tested on in-memory files (UTC+8 boundary, scientific notation). **Still to do:** add the Bybit row to `tests/fixtures/market/SOURCE.md`; cut a real OKX fixture. On 2026-11-12 www.okx.com was unreachable from this machine (connect timeout, then DNS failure); retry, and if it stays down, decide whether demo-okx can be rebuilt (otherwise remove it, plan D3).
2b. (done, uncommitted) `measure_account(..., data_source="synthetic-demo")` and `score_account_v2(..., data_source="synthetic-demo")`: the offline demo build reuses the production job and scorer on an in-memory database; only `demo-*` accounts may use it, and the default (`real-user`) is unchanged. Tests in `test_service.py` and `test_score.py`.
   Fee citations (docs-researcher, 2026-11-12): Bybit VIP 0 spot 0.1000% maker / 0.1000% taker, https://www.bybit.com/en/help-center/article/Trading-Fee-Structure ("last updated 2026-11-05"); not confirmed for January 2024. OKX: not confirmed from any official page (okx.com unreachable; search snippets only say 0.08% / 0.10%). Record both in LOG; with okx.com unreachable and no citable fee, demo-okx is likely removed (plan D3) — decide in step 3.
   January 2024 Binance tapes (124 files) are being prefetched into `ml-service/.cache/market/zips` (checksum-verified).
3a. (done) `demo_v2/build.py`, `scripts/build_demo_v2.py`, output `ml-service/demo_v2/out/` (three Binance demos, manifest with 119 tape checksums, offline v2 grades). Results and the timing finding: LOG §L. v2.1.0: aggressive 78.26 B, moderate 76.36 B, disciplined 73.06 C (v1 locked: C / B / A). Decisions for Deepanshu: items 7 and 8 below.
3b. (decided, not built) v1 grades of the new files. `seedDatabase.ts` enriches demo trades for v1 with **unseeded `Math.random()`**: it invents the arrival price (±0.2-0.5%) and the spread (e.g. BTC 0.8-1.8 bps) of every trade. A v1 regrade of the rebuilt files would therefore rest on invented numbers and could not be reproduced, so `gradeDemoFiles.ts` is not built. The locked v1 grades stay what they are: the frozen, published audits (constants in `frontend/app/utils/demoProfiles.ts`). The M2 table is "v1 locked (published) · v2.1.0 on real prints". Commit `56fc7e2` holds the build.
3c. (done) `backend/src/scripts/seedDemoV2.ts` + `__tests__/seedDemoV2.test.ts` (10 tests, run inside the full backend suite: the guard blocks naming a seed script on the command line, which was respected; no red phase was seen for them); `FeeSnapshot.source` gains `'published-schedule'`; demo orders carry `restingMs`. Original note: dry run by default: reads `ml-service/demo_v2/out/<demo>/*.json`, and with `--apply` replaces only `demo-aggressive|moderate|disciplined` trades, orders and fee snapshots (never another account; refuse anything else), keeping the stored v1 audits. Test on mongodb-memory-server. The re-lock patch (`demoProfiles.ts`, `gradeInvariance.test.ts`, v2 constants) waits for decision 7.
3d. (done) `ml-service/scripts/rerecord_ablation_v2.sh` (dry run by default; Waiting item 10). (next) the whale pre-fill study: a new offline script `ml-service/scripts/whale_prefill_study.py` over the January 2024 tapes in `.cache/market/zips` and the fills in `demo_v2/out/`; count a whale burst as adverse only when it ends before the fill; report whichever way it comes out in `docs/research/EXPERIMENTS.md`. Never run `whale/enrich.py`. Then the M2 report (`docs/milestones/M2.md`), with the re-lock left open on decision 7.
3. (original wording) `build.py` → `ml-service/demo_v2/out/` plus the manifest; offline v2 grades (Python) and v1 grades (`backend/src/scripts/gradeDemoFiles.ts`, writes nothing); the old vs new grade table.
4. Cite the Bybit and OKX regular spot fee rates (`docs-researcher`) before using them.
5. `seedDemoV2.ts` (dry run by default) and the re-lock patch under `.work/proposed/`; both go to "Waiting for Deepanshu".
6. Whale pre-fill study (new offline script; never `whale/enrich.py`), and the ablation re-record script (dry run) for Deepanshu.

## M1 (done, 2026-11-11)

Plan: `docs/superpowers/plans/2026-11-11-m1-measurement-and-scoring-v2.md` (it builds on `docs/superpowers/plans/2026-11-09-phase-4r1a.md`). Report: `docs/milestones/M1.md`.

**Done in M1 so far (Part A complete, Tasks 1–6; 89 tests in `ml-service/tests/measure/`, all green; ml suite 949 passed, 1 skipped):** metric registry; real 2-minute fixtures with `SOURCE.md`; data layer (`measure/data/`: window type, data.binance.vision loader with mandatory checksum, REST window with paging and gap check, Parquet cache, price step); benchmarks (`measure/benchmarks.py`); fill metrics with the runtime identity (`measure/metrics.py`); `measure/enrich_fill.py` (`FillInput`, `measure_fill`), checked on real BTCUSDT and BNBUSDT slices; the generated method page `docs/methodology/measurement-v1.0.0.md` (`ml-service/scripts/gen_methodology.py`, with a drift test). Red phases seen: `ImportError: cannot import name 'MEASURE_VERSION'`, `ModuleNotFoundError: No module named 'measure.data'`, `No module named 'measure.metrics'`, `No module named 'measure.enrich_fill'`, `AssertionError: missing .../measurement-v1.0.0.md`. Two defects found by the tests and fixed in code: the price step kept float noise at 12 decimals (now 8, the exchange precision), and the header-row skip dropped a data row. The flaky router test passed 30 of 30 runs and in the full suite; no fix was needed. Commits: `0aa0603` (Tasks 1–4), then the Tasks 5–6 commit. Research notes: `docs/research/LOG.md` §G.

**Part B done (Tasks 7–10, Binance only):** `measure/orders.py` (order shortfall, including orders that never filled), `measure/fees.py` (Commission FAQ formula, the FAQ example reproduced), `measure/service.py` (the job; trade rows are the outbox), `POST /internal/measure` (service token `typ: measure`), backend `Order`/`FeeSnapshot`/`OrderMeasurement` models, `services/orders/binanceOrders.ts` (allOrders + commission in the history sync), `services/measureTrigger.ts` (called after each sync), field registry rows for the new collections. Decisions: ADR-0011. Research: `docs/research/LOG.md` §H. TDD note: `binanceOrders.ts` and `measure/service.py` were written before their tests (no red phase seen); the C2 component tests were written first but not run red. Every other module showed its red phase.

**Part C done:** Scoring v2 (`ml-service/scoring_v2/`), calibrated version `v2.0.0` from 20 real daily files, ADR-0010. **Part D done:** `/internal/score-v2` and `/internal/verify-v2`; backend `GET /api/audit/v2` and `GET /api/audit/verify`; the dashboard shows v1 (rule-based) and v2 (measured) side by side; `/methodology` generated from the code; the validation harness `ml-service/scripts/validate_real_account.py`. Review: 3 medium and 4 low findings, all fixed with tests (listed in the M1 report). Not built: Bybit and OKX orders (OKX order-history facts unconfirmed; Bybit keeps only filled orders older than 7 days); their fills carry an `unmeasuredReason`.

## Milestone status

| Milestone | Status | Report | Commit |
|---|---|---|---|
| M0 Orientation, research and hygiene | done | `docs/milestones/M0.md` | `ff681be` |
| M1 Measurement v2 and Scoring v2 | done (real-account check open until real trades exist); M1.1 corrections done | `docs/milestones/M1.md` | `0aa0603`, `5d43067`, `6ab568e`, `46e08f3`, `20d0e17`; M1.1: see "Done" |
| M2 Real demos | done: demos rebuilt from real prints, v2.2.0, dashboard, three demos removed; Atlas seed applied by Deepanshu 2026-11-14; ablation re-record runs 4-6 recorded 2026-11-17/18 and checked offline 2026-11-19, `golden/v3` not flipped (three runs state a cause; waiting item 23) | `docs/milestones/M2.md` | `a3d85da`, `af3b737`, `56fc7e2`, `7d78453`, `201ce5f`, `97a83a7`, `969e934`, `2747be7` |
| M3 Cost against expectation, AI layer quality | done: §1 packets and evidence rule, §2 expected cost with interval, §3 Quick/Deep, §4 budget; reviewer pass done with fixes (4 medium, 5 low) | `docs/milestones/M3.md` | `ec9abe2`, `9c7f0a7`, `c5adac6`, `f52e7e0`, `9b959be`, `195a8a3` |
| M4 Explain and act | done (reviewed, fixes applied; minimal UI, M8 redesigns) | `docs/milestones/M4.md` | `195a8a3` |
| M5 Trust and reach | done (reviewed, 3 high and 4 medium findings fixed; signing key set 2026-11-18; client-side `/verify` page and personal API keys built; the verify body limit was declined) | `docs/milestones/M5.md` | `af3f2e7`, `a848fd0`, `4a040fd`, `19af398`, `d03bf67`, `058d4e4`, `fcc6d00`, `16c53e5` |
| M6 Breadth | done except two items: broker-file check (reviewed), scheduled re-sync with stale-data line, lint 89 to 50, CCXT shadow mode (offline-tested; live run waits for a key, item 17); perpetual funding costs deferred (item 16) | `docs/milestones/M6.md` | `23f57d1`, `4f59d35`, `c55e556`, `fa8059e` |
| M7 Differentiators | done except one item: zkTLS spike (verdict: not now), `fillscore-metrics` package, MCP App, DP mechanism; EVM DEX audit deferred (item 19) | `docs/milestones/M7.md` | `7030aab`, `bc5935c`, `8915486` |
| M8 Design and UI | stop for Deepanshu before starting | | |
| M9 Launch readiness | done (security review and fixes, secrets scan, audits, k6 script not run, README and ARCHITECTURE, Stripe off, launch drafts, claims audit) | `docs/milestones/M9.md`, `docs/FINAL_REPORT.md` | `5db6784`, `9a1903d`, `cf0176a`, `eeda97e` |

## Suite results

**M3 closed and M4 built (2026-11-17, after the M3 review fixes):** ml-service 1335 passed, 1 skipped; backend 105 files, 868 passed, tsc 0; frontend 44 files, 329 passed, tsc 0, lint 0 errors (89 warnings), build 0; e2e 24 passed (run before the last demo rebuild; values in it are pattern-checked); guard 214; roadmap IDs OK; run_offline 0 gated violations; ablation --check exit 0; methodology up to date.

**Architect review of 2026-11-17 (after §2, §3, §4; before the reviewer pass):** ml-service 1329 passed, 1 skipped; backend 100 files, 822 passed, tsc 0; frontend 43 files, 313 passed, tsc 0, lint 0 errors (89 warnings, as before); e2e 23 passed; guard 214 passed; roadmap IDs OK; run_offline 0 gated violations; ablation --check exit 0; `gen_methodology.py --check` up to date; `dump_golden_packets --check v3` reproduces hash-identically from Atlas (read-only). `npm run build` not run yet (runs with the milestone commit). TDD notes: red phases shown for claim rules, specialist claim check, loader order, PDF, features, calibration, model, hook, hash, budget, Quick/Deep flow and HTTP, frontend line and helpers; `expected_cost/aggregate.py` and `model.py` were written together with their tests (the aggregate's red phase was not run); the frontend component wiring (`AgentCouncil.tsx`) has helper tests and the e2e run but no component test of the toggle.

**Live-site review, M3 packets/golden v3, v2.3.0 (2026-11-14, local commit `c5adac6`, not pushed):** ml-service 1262 passed, 1 skipped; backend 99 files, 813 passed, tsc 0; frontend 42 files, 299 passed, tsc 0, lint 0 errors (89 warnings), build 0; e2e 23 passed; guard 214 passed; roadmap IDs OK; run_offline 0 gated violations (measured: evidence_cited misses 18 on the old recordings); ablation --check exit 0; `gen_methodology.py --check` up to date; `dump_golden_packets --check v3` reproduces hash-identically from Atlas (read-only). TDD note: the frontend tests, the packet/loader tests and the scoring tests were written before the code but the red phase was not run for them (the modules did not exist, so the first run was an import error by construction); red phases were shown for the backend totals/formatBps/summary tests and the Council current-data tests.

**End of the M2 closing steps (2026-11-13):** ml-service 1194 passed, 1 skipped; backend 96 files, 787 passed (785 plus the two report tests), tsc 0; frontend 39 files, 270 passed, tsc 0, lint 0 errors (89 warnings), build 0; e2e 19 passed; guard 214 passed; roadmap IDs OK; run_offline 0 gated violations; ablation --check exit 0. The backend suite was run five times in a row: failures only in runs 1-2 (stale tests of this change, see Known problems), runs 3-5 clean.

**End of M1.1 (2026-11-12):** ml-service 1149 passed, 1 skipped; backend 93 files, 750 passed, tsc 0; frontend 39 files, 263 passed, tsc 0, lint 0 errors (89 warnings), build exit 0; e2e 16 passed; guard 214 passed; roadmap IDs OK; run_offline 0 violations; ablation --check exit 0; gitleaks full history: no leaks.

**End of M1 (2026-11-11):** ml-service 1115 passed, 1 skipped; offline evals 0 gated violations; ablation --check exit 0; guard 214 passed; roadmap IDs OK; backend 93 files, 742 passed, tsc 0; frontend 39 files, 263 passed, tsc 0, lint 0 errors (89 warnings), build exit 0; e2e 16 passed. `dump_golden_packets --check v2` was not run: it needs a local mongod, and no packet code changed.

Baseline at commit e43c493, and the same at the end of M0 (2026-11-11). M0 added no code.

| Suite | Command | Result |
|---|---|---|
| ml-service tests | `pytest -p no:cacheprovider` (env in `.claude/rules/ml-service.md`) | 860 passed, 1 skipped |
| Offline evals | `python evals/run_offline.py` | 0 gated violations |
| Ablation check | `python evals/ablation.py --check` | exit 0 |
| Guard hook | `bash .claude/hooks/test_guard.sh` | 214 passed, 0 failed |
| Roadmap IDs | `bash scripts/check_roadmap_ids.sh` | OK |
| Backend | `npm test -- --no-file-parallelism`, `npx tsc --noEmit` | 90 files, 709 passed; tsc exit 0 |
| Frontend | `npx vitest run`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build` | 37 files, 252 passed; tsc exit 0; lint 0 errors, 89 warnings; build exit 0 |
| e2e | `npm run test:e2e` | 14 passed |

The M0 ml-service run used `--ignore=tests/measure`, because that folder holds the first, still red, Milestone 1 test and is not part of the M0 commit.

## Done

- **M2 build** (2026-11-12): three Binance demos rebuilt from real January 2024 prints, offline v2 grades, Bybit/OKX tape loaders, safe seed script (on hold), whale pre-fill study (EXP-003), ablation re-record script, `evidence_cited` diagnosis (LOG §M). Report: `docs/milestones/M2.md`. Commits: `56fc7e2`, `7d78453`, `201ce5f`.
- **M1.1** (2026-11-12): correction pass after the architect review (taker-event spread baseline, calibration v2.1.0 over 90 days, `ML_SERVICE_TOKEN_SECRET`, gitleaks CI job, R6-G13 closed). Report: `docs/milestones/M1.md` §"M1.1 corrections". Commit: `ca223a0`.
- **M0** (2026-11-11): baseline; Dependabot alerts #265 and #270 fixed in the frontend; market research `docs/research/MARKET_2026-11.md`; roadmap §3a; instruction cleanup; M1 plan; reviewer findings fixed. Report: `docs/milestones/M0.md`. Commit: `ff681be`.

## Waiting for Deepanshu

Nothing here blocks the current work. Open items: **10** (ablation re-record: day 1 run 2026-11-18, day 2 on 2026-11-19; then tell me, and I flip `golden/v3` and report `evidence_cited`) and the push of the local commits (`git push origin main`). Done or decided on 2026-11-18: **9**, **12** (key set, fingerprint `ba11aa53c4961be4`), **13** (declined; client-side verification built instead), **14** (no account; Kraken from documentation, Coinbase by user mapping), **15** (approved with constraints; built in priority 3).

25. **(Done 2026-11-20, commit `b5cae9a`.)** Decision: make `evidence_cited` satisfiable (one line in `ml-service/agents/render.py`).** `format_value` must format `alpha.median_opportunity_bps_unfilled` as bps (for example `k.endswith("_bps") or "_bps_" in k`; only that key is affected). Until then the measure reads 0 of 18 for a structural reason (LOG §Z). Do it before the re-record in item 26, so the demo runs are made under the fixed renderer. I did not change it: it alters the conditions of any later run.
26. **(Done 2026-11-20, commit `4b06361`: all three demos re-recorded.)** Re-record the demo Council runs of `demo-aggressive` and `demo-disciplined`** (they fail claim rules 1.2.0 and are no longer served; the live demo Council reads "not yet generated" for them). Needs live Groq runs, within the free budget (about 5 runs a session); after item 25. Then update `ml-service/demo_runs/*.json` through the existing recording path and run `python -m pytest tests/test_demo_runs_no_causal_wording.py` (its served-set test then expects all three).
27. **(Done 2026-11-20, commits `c0eaa3b` and `4b06361`: rules 1.3.0 read the flags; the e2e exemption is deleted.)** The recorded `demo-moderate` Council run shows "Unfilled Opportunity Cost Assessed"** (the model's alpha flag `unfilled_opportunity_cost_assessed`, humanised by the card). "Opportunity" is on the counterfactual-word list. It is served today (it passes rules 1.2.0, which do not read flags). `e2e/council-demo.spec.ts` exempts exactly that string and asserts it is present, so the exemption must be deleted when the run is re-recorded. Options: re-record with item 26, or have the card and the claim check cover specialist flags. Not changed: a production screen and a recorded run.
28. **(Done 2026-11-20, commit `d730253`: read from gsap.com, terms recorded in `THIRD_PARTY_LICENSES.md`.)** Read the GSAP licence once the site is back (a minute). Open `https://gsap.com/standard-license`, check that the use in FillScore (an audit web app; no animation-builder product; free tier) is allowed and write its terms into `THIRD_PARTY_LICENSES.md`. Until then GSAP is imported only by the design lab (404 in production). It blocks M8 phase 2b, not the choice of direction.
16. **DEFERRED 2026-11-19 (Deepanshu); nothing to do now. Decision: perpetual funding costs (M6 §5).** Not built. Binance docs checked: the key-permission question is not answered by them (LOG §X). FillScore refuses any key with a futures permission (`keyValidation.ts`: `enableFutures` is "Futures Trading", invariant I3), so a stored key cannot read futures funding payments. Options: (A) build it from a futures transaction-history file the user exports, read through the mapped reading of the CSV check (no key; I would first have to read Binance's export documentation and cite it); (B) compute funding from the public funding-rate history and the user's own mapped fills (reconstruct the position over time; "the position you held across N funding times paid X"; no key); (C) leave it out. I will first check whether Binance offers a futures read-only permission with no trading rights; only that would let a stored key do it without changing I3. My recommendation: (B), because it needs no key and no export format that I cannot verify. Unblocks: M6 §5. Nothing else waits on it.
17. **A live CCXT shadow run (needs your read-only Binance key, nothing else).** Never put a key on a command line (shell history, process list) and never source an env file. From `backend/`: `read -rsp 'key: ' BINANCE_API_KEY; echo; read -rsp 'secret: ' BINANCE_API_SECRET; echo; export BINANCE_API_KEY BINANCE_API_SECRET; npx ts-node src/scripts/ccxtShadow.ts BTCUSDT; unset BINANCE_API_KEY BINANCE_API_SECRET` (paste each value at its prompt; nothing is echoed; use a key with only "Enable Reading"). It compares the native connector with CCXT and prints counts, agreement and the fields that differ. It writes nothing. Until it has run on a real account, CCXT is not used for Bybit or OKX history.
19. **DEFERRED 2026-11-19 (Deepanshu); nothing to do now. Decision: the EVM DEX wallet audit (M7 §3).** Not built. It needs (a) a source of blocks and logs: a keyless public RPC (rate-limited, unreliable) or a provider's free tier (a sign-up with an email: yours to approve); (b) a wallet you own that has swapped on a DEX, to validate a detector on before anything is shown ("pattern consistent with", never an accusation); (c) the swap event layouts checked against the exchange's official documentation (I will read and cite them). If you say "use a keyless public RPC and no wallet yet", I will build the decoder and a sandwich-pattern detector over supplied block data with hand-made scenarios, mark it "not validated on real data", and keep it out of the product screens. Unblocks: M7 §3 only.
20. **Check that your secrets are long enough (a minute in the Render dashboard).** `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` on `fillscore-api`, and `JWT_ACCESS_SECRET` on `fillscore-ml` (it must equal the API's value), should each be 32 or more random characters. The API now logs one line at boot naming a secret that is shorter and its length (never the value). If a log line appears, replace that secret with `openssl rand -hex 32` (on both services where it is shared; everyone is signed out once). When none appears, tell me and I will make a short secret stop the boot, as the service-token secret already does.
21. **Decision: the Node runtime.** The review notes that Node 20 reached end of life in April 2026 (the reviewer's knowledge; I did not check it in the repository). The backend image, `.nvmrc` and CI use Node 20. Moving to Node 22 or 24 LTS changes what runs in production, so it needs your go-ahead and a full test run on the new version. I can prepare it as one commit (Dockerfile, `.nvmrc`, CI matrix, the tests) when you say so.
22. **Before launch, and the publish steps I did not take.** (a) `git push origin main` (CI gates the deploy; the gitleaks job passes after the two dummy-key entries in `.gitleaksignore`), then `scripts/smoke_prod.sh`. (b) Run `scripts/k6_smoke.js` against a local stack once k6 is installed (`k6 run scripts/k6_smoke.js`; it refuses non-local targets). (c) Publishing `fillscore-metrics` to PyPI is an outward-facing step: yours. (d) Before `BILLING_ENABLED` is ever set to `true`: create the Stripe account, add the three Stripe values in Render, add "cancel the subscription when the account is deleted" to the deletion route, and decide what a plan changes (nothing checks `plan` yet). (e) Read the launch drafts in `docs/launch/` and the "Before posting" list. (f) Build-time follow-ups from the security review that I left: build the ml-service image from `requirements.lock`, add audit steps to CI for backend, frontend and pip, pin GitHub Actions by digest, and the rest of the review table in `docs/milestones/M9.md`.
23. **Decision: the ablation runs 4-6 (item 10), after verification of 2026-11-19 (LOG §W).** One Council run (disciplined-5) and two single runs (disciplined-5, -6) state a cause; I did not flip `golden/v3`. Options: (A) flip anyway and report `evidence_cited` per arm with the three runs named as not clean (honest, but the causal text stays in the record); (B) re-record only disciplined-5 (Council) and single disciplined-5/-6 on a new day (the live script refuses existing files, so you would move those three files out of the folder yourself first); (C) first extend the claim rules (`CLAIM_RULES_VERSION` 1.2.0: "inherent to", "rather than", "resulting in") and re-record with them. I recommend (C) then (B). Unblocks: item 10, and the three failing ml tests.
24. **Quote the values in the three `.env.example` files, and add the test (item 2(b)).** I am denied read access to those files. Please quote every value that can contain `&`, `?`, `#` or a space (for example `MONGODB_URI="mongodb://...?retryWrites=true&w=majority"`), then copy `.work/proposed/env-example-quoting/test_env_example_quoting.py` to `ml-service/tests/` and run it. Or lift the read restriction on `*.env.example` and I do it. Unblocks: item 2(b).
18. **Optional: `RESYNC_ENABLED`.** The scheduled re-sync is on by default (`render.yaml`, value "true"). Set it to "false" on `fillscore-api` to switch it off. It runs only while the free instance is awake.

12. **Create the evidence signing key and set it on the API (a real credential: yours to create).** Needed for `GET /api/evidence/pack`; without it the route answers 503 and no pack is written. Steps: (1) `openssl genpkey -algorithm ed25519 -out evidence_key.pem` in a folder outside the repo; (2) turn the PEM into one line: `awk 'NF {sub(/\r/,""); printf "%s\\n",$0;}' evidence_key.pem`; (3) in the Render dashboard open `fillscore-api` → Environment → add `EVIDENCE_SIGNING_KEY` with that line as the value, save (redeploys); also add it to `backend/.env` for local runs; (4) keep `evidence_key.pem` in your password manager and never commit it; (5) after the deploy, `curl https://<api host>/api/evidence/public-key` returns the public key and its fingerprint: publish both (README and the methodology page will link them; M9). Losing the key means old packs still verify with the old public key, new packs need a new key. Unblocks: signed packs, the verify page.
14. **Real sample files for the CSV importer (no credentials: only your own exports).** (a) A Kraken Trades CSV (Profile → Documents → Exports → Create Export → Trades → CSV), a few rows are enough; remove nothing but you may blank the `txid` and `ledgers` columns. It confirms the header spelling and the pair form (`XBT/USD` or `XBTUSD`). (b) A Coinbase CSV if you have one (transaction history or Advanced fills), same treatment: it lets me add a verified mapping. Until then Coinbase files can only be read with a mapping the user supplies. Unblocks: M6 §1 end to end on real files.
15. **Decision: personal API keys for the MCP server.** The server needs an access token, which expires. A personal API key (long-lived, read-only, revocable, stored hashed) is a new kind of credential, so it is yours to approve. Without it the MCP server works for demo accounts and for short sessions only.
13. **Decision: a larger JSON body for the verify route only (it changes a security check, so I did not apply it).** `security.ts` limits every JSON body to 10 kb, so `POST /api/evidence/verify` can check only small packs (a real pack is about 1 MB). Users can check any pack offline with `node scripts/verify_evidence_pack.mjs pack.json --key fillscore-public.pem`. The proposed change, with a stricter limiter for that route and its tests, is in `.work/proposed/evidence-verify-body-limit.md`. Say yes and I will apply it, or keep the offline script as the way to verify large packs. Everything else below is decided or done.

1. ~~Old credentials in public git history (decision).~~ **Done 2026-11-12.** Deepanshu confirmed every committed credential is rotated and decided against a purge (clones and forks keep the history anyway). R6-G13 is closed by the CI secret scan (job `secrets`, gitleaks 8.30.1 over the full history; the six rotated Atlas URIs of commit `1bd5be8a` are listed in `.gitleaksignore`).
11. ~~Decision: how the demo dashboard shows the rebuilt demos.~~ **Decided 2026-11-13 (option A) and built:** v1-only views say "not computed for this data"; measured views (v2 panel, `GET /api/audit/orders-summary`: outcomes, resting time, shortfall, unfilled orders) take their place; slippage `?? 0` fixed; e2e `frontend/e2e/rebuilt-demo.spec.ts`. M8 redesigns it. Original text: **Decision: how the demo dashboard shows the rebuilt demos (blocks item 9).** The rebuilt trades have no per-trade v1 fields (v1 enrichment would need invented arrival prices). Eight routes read those fields (listed under "Current milestone"). Options: (A) replace the demo data; for rebuilt demos every v1 view says "not computed for this data", and measured views (v2 components, order shortfall, resting time, unfilled orders) take their place. This is done with you in M8, the design phase, and the seed runs after it. (B) keep the old demo data for the v1 views and store the rebuilt data beside it, under its own ids, for the v2 views. That keeps showing the partly simulated data M2 set out to replace. **Recommendation: (A).** Unblocks: item 9 and the re-lock.
9. ~~Seed the rebuilt demos into Atlas.~~ **Done (Deepanshu, 2026-11-14):** commits through `2747be7` pushed, production smoke 15/15; the three demo accounts were backed up outside the repo (706 trades, 3 audits); the dry run matched 721/311/4/311, 607/245/4/245, 385/144/4/144 with schema validation passing; `--apply` replaced only those three accounts. The live-site review that followed is in "Live-site review of demo-moderate" below. Original text: **READY for you: seed the rebuilt demos into Atlas, and re-lock their measured grades.** The conditions of the earlier hold are met (decisions 7, 8 and 11 are built; the dashboard shows the rebuilt demos honestly; suites green). Steps, from `~/FillScore`: (1) read-only backup of the three accounts is your call as before; (2) **dry run**, writes nothing, checks every document against the schemas: `cd backend && npx ts-node src/scripts/seedDemoV2.ts`; it must print `demo-aggressive {trades: 721, orders: 311, feeSnapshots: 4, orderMeasurements: 311}`, `demo-moderate {607, 245, 4, 245}`, `demo-disciplined {385, 144, 4, 144}` and "All documents pass schema validation"; (3) **apply** (writes to Atlas; replaces only those three accounts' trades, orders, fee snapshots and order measurements, never leaves an account empty, refuses any other account, keeps the stored v1 audits): `npx ts-node src/scripts/seedDemoV2.ts --apply`; (4) check `GET /api/audit/v2?userId=demo-moderate` answers 200 with `scoringVersion: "v2.2.0"` and `GET /api/audit/orders-summary?userId=demo-moderate` answers `available: true`. The **re-lock is already in the repo** as `backend/src/scoring/__tests__/demoV2Invariance.test.ts` (v2.2.0 composites 90.28144243732656 A, 90.4794342087216 A, 90.05877968287757 A, version file SHA-256 `a0fa45c7…3e8d`); the six v1 grades in `gradeInvariance.test.ts` (three after the removal of bybit/okx/multi) are untouched. Until you apply, the old demo data stays in Atlas and the app is unchanged for visitors. Unblocks: demo v2 grades and order views on the live dashboard, item 10, golden set v3. Original text (earlier hold): **(ON HOLD, do not apply yet; M2 review finding 1.) Seed the rebuilt demos into Atlas (after decisions 7 and 8 and the M2 closing UI task).** The new trades have no per-trade v1 fields, so worst trades, cost attribution, the exchange comparison, component means, regenerated recommendations and the whale panel would go blank for the three demos while their locked v1 grade keeps showing. Before `--apply`, the demo dashboard must show the rebuilt demos honestly: the frozen v1 audit labelled as the published grade of the earlier demo data, the v2 panel with the measured grade, the fee component marked "not independently measured" for demo accounts (their fees are generated at the published rate), and the v1-only panels hidden or labelled for these demos. The dry run now also validates every document against the schemas, and the apply step can no longer leave an account empty. Dry run first, read the counts, then apply: `cd backend && npx ts-node src/scripts/seedDemoV2.ts` (prints demo-aggressive 721 trades / 311 orders / 4 fee snapshots, demo-moderate 607 / 245 / 4, demo-disciplined 385 / 144 / 4), then `npx ts-node src/scripts/seedDemoV2.ts --apply`. It replaces only those three accounts' trades, orders and fee snapshots, refuses any other account, and leaves the stored v1 audits alone. Note: the new trades have no per-trade v1 fields (`fillScore`, `slippageScore`, ...); the frozen v1 audit and its locked grade stay as published. The re-lock patch (v2 grade constants and tests) follows decision 7. Unblocks: demo v2 scores on the dashboard, and item 10.
10. **ONE combined ablation re-record on golden v3 / prompt 1.7.0 (item 9 is done; golden v3 exists).** `bash ml-service/scripts/rerecord_ablation_v2.sh` prints the plan (dry run); `--run` on day 1 and `--run --day 2` on day 2 (Groq free tier: about 8 Council runs a day). New runs are numbered 4-6 so the recorded runs 1-3 are never overwritten. After day 2, set `"recorded": true` in `ml-service/evals/golden/v3/MANIFEST.json`; then `python evals/run_offline.py` measures `evidence_cited` on these recordings against the rule the prompt states. **The claim-check precondition is done (2026-11-17, `f52e7e0`, claim rules 1.1.0; a causal word, also in a specialist's own text, is now redacted in new recordings and the recordings carry `claim_rules_version`).** The script loads `GROQ_API_KEY` and `MONGODB_URI` from the service env files itself (Python, names printed only); do not source or export anything first. Dry-run output of 2026-11-17 (nothing was run):
    == 0. preconditions (read-only): GROQ_API_KEY is not set / MONGODB_URI is not set   (this shell only)
    == 1. would run: .venv/bin/python -m evals.dump_golden_packets --check v3        (reproduces hash-identically, checked 2026-11-17 after the order fix)
    == 2. day 1: would run: python -m evals.live_eval --arm single --runs 3 --cap 40 --start 4
                 would run: python -m evals.live_eval --arm council --runs 1 --cap 70 --start 4
                 would run: python -m evals.live_eval --arm council --runs 1 --cap 30 --start 5 --users demo-disciplined
    == 3. would run: bash -c grep -lE 'failed:|Max retries|_default_|HTTP 429|status 429|rate limit|RouterExhausted|REJECTED|fell back' evals/recordings/*-[456].json
    == 3b. after day 2 only: set "recorded": true in evals/golden/v3/MANIFEST.json
    == 4. would run: python evals/run_offline.py ; python evals/ablation.py --check
Note: the ablation compares the Quick audit (single-call arm) with the Deep audit (Council), the same two arms the dashboard now offers. Unblocks: Track R's guardrails-vs-agents result on the rebuilt demos, and the first meaningful `evidence_cited` number.
7. ~~Decision: timing.~~ **Decided 2026-11-13 and built: v2.2.0, ADR-0013, LOG §N.** The grades came out as aggressive 90.28 A, moderate 90.48 A, disciplined 90.06 A: timing is 100 for every fill because no hour costs more than one price step above the cheapest hours (the hour-to-hour range is inside the day-to-day noise). All twelve sensitivity variants give the same letters and order. Open for a later scoring version, your call: a constant 100 on 25% of the weight raises every grade and separates no one; a lower weight or dropping the component would be a new version. Nothing was tuned. Original text: **Decision: the timing component (25% of v2) mostly measures volatility.** On the rebuilt demos it reverses the order of the profiles: v2.1.0 gives aggressive 78.3 B, moderate 76.4 B, disciplined 73.1 C (v1: C / B / A), because the disciplined profile trades 08:00-15:00 UTC, which includes the three most volatile hours. The hour profile is median quoted half-spread + median absolute 1-minute move, and the move is about 1,000 times larger than the half-spread on BTC (LOG §L). Options: (a) keep it as approved (spec D5) and explain it on the methodology page; (b) in a new version, build the hour profile from the median effective half-spread of taker events per hour (a cost, not a volatility); (c) lower its weight. My recommendation is (b), as v2.2.0, before the demo grades are re-locked. Nothing changes until you choose. Unblocks: the M2 re-lock.
8. ~~Decision: demo-okx and demo-multi.~~ **Decided 2026-11-13 and done:** demo-okx, demo-multi and demo-bybit are removed from the product (code, demo lists, docs); their Atlas data is kept; demo-bybit returns in M6. Original text: **Decision: demo-okx and demo-multi.** www.okx.com was unreachable from this machine on 2026-11-12 (connect timeouts, then DNS failure), and no official OKX fee page could be read, so they cannot be rebuilt from real OKX prints now. Per the plan (rebuild where a venue archive exists, otherwise remove), I propose to remove demo-okx and demo-multi from the demo set (both are already hidden). demo-bybit can be rebuilt from Bybit's archive, but its v2 score would read "not measured" until the measurement job measures Bybit fills; I propose to remove it as well for now and add it back with Bybit measurement in M6 (CCXT breadth). Say if you prefer otherwise.
6. ~~Set `ML_SERVICE_TOKEN_SECRET`.~~ **Done (Deepanshu, 2026-11-13):** set on both Render services and in `backend/.env`. Original text: **Set `ML_SERVICE_TOKEN_SECRET` on both Render services, before or with the push of M1.1.** The backend → ml-service token now has its own secret (no longer `JWT_ACCESS_SECRET`). Steps: generate a value, e.g. `openssl rand -hex 32` (64 characters); in the Render dashboard open `fillscore-api` → Environment → add `ML_SERVICE_TOKEN_SECRET` with that value; then `fillscore-ml` → Environment → add the same key with the same value; save both (each redeploys). It must be at least 32 characters and differ from `JWT_ACCESS_SECRET`. Without it both sides fail closed: the ml-service answers 503 on `/internal/*`, the backend skips measurement and `/api/audit/verify` answers 503; everything else works. For local runs, add it to `backend/.env` (the ml-service reads it from there). Unblocks: measurement v2 and score verification in production (together with item 4).
2. **(Done: both files are gone, commit `8a8159a`.)** Leftover graphify files (information). `.claude/settings.json.graphify-bak` and `.agents/rules/graphify.md` refer to a `graphify-out/` folder that does not exist. Delete them if graphify is no longer used. I do not edit settings files.
3. ~~Pushing.~~ **Done (Deepanshu, 2026-11-13):** `main` was pushed through the M2 build and the production smoke test passed. Commits made after that push (this work) are not pushed yet: `git push origin main` is yours. Original text: **Pushing.** Local commits are not pushed. A push deploys through CI, so it is yours: `git push origin main` when you have reviewed the commits.
5. **(Answered 2026-11-12: Atlas holds demo-aggressive 313, demo-moderate 248, demo-disciplined 145 trades, the same counts as the current generator and its Python port. So Atlas was seeded by the current generator; the committed JSON files are older and unused by the seed. The M2 old-vs-new table compares against the current generator.)** Original question: which demo trades are in Atlas? (a read-only check, information for M2). The committed `backend/src/data/synthetic/*-trades.json` cannot be reproduced by the current generator: their ids have another shape, and the counts are 174 / 113 / 64. The current generator (ported exactly to `ml-service/demo_v2/decisions.py`) gives 313 / 248 / 145 decisions for aggressive / moderate / disciplined. Running the TS generator to compare was blocked by the guard, which is correct, so I did not run it. To settle which version is seeded, please run a read-only count: `mongosh "$MONGODB_URI" --quiet --eval 'for (const u of ["demo-aggressive","demo-moderate","demo-disciplined"]) print(u, db.trades.countDocuments({userId: u}))'`. M2 builds on the current generator either way; this only decides how the old-vs-new table is labelled.
4. ~~Set `ML_SERVICE_URL`.~~ **Done (Deepanshu, 2026-11-13):** set on `fillscore-api`. Original text: **Set `ML_SERVICE_URL` on the backend service (Render), before or with the push of M1.** Value: the ml-service's base URL (for example `https://fillscore-ml.onrender.com`). Without it the backend skips measurement after a sync (it logs nothing and fails nothing). Since M1.1 the service token also needs `ML_SERVICE_TOKEN_SECRET` (item 6). Unblocks: measurement v2 in production (ADR-0011).

## Decisions since the last report

**Deepanshu's decisions of 2026-11-13** (recorded here and in `docs/ROADMAP.md` A15-A17):
- **Items 4 and 6 (done) and item 3 (done):** `ML_SERVICE_TOKEN_SECRET` is set on both Render services and in `backend/.env`; `ML_SERVICE_URL` is set on `fillscore-api`; `main` is pushed and the production smoke test passed.
- **Item 7, timing:** build v2.2.0 with a cost-based hour profile (median effective half-spread of taker events per hour). No rank over 24 hours. Score the hour by its excess cost over the symbol's cheapest hours in bps, with a materiality floor of about one price step, justified with data. Report a sensitivity table. Accept the resulting grades; do not tune toward an expected order. ADR-0013.
- **Item 8, demos:** `demo-okx`, `demo-multi` and `demo-bybit` are removed from the product (code, demo lists, docs). Their Atlas data stays (no deletion). `demo-bybit` returns in M6 with Bybit measurement.
- **Item 11, dashboard:** option (A), minimal, now. For rebuilt demos every v1-only view says "not computed for this data" (never 0, never blank-as-zero). The measured views (v2 components, order shortfall, resting time, unfilled orders) use the existing component styles. The `?? 0` slippage problem is fixed in the same pass. An end-to-end test covers the rebuilt-demo dashboard. M8 redesigns it properly.

- Dependabot #270: the minimatch override is scoped to `@typescript-eslint/typescript-estree`, not global. A global override would force eslint's minimatch 3 copies to version 11, which is not needed (3.1.5 is outside the alert's range) and risks breaking lint.
- Dependabot #265: the `shadcn` dev dependency is removed; `components.json` stays, so `npx shadcn` still works on demand.
- Roadmap additions and changes from the market research: `docs/ROADMAP.md` §3a. A replay of a user's past fills on another venue's tape is not built, because it reads as routing advice.
- Scoring versions and calibration tables will be JSON files in the repo, not MongoDB documents (M1 plan §2). To be recorded as ADR-0010 when built.
- DuckDB is not added for now. pandas and pyarrow, which are already installed, cover the as-of lookups M1 needs. Revisit if the calibration script is too slow.

## Known problems

- **2026-11-14.** (1) `tests/test_llm_router.py::test_schema_mismatch_records_loc_and_type_only` failed once in one full ml run and passed in 40+ other runs (the known intermittent router test). (2) The Council narrative renderer now shows a real value below 0.05 bps as "0.02 bps" or "<0.01 bps" instead of "0.0 bps" (`agents/render.py`): recordings made earlier were produced with the old rule; the offline evals still pass. (3) Network drops on this machine (Atlas DNS, Google Fonts at build time) made two commands fail once; a retry worked. They are not product defects. (4) FIXED 2026-11-17: the PDF report's component rows came from the v1 audit for rebuilt demos. (5) FIXED 2026-11-17: the claim check did not name a bare "because" (claim rules 1.1.0). (6) 2026-11-17: `scripts/build_demo_v2.py` takes about 11 minutes since the expected-cost hook (one hour-context lookup per order).

- ~~Missing v1 slippage is shown as 0~~ **Fixed 2026-11-13** (`/trades` and the CSV export give null/empty; the analytics, trades and dashboard pages show "not computed"; tests `rebuiltDemo.test.ts`, `notComputed.test.ts`, e2e). Original text: Missing v1 slippage is shown as 0, a made-up number. `backend/src/routes/audit.ts` writes `t.arrivalSlippageBps ?? 0` in `/trades/export` and `t.slippageBps ?? t.arrivalSlippageBps ?? t.vwapSlippageBps ?? 0` in `/trades`. A trade without the field should read "insufficient data" (empty or null). This is not visible today, because every v1-enriched trade has the field; it would surface for rebuilt demo trades. Fix in M4, together with the frontend consumer.

- **The intermittent backend failure, recorded (2026-11-13).** Five consecutive full runs (script run five times, 781-785 tests): runs 1 and 2 failed three tests, runs 3 to 5 passed. Two of the three were stale tests of this change (whale panel for a demo with no enriched trades; the count of upsert call sites in the legacy seed script), fixed. The third is the one that failed on 2026-11-12: `src/scripts/__tests__/seedDemoV2.test.ts > dry-run schema validation and the safe replace > when an insert fails, the account keeps its old documents and none of the new ones`. **Cause (inferred from the test, not proven by a trace):** it needs the unique trade index, and Mongoose builds indexes asynchronously after connecting, so a duplicate insert can succeed when the test starts first. The test now awaits `Model.init()` for the four models. It passed in the three runs after that change and in the final full run. If any backend test fails again, record its name here. Earlier text: One backend test failed intermittently on 2026-11-12: 1 failure in 4 full runs of the 764-test suite, and the next three runs passed. Its name was not captured. If it shows again, record the name and look for shared database state between test files.

- `ml-service/scoring_v2/versions/v2.1.0.json` records the `codeHash` of the code at calibration time. M2 added the behaviour-neutral `data_source` keyword to `scoring_v2/score.py`, so the current code hash differs. Nothing checks this at runtime. When the next version is calibrated it records the then-current hash.

- The guard blocks running `backend/src/scripts/generateSyntheticTrades.ts` (it is a demo-dataset script). This is deliberate and was respected. The Python port is proven by the PRNG values and by the rule tests instead.
- Uncommitted at handoff: none apart from this file. Latest suite lines: ml 1130 passed, 1 skipped (after `af3b737`); backend 742 passed, tsc 0; frontend 263 passed, tsc 0, lint 0 errors, build 0; e2e 16 passed (end of M1, `20d0e17`).

- The guard blocks shell redirection into the repo, including redirection to a path held in a shell variable. Pipe command output to `tail` instead of writing log files from the shell.
- The eval measure `evidence_cited` fails on all 18 recorded runs (measured, not gated). Finding the cause is part of M3.
- No real-user trade has been scored. The M1 exit criterion "at least one real account scored under v2" stays open until Deepanshu has real trades; M1 builds the one-command validation harness for it.

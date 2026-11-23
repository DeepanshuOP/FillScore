# Design v5 proposal: a product people would choose to use (orders of 2026-11-24)

Status: **proposal for Deepanshu's choice.** Nothing in production changes with this document. Evidence: `AUDIT.md` (what is there,
measured), `REFERENCES.md` (what others do, libraries and licenses), `FEATURES.md` (what is missing), the working prototype under
`/design-lab/v5` (404 in production) and its images (`README.md` in this folder).

## 0. The case in six lines

1. The audit (AUDIT.md) measured what Deepanshu saw: 3,670 text nodes under 12 px, 1,184 letter-spaced uppercase runs, a first screen
   spent on one 230 px figure, no chart that reads as a chart, words like Council, Evidence, Carbon copy, and a hero that breaks on a
   short phone. Contrast is fine (0 axe nodes) and provenance is everywhere: the problems are size, words, structure and charts.
2. The products people choose for work (cal.com, Stripe, Plausible, Linear; REFERENCES) share one shape: a sidebar of nouns with icons,
   a page header with a title, one plain sentence, a period control and one primary action, then cards, a chart with labelled axes and
   a table. Body text at 14 to 16 px, nothing under 12 px.
3. FillScore takes that shape for the app. The receipt and the grade stamp stay as signature objects; the paper, tape and pen leave the
   app chrome (the marketing site keeps the story).
4. Plain words replace private ones (§1); one number style per kind (§2); every page has a designed state for missing data (§4).
5. The marketing site gets the rich motion; the app's motion is fast and functional (§6).
6. Nothing guarding an invariant moves out of sight: provenance, ValueState words, NOT SIGNED, "not independently measured", the
   language-model heading and the past-tense rule are all kept, most of them made larger (§3.6).

## 1. Words

Every user-facing term that a visitor cannot decode, with its replacement and why. The words that guard an invariant are marked
**(kept)**: their meaning stays, only the type around them changes.

| Today | Proposed | Where | Why |
|---|---|---|---|
| Overview | **Costs** | sidebar, page title | the page answers "what did my trading cost"; "Overview" names nothing |
| Rules | **Rule breaks** | sidebar | it lists orders that broke a stated rule |
| Rankings | **Comparisons** | sidebar | it compares groups (symbol, hour, venue); a ranking is one view of it |
| Council | **AI review** | sidebar, title | says what it is; the specialists' names go |
| Quick / Deep | **Short review (1 model call)** / **Full review (9 model calls)** | AI review | the cost of each is the difference that matters |
| Liquidity Scout, Benchmark Reviewer, Risk Auditor, Fee Reviewer | **Liquidity**, **Benchmark**, **Risk**, **Fees** (section headings) | AI review | role names read as characters, not findings |
| "Alpha verdict: NEGATIVE", "hourly HHI of 0.10" (model text) | unchanged (recorded output is never edited); a plain gloss beside the term: "HHI: how concentrated trading was across hours, 0 to 1" | AI review | recorded text stays verbatim (no fabricated data rule); the gloss is code's |
| Evidence, evidence pack | **Reports**, **signed report** | sidebar, page | "Evidence" suggests a dispute |
| NOT ISSUED (demo pack cards) | "Demo accounts have no signed report" (one line, no stamp) | Reports | a stamp that says "no" reads as an error |
| Fills > Ledger / Patterns | **Fills** (one page; Patterns removed, §4 row 3) | Fills | |
| Ask FillScore | **Ask** (a box on Home: "Ask about your past orders") | Home | a product's name in its own UI adds nothing |
| Recorded answer, not live **(kept)** | "Recorded answer, not generated now" | Home | plainer, same fact |
| Theme: Paper / Theme: Carbon copy | sun/moon icon button with the label **Light** / **Dark** (and **System** in its menu) | sidebar foot, settings | "Carbon copy" is a pun nobody decodes |
| Method | **How it's measured** | page header | a button needs a verb or a question |
| Copy share link | **Share** | page header | standard |
| Download report | **Download PDF** | page header | names the file |
| Public score card | **Share page** | sidebar foot | |
| SCORING V2.3.0, MEASURE 1.0.0 (sidebar foot) | "Score version 2.3.0" in the grade card and in Settings > About | | fine print in the chrome helps nobody; the version stays printed on the grade |
| 01 TOTAL, 02 GRADE ... (mono rails) | headings: **Total cost**, **Execution grade**, **Where the cost came from**, **Cost per order**, **Against the model estimate** | Costs | a scanner reads headings |
| Where the money went | **Where the cost came from** | Costs | |
| Cost against expected | **Against the model estimate** | Costs, receipt | "expected" sounds like a promise |
| Unfilled orders (modelled) **(kept)** | unchanged | receipt, Costs | the word "modelled" guards the claim |
| Fees (published rate) **(kept)**, "not independently measured" **(kept)** | unchanged, at 14 px | receipt, Costs | invariant (DESIGN §12.6) |
| NOT SIGNED **(kept)** | unchanged on the demo receipt | receipt | invariant |
| synthetic trader, real prices **(kept)** | a banner on every app page: "**Demo account** · synthetic trader, real Binance prices · read-only" | app header | invariant I5; a banner is larger than a dashed 11 px chip |
| measured / insufficient data / not computed **(kept)** | unchanged words; shape and words as today, at 13 to 14 px | everywhere | ValueState invariant |
| tape, prints | **public trades** | receipt, docs, landing | "print" and "tape" are trader slang |
| slip (Ask answer, demo cards) | **answer**, **card** | Home, /demo | |
| pen note, margin note (ring-and-dot) | an "i" info button with a tooltip; the important sentence printed under the title | every panel | a 16 px pen mark hides the explanation |
| stamp | **grade** (the visual stamp stays) | Costs | |
| bps | **bps** with "(0.01%)" at first use on a page and in the tooltip | everywhere | standard in TCA; glossed once |
| Run analysis | **Start review** | AI review | |
| Check a broker file **(plain)** | unchanged | sidebar | already plain |
| Open the demo (marketing) | **Try the demo** | top bar, hero | |
| Verify (marketing) | **Verify a report** | top bar | says what is verified |
| Connect | **Connect an exchange** | app, onboarding | |

## 2. Readability rules

| Rule | Value | Checked by |
|---|---|---|
| App body text | **14 px** minimum (tables 14 px, descriptions 14 px, page titles 24 px, card titles 16 px) | `audit5.ts`: 0 visible text nodes under 12 px in the app |
| Labels, captions, axis ticks, table headers | **12 px** minimum, sentence case | same |
| Uppercase | only in the receipt and the stamp (printed objects); no letter-spaced uppercase under 12 px anywhere | `audit5.ts` caps runs under 12 px = 0 |
| Contrast | AA for all text, muted included (4.5:1; 3:1 for 18 px+) in both themes | axe `color-contrast` 0, `contrast.test.ts` extended to the v5 tokens |
| Figures | `font-variant-numeric: tabular-nums` on every number; a true minus sign; **never "-0.00"**: a value that rounds to zero prints "0.00" (or "<0.01" with the exact value in the tooltip) | a formatter test with -0.004 bps and -$0.004 |
| Mono | only for ids, hashes, keys, code, and the receipt | review |
| Tap targets | 44 x 44 px on phones (icons get padding; inline links in running text exempt) | `audit5.ts` taps under 44 = 0 on the app's controls |

One style per number kind:

| Kind | Format | Example |
|---|---|---|
| Money | `$` + 2 decimals, thousands comma; below 1 cent "<$0.01"; signed only when it can be negative (true minus) | $52.08, $41,976.30, −$0.53 |
| bps | one decimal + " bps"; signed with true minus | 11.7 bps, −0.1 bps |
| Counts | integer with the noun | 245 orders, 607 fills |
| Shares | integer percent, one decimal under 10% | 74%, 4.5% |
| Grades | letter + score with one decimal + "of 100"; range below | A · 93.4 of 100 · range 92.5 to 94.1 |
| Times | `Jan 31, 2024, 14:25 UTC` in text; `2024-01-31 14:25:30` in tables (UTC named in the header) | |
| Durations | `6.9 s`, `2 min 50 s` | |

## 3. App shell and page template (the cal.com manner)

### 3.1 Sidebar (desktop from 1024 px; 240 px, collapsible to 64 px icons)

```
[F] FillScore                        [⌘K]
[Demo: mixed orders ▾]                  account switcher (demo accounts listed, labelled "Demo")

  ⌂  Home
  $  Costs
  ≡  Orders
  ⇅  Fills
REVIEW (12 px, sentence case: "Review")
  ⚑  Rule breaks
  ⇄  Comparisons
  ✦  AI review
TOOLS
  ✓  Reports
  ⎙  Check a broker file
--------------------------------
  ?  Docs
  ⚙  Settings
  ☀  Light / ☾ Dark                      a real switch with its label
  ●  trader@example.com / Log in
```

Group titles are 12 px sentence case in the muted colour (no caps tracking). Active item: a filled background (not an underline);
icons from lucide. The version text leaves the sidebar.

### 3.2 Page header (every app page)

```
[Demo account · synthetic trader, real Binance prices · read-only]           ← banner, 14 px, full width (demos and sample data)
Costs                                                       [Jan 2024 ▾] [Compare ▾]  [Download PDF]  [⋯]
What the 245 orders cost in January 2024, and where the cost came from.
[ Summary | By order type | By symbol ]                                                ← tabs where a page has views
```

Title 24 px semibold; one sentence 14 px muted; the period picker (a popover: presets "Whole history", "Last 7 / 30 / 90 days",
calendar months, "Custom range" with a two-month calendar; "Compare to: previous period / none"); one primary action; the rest in
"⋯" (How it's measured, Share, Copy link). On phones the actions collapse into "⋯" and the period picker stays visible.

### 3.3 Cards, tables, empty states

- **KPI tiles** (Plausible's row): label 13 px muted, value 28 px tabular, a sub-line 13 px ("of 245 orders", "against $44.05 in the
  previous 31 days" when comparing). At most four in a row; on phones two by two.
- **Chart cards**: title 16 px, one sentence, the chart with axis titles and units, a source line 12 px ("Source: your orders,
  measured against Binance public trades").
- **Tables**: 14 px rows of 44 px; header 12 px sentence case with sort; numeric columns right-aligned; the measure that matters is a
  default column (Orders: Cost $, Cost bps); a row opens the receipt in a side sheet (desktop) or a full-screen sheet (phone);
  column menu for the rest; sticky header; pagination 50.
- **Empty states**: an icon, a title, one or two sentences, at most one action ("Connect an exchange", "Sync now", "Try the sample
  file"). Each not-computed surface has its state from §4.
- **Info**: an "i" button opens a tooltip (desktop) or a sheet (phone) with the method; the sentence a reader needs is printed, not
  hidden.

### 3.4 Settings layout

A settings shell with its own left list: Account, Exchanges, API keys, Usage, Data and privacy (download, delete), About (versions,
changelog). Each section is a card with a title, one sentence, and its controls; destructive actions sit at the bottom of their card in
an outlined button, confirmed in a dialog.

### 3.5 Phone shell

A top bar (logo mark, page title, search, account); a bottom bar of four items with icons and 12 px labels (Home, Costs, Orders,
More); More opens a sheet with the other sections and Settings; sheets for the receipt, filters and the period picker; tables become
row cards (time, symbol and side on the first line; cost on the right; price and size below).

### 3.6 Invariant guards in the new shell

| Guard | Today | Proposed |
|---|---|---|
| Provenance (I5) | dashed 11 px chip in the header | a full-width 14 px banner on every app page for demos and sample data; the chip on receipts and the share page |
| ValueState words | dotted boxes, 11 to 13 px mono | the same three words and shapes, 13 to 14 px, sans |
| NOT SIGNED | on the demo receipt | unchanged |
| "not independently measured" | 13 px under the total | 14 px under the fees figure and in the receipt |
| Language-model heading | over model text in Ask and AI review | unchanged; the claims path keeps its line "The model chose which measured values to state; code wrote the sentence and placed the figures" |
| Past tense, no advice | `adviceCopy.test.ts` | all new copy runs through it; comparisons are past facts ("against $44.05 in the previous 31 days"), never "improved" |
| Correlation, never causation | copy tests | unchanged |

## 5. Every page redesigned

App (the prototype builds the ones marked ●):

| Page | Header (title · sentence · controls) | Content |
|---|---|---|
| **Home** ● | "Home" · "Your account at a glance." · period, Download PDF | tiles (**Total cost**, **Fees**, **Unfilled orders (modelled)**, **Execution grade**); a cost-per-order chart; "Costliest orders" (5 rows, open the receipt); the Ask box with recorded questions; the onboarding checklist instead of tiles for a new account |
| **Costs** (was Overview) ● | "Costs" · "What the N orders cost in <period>, and where the cost came from." · period, compare, Download PDF | tiles; "Where the cost came from" (stacked bar of fees, unfilled, execution with labels and dollars); "Cost per order" (bars over time, each bar one order, server values); "By order type" (market vs limit, grouped bars from `byType`); the grade card (stamp + score + range + version); "Against the model estimate" (market orders); scope facts in a small table |
| **Orders** ● | "Orders" · "Every order, what it cost, and its receipt." · search, side filter, period, Export CSV | table with Cost $ and Cost bps by default; row → receipt sheet |
| **Order receipt** ● | sheet title "Order <symbol> <side> <type>" | the printed receipt (kept, 14 px lines on a desktop, 13 px minimum on phones) beside a chart: public trades around the order (time × price), fills marked, arrival price line; NOTES as a normal disclosure; NOT SIGNED for demos |
| Rule breaks | "Rule breaks" · "Orders that broke a rule you set." | table with the rule, the order, its cost; empty state "No order broke a rule in this period" |
| Comparisons | "Comparisons" · "Median execution cost per group, with a 90% interval." · Group by: Symbol / Hour / Venue | horizontal bars with interval whiskers, group names on the left, value labels at the bar end, a zero line; "Too few orders to compare" list with counts |
| AI review | "AI review" · "A language model explains the measured figures. It writes no number." · Short / Full, Start review | a summary card first (the model's synthesis under the language-model heading); four sections (Liquidity, Benchmark, Risk, Fees) as cards in 14 px sans; cited figures as a small table placed by code |
| Reports | "Reports" · "Signed reports you can verify without us." | for real accounts: list of signed reports with Download and Verify; for demos one line; the grade record (version, hash) as a card |
| **Fills** ● | "Fills" · "Each execution, with its price and fee." · symbol, side, period, Export CSV | table (time, symbol, side, price, size, notional, fee, maker/taker; later "Price vs public trades", §4 row 2); no not-computed sentence |
| **Check a broker file** ● | "Check a broker file" · "Compare a broker's export with public prices. Nothing is stored." · Try the sample file | drop zone, format select, the result: tiles + table; the sample label |
| Settings | per §3.4 | |
| Connect | "Connect an exchange" · "Read-only keys only. We refuse keys that can trade or withdraw." | exchange cards with logos, the key form, the refusal receipt (kept) |

Marketing:

| Page | Proposal |
|---|---|
| **Landing** ● (hero) | headline and one sentence left, the receipt of one real demo order right, building line by line as the page loads; below: three steps (Connect read-only, We measure each fill against public trades, You get a receipt and a grade), a live demo strip, the giant total kept as the story's end; fixes the 393x659 overlap by never stacking the receipt under the headline on short screens |
| How it works | the three printed objects as a pinned scroll story (GSAP), each with one sentence |
| Demo | three cards (one per demo trader) with total cost, orders, period and a "Open" button; the synthetic line on each |
| Verify | one drop zone, the verification receipt; plain words ("Check a signed report") |
| Docs | a docs shell: left list, search, 16 px body, code blocks |

## 6. Charts

| Data shape (served by) | Chart | Library | Axis, unit and source labels |
|---|---|---|---|
| Parts of a total: fees, unfilled, execution (`/audit/orders-summary` `strip`, `shortfall.totals`) | one horizontal stacked bar, labelled segments with $ and share; a negative part named beside it (no width) | none (CSS widths from the server's shares) | "$ of the total, <period>" · source line |
| One value per order over time (`/audit/orders-ledger` `cost.usd`, `placedAt`) | bar per order on a time axis | Recharts `BarChart` (already a dependency), loaded on the page | x: "Order placed (UTC)", y: "Cost ($)" · tooltip with order, symbol, cost, bps |
| Totals by order type (`byType.market`, `byType.limit`) | grouped horizontal bars (execution, unfilled, fees) | Recharts | x: "Cost ($)" |
| Median per group with a 90% interval (`/audit/rankings`) | horizontal bar to the median with an interval whisker, zero line | Recharts `ErrorBar` or SVG | x: "Median execution cost (bps)"; group names left; "N orders" right |
| Public trades around one order (`demoPrints` / replay prints) | scatter of trades (time × price), buyer- and seller-initiated in two marks, fills as larger marks, arrival price as a reference line | Recharts `ScatterChart` (decision D4: or lightweight-charts with its attribution) | x: "Time (UTC, seconds)", y: "Price (USDT)" · "Source: Binance public trades, <file or window>, SHA-256 in Notes" |
| Grade within its range (`v2` `composite`, `band`) | a 0 to 100 bullet bar with the score and the band | none (CSS) | "Score of 100, range from the measurement" |
| Daily cost (proposed server route `/audit/cost-by-day`, not built) | column chart with the comparison period as a ghost series | Recharts | x: day, y: "Cost ($)" — the browser never sums orders |

Rules: every chart has a title, axis titles with units, a source line, a text alternative (the table or a sentence) and works without
colour (marks differ in shape). Colours from the theme tokens, validated in both themes.

## 7. Motion

| Where | What | Duration, frequency | Budget and fallback |
|---|---|---|---|
| App: hover, press | colour and background change | 120 ms, every interaction | CSS only |
| App: sheets, dialogs, popovers | slide/scale in, faster out | 200 ms in, 150 ms out; per open | Radix + CSS or Motion `m` (already loaded lazily); reduced motion: fade 0 ms |
| App: tab and period change | the content cross-fades | 150 ms; per change | none on keyboard actions |
| App: charts | bars grow from zero on first view of a session only | 300 ms once | Recharts `isAnimationActive` off under reduced motion and after the first view |
| App: list → receipt | View Transition of the row into the sheet header (desktop) | 200 ms | without support: the sheet opens plainly |
| Marketing: hero | the receipt prints line by line; a cursor halo over the receipt on fine pointers | 1.2 s once per visit | GSAP (dynamic import, landing only); reduced motion: finished frame |
| Marketing: scroll story | pinned three objects with scrubbed reveals (tape → receipt → grade), masked line titles | scroll-linked | GSAP ScrollTrigger + Lenis, marketing only; reduced motion: stacked, no pin |
| Marketing: page transitions | cross-fade and slide of the main block between marketing pages | 250 ms | View Transitions (no JS cost); unsupported browsers change pages plainly |

## 8. Budgets

| Route | First Load JS today (gzip, `scripts/first-load-js.mjs`) | Budget |
|---|---|---|
| `/` | 329.5 kB | **300 kB** (GSAP and Lenis stay dynamic; hero receipt server-rendered) |
| `/app` (Home) | 401.6 kB | **340 kB** (⌘K on first open: −11.7 kB; charts on their routes; Motion features after paint) |
| `/app/costs`, `/app/orders` | 401.6 kB | **360 kB** including the chart library chunk |
| `/login` | 317.0 kB | 300 kB |

Lighthouse mobile targets (same method as AUDIT.md): marketing **85+**, LCP **≤ 2.5 s**, TBT **≤ 300 ms**; app **75+**, LCP **≤ 3.0 s**
(the first figures rendered on the server, not after a client fetch), TBT **≤ 400 ms**; CLS **≤ 0.05** everywhere.

## 9. Decisions for Deepanshu

| # | Decision | Options | Recommended |
|---|---|---|---|
| D1 | Sidebar names | (a) Home, Costs, Orders, Fills / Rule breaks, Comparisons, AI review / Reports, Check a broker file; (b) keep today's nine nouns | **(a)** |
| D2 | App type | (a) Cabinet Grotesk for everything, Departure Mono only in the receipt, stamp and ids; (b) add a UI face (Inter or Geist, OFL) for body text | **(a)**: already loaded, tabular digits measured; the prototype shows it at 14 px |
| D3 | Theme names and default | (a) Light / Dark / System, default System; (b) keep Paper / Carbon copy | **(a)** |
| D4 | Receipt price chart | (a) Recharts (already a dependency); (b) TradingView lightweight-charts (62 kB, attribution logo or NOTICE + link) | **(a)** |
| D5 | App surface | (a) neutral light grey with white cards (paper tone kept for the receipt and marketing); (b) paper tone everywhere | **(a)** |
| D6 | Period picker and comparison | (a) build the server windowing first (orders-summary, ledger, by-day), then the picker; (b) a picker over the whole history only | **(a)**; the demos read "insufficient data" for a previous period |
| D7 | AI review | (a) rename and restructure (summary first, sections, Short/Full); (b) keep Council | **(a)** |
| D8 | Not-computed policy | (a) as §4: remove Patterns and v1 per-fill columns for accounts without them; compute fill vs public trades in ml-service; (b) keep the states | **(a)** |
| D9 | Marketing motion | (a) GSAP story kept + View Transitions between pages + hero cursor halo; (b) keep as is | **(a)** |
| D10 | The landing overlap on short phones (AUDIT #1) | (a) fix now in production as a small separate change; (b) wait for v5 | **(a)** |
| D11 | Safari coverage | (a) Deepanshu runs `sudo npx playwright install-deps webkit` once so the audit covers WebKit; (b) accept Chromium-only | **(a)** |
| D12 | Feature order (FEATURES.md) | the top 8 in the ranked order, or another | the ranked order, starting with the period picker (D6) and fill vs public trades (D8) |

## 10. Before and after (filled in step 7)

(The step 1 script run on the prototype pages, against the same pages today.)

## 4. "Not computed" policy

Every surface that can print a not-computed or insufficient-data state, why it happens (file:line), and its class:
**(a)** never available for this kind of account: remove the UI, one sentence where the reader looks;
**(b)** computable honestly from data we hold: a server-side computation, with a test plan;
**(c)** available later (after a sync, an upload, more orders): a designed empty state with the next action.
"Insufficient data" that is a true finding about the data (too few orders to rank) stays, but as a designed state with the count that is
missing, not as a dotted box.

| # | Surface (what the reader sees) | Why (file:line) | Class | Proposal |
|---|---|---|---|---|
| 1 | Fills: the line "Not computed for this data: slippage, score, grade and the average score" (and the hidden columns) | the rebuilt demos have no per-trade v1 fields: `backend/src/routes/audit.ts:139-146` (`hasV1Trades`, `v1Flag` gives `v1Computed: false`); `frontend/app/trades/fillsView.ts:32-43`, `TradesLedger.tsx:388` | score and grade **(a)**; slippage **(b)** | Drop the sentence and the score/grade columns for accounts without v1 trades (the v1 per-trade score is frozen with v1 and was never stored for them). Replace "slippage" with **Price vs public trades** per fill, computed server-side (row 2) |
| 2 | (new) Fills: price against the public price at the fill's second | demo print windows are stored (`backend/src/data/demoPrints.ts`, 681 windows); real accounts' measurement already fetches the same prints (`ml-service/measure/data/rest.py`) | **(b)** | ml-service computes, per fill, the mid from the last buyer- and seller-initiated print within 5 s before the fill (the rule of `csv_import/check.py`) and the fill's signed distance from it in bps; stored with a method version; a fill without a print on each side reads "insufficient data: no public trade on one side within 5 s". Coverage today: 82.9% (moderate), 84.0% (aggressive), 77.9% (disciplined) (LOG §AN). **Test plan:** hand fixtures in `ml-service/tests/measure/test_fill_vs_print.py`: buy at 100.10 with last buyer-initiated print 100.08 and seller-initiated 100.04 at -1 s and -2 s gives mid 100.06 and +4.0 bps (100.10 / 100.06 - 1 = 0.00039976, 4.0 bps to one decimal); a sell mirrors the sign; a print at exactly the fill's millisecond is excluded; a print 5.001 s old is excluded; one side missing gives insufficient data with that reason; window ids not consecutive raise the existing `DataGapError`. Backend: the trades route serves `fillVsPrint` with `methodVersion`; a test that a demo's served value equals the stored one. Frontend: a column test that `null` renders insufficient data, never 0 |
| 3 | Fills > Patterns: a whole tab "Analytics: not computed for this data" | `/audit/analytics` needs `fillScore` on trades: `backend/src/routes/audit.ts:646-658`; `frontend/app/analytics/Patterns.tsx:325-330` | **(a)** for accounts without v1 trades; the useful part **(b)** | Remove the tab for those accounts. Its useful views come back from v2 data: cost by hour of day and by symbol already exist server-side as Rankings' groups (`/audit/rankings`, Symbol and Hour); the new Costs page shows them as bar charts (§5) |
| 4 | Patterns: whale correlation "not computed" | whale enrichment exists only through scripts that are not run (`ml-service/whale/enrich.py`, approval list); `audit.ts:966-993` answers `not_available_for_account` or `not_computed_for_this_data`; `analytics/WhaleCorrelation.tsx:136` | **(a)** | Remove from the app; one sentence in Methodology ("Large-trade correlation is a research view, not part of the audit") |
| 5 | Venue comparison: "Only one venue in this account, so there is nothing to compare." | `audit.ts:793-799` and the single-venue answer of `/audit/venue-comparison`; `dashboard/RankingsView.tsx:47` | **(c)** | Show only when two venues are connected; otherwise one line in Comparisons: "Connect a second exchange to compare venues" with the Connect action (real accounts only; demos are single-venue by construction, so the line is not shown to them) |
| 6 | Rule-based details (scoring v1) fold: "not computed" for the rebuilt demos | `frontend/app/dashboard/DashboardContent.tsx:345-360`, `v1Computed` from `audit.ts:238-242` | **(a)**, with care (I4) | Keep the locked v1 grade where it is published (demo letters are locked by `gradeInvariance.test.ts`) and state in one sentence that its per-component details were not stored for this data. Do not hide a published grade |
| 7 | Header figures "not computed" (volume, maker share) | `frontend/app/dashboard/headerStats.ts:18-19` when the server sends no `current` summary (before a first sync) | **(c)** | The onboarding checklist replaces the figures until the first sync finishes (FEATURES #3) |
| 8 | Orders: a fee cell with no served fee | `frontend/app/dashboard/ordersTable.ts:104`; the audit retries `feeUsd` (`audit.ts:97-106`) when a price lookup failed at ingest | **(c)** | "Fee pending: price lookup retried at the next sync" in the cell's tooltip and a dashed cell; never 0 |
| 9 | Order receipt: "Insufficient data: this order has no stored measurement" / "Not measured: <reason>" / NOT COMPUTED cost lines | `backend/src/services/orderReplay.ts:64-75` (no measurement, or `unmeasuredReason`) | **(c)** if pending, **(a)** if the reason is permanent | Keep NOT COMPUTED on the receipt (invariant, DESIGN §2.8); the receipt's empty state says which: "Measured after the next sync" or the stored reason in plain words |
| 10 | Cost against expected: "Expected cost: insufficient data (<reason>)" and fewer than 20 market orders | `frontend/app/dashboard/explainView.ts:113`; the 20-order floor in `ml-service/expected_cost` (HANDOFF "Cost vs expected") | true finding | Designed state: "Needs 20 market orders; this account has 12" (both numbers from the server) |
| 11 | Rankings (Comparisons): "Insufficient data: no measured orders" / "no group has N measured orders"; "too few to tell, fewer than 20 orders" | `frontend/app/dashboard/rankingsView.ts:22`, `RankingsView.tsx:68-74` | true finding (or **(c)** before any order is measured) | Groups under the floor stay listed under "Too few orders to compare (fewer than 20)" with their counts; the empty page becomes an empty state with the next action (sync) |
| 12 | Home: "Measured grade: insufficient data" | `frontend/app/dashboard/HomeFigures.tsx:48` (no v2 grade yet) | **(c)** | Onboarding checklist step "First measured order" |
| 13 | Orders: maker share "insufficient data" | `frontend/app/dashboard/OrdersView.tsx:58` (an order without fills) | true finding | Show "No fills" (it is a cancelled or unfilled order), not insufficient data |
| 14 | Council: benchmark line "insufficient data" for the demos | the demos' trades carry no `vwap5m` (`frontend/app/utils/councilStatus.ts:139`; HANDOFF "Run 4") | **(b)** later, **(a)** now | A 5-minute VWAP needs five minutes of prints around each market order; the demo windows hold ±5 s. It is computable from data.binance.vision daily files (public) in the measurement job; until then the line is removed from the AI review for accounts without it, with one sentence in the method note |
| 15 | Broker-file check rows: "insufficient data" for a fill without a public price | `frontend/app/dashboard/csvCheckView.ts:74,86`, `CsvCheckPanel.tsx:30` | true finding | Keep, with the reason in words in the row ("no public trade within 5 s before this fill") |
| 16 | Rules: an exception list's "insufficient" note | `frontend/app/dashboard/explainView.ts:68` (the server's `note`) | true finding | A designed state with the server's note and its threshold |
| 17 | Methodology: the words "not computed" and "insufficient data" in prose | `frontend/app/methodology/page.tsx:121,127` | explanatory | Keep: it is where the reader looks for the rule |

Result for the demo accounts: no page and no tab opens on a not-computed state; every remaining "insufficient data" says what is missing
in numbers; the receipt keeps NOT COMPUTED for a missing cost line.

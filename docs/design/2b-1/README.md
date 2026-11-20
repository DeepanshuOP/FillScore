# M8 phase 2b, part 1: production screens

Built 2026-11-20 from the orders of that day (direction A, IBM Plex Sans). **Part 1 covers:** tokens and fonts in production, the app shell (navbar, footer, auth nav), one auth layout for the five account pages, the dashboard and settings with the evidence panel. **Part 2 (not started):** landing with the hero, trades, analytics, methodology, verify, check, share.

Screenshots (16 PNGs in this folder): `dashboard-moderate-{390,834,1440}.png`, `dashboard-disciplined-{390,1440}.png`, `dashboard-signedin-1440.png`, `settings-{390,834,1440}.png`, `login-{390,834,1440}.png` (full page), and `dashboard-moderate-{390,834,1440}-top.png`, `dashboard-disciplined-1440-top.png` (the first screen at full size). All 30 shots of the run (every screen at 390, 834 and 1440, full and top) come from `SHOTS=<dir> npm run test:shots`.

## What the screenshots show, and what they do not

The numbers on the dashboards are the output of the production `summariseOrders` over the offline demo build (`ml-service/demo_v2/out`: real January 2024 prices, synthetic trader), cut by `frontend/e2e-shots/cut-fixtures.ts`; no database and no Atlas. The v1 grades are the locked published ones. **Mocked, for layout only:** the Explain panel's queue and rankings (built from the same measurements, but not the production exception rules or bootstrap), the API-key rows and the e-mail on settings, and the signed-in dashboard (the demo fixture stands in for the account; the sync-status line is not mocked, so "data freshness" is absent from that shot). `demo-disciplined` shows "insufficient data" for cost against expected on purpose (0 market orders with an expected cost).

## What changed

| Part | Where |
|---|---|
| Production tokens, direction A only (CSS variables and Tailwind theme), body styles, links underlined in the base layer | `frontend/app/ui/tokens.css` |
| Direction B and the other font candidates: lab only | `frontend/app/design-lab/lab-tokens.css`, loaded by the lab layout only |
| Fonts: IBM Plex Sans 400/500/600 and IBM Plex Mono 400/500 through `next/font` | `frontend/app/layout.tsx`. Playfair Display, Inter and JetBrains Mono are gone. |
| Removed from production CSS: the old dark and light token sets, the unlayered `*` reset and `input::placeholder` rule, the theme blocks | `frontend/app/globals.css` |
| Shell | `Navbar`, `AuthNav`, `SiteFooter`; one layout for log in, sign up, forgot password, reset password, verify e-mail: `AuthLayout`, `OAuthLinks` |
| Dashboard | `app/dashboard/page.tsx` plus `Headline`, `CostPanels`, `OrdersPanel`, `ScoreRecord`, and the restyled `ExplainPanel`, `AskPanel`, `CsvCheckPanel`, `SyncFreshness`, `AgentCouncil`; view model `headline.ts` |
| Evidence panel (dashboard and settings) and its download | `app/components/EvidencePanel.tsx`, `app/lib/evidencePack.ts` |
| Settings | `app/settings/page.tsx`: destructive buttons with their confirm step for delete account, revoke key and disconnect |
| Formatting | `formatUsd` and `formatSignedBps` in `app/ui/format.ts` (one rule, hand-computed tests) |

**formatUsd rule:** two decimals everywhere, with thousands separators; a negative value has a true minus sign; a value that is not zero but would read "$0.00" reads "<$0.01" (">−$0.01" if negative); a value that is not a finite number reads "not computed". The lab's earlier three decimals below $1 are gone (the hero test values changed with it: $0.008 became $0.01).

**Dashboard order:** headline (grade, "The N orders paid $X in total.", the measured part and the fees at the published rate named apart, one cost sentence, the facts the headline covers, the v1 grade as a labelled second line, share and report buttons), where the money went (bars and a table), cost against what was expected (with the method behind a disclosure), orders and outcomes, the explain panel, Ask (signed in), the Council (headed "Explanation (language model; every number was checked against the audit)" once a result exists; "Alpha Architect" is shown as "Benchmark Reviewer" and its rating as "versus the benchmark"), data freshness (signed in), broker-file check (signed in), evidence, the record behind the grade, rule-based details.

**Removed from the dashboard** (not in the ordered list; the API routes and data are untouched): the v1 component score cards as a section (the components now sit in a disclosure at the end), the execution cost breakdown, the score trend chart, the exchange comparison, the execution coach and the insights and recommendation cards with their closing call to action. `recharts` is no longer loaded by the dashboard. Reason in the order's own list; if one of these should come back, it is a part 2 decision.

**Bridge for part 2:** the screens that part 2 will rebuild still name `--font-inter`, `--font-playfair` and `--font-mono`; `globals.css` maps those three names to the one new family so no old font loads, and keeps the helper classes the landing page and onboarding use. Their inline old-palette colours became literal values (the pages stay dark until part 2). Delete the bridge block with the last of those screens.

## Verification

| Check | Result |
|---|---|
| Frontend unit tests | 64 files, 545 passed (61 files, 483 at the start of the session) |
| `tsc --noEmit`, `npm run build` | 0 errors, build ok |
| Lint | **50 warnings before, 29 after; 0 in every rebuilt file**; 0 errors. The 29 left are in `trades`, `analytics`, `onboarding`, `page.tsx`, `share` and `AuthContext`. |
| e2e (production build, real backend and ml-service) | 37 passed (35 at the start of the order) |
| Design lab browser spec | 22 passed |
| axe (`@axe-core/playwright`, wcag2a, 2aa, 21a, 21aa, 22aa) | **0 serious or critical** on the dashboard (demo-moderate), settings and login, at 390 and 1440 px (6 scans); no horizontal scroll at either width |
| Backend | see PROGRESS (run at the end) |

axe found one real defect that no unit test had: `Field` ignored a caller-chosen `id` for its label's `for`, so a field with `id="login-password"` had a label pointing at a generated id. Fixed in `app/ui/Field.tsx` with a test.

### First Load JS (gzip kB, `frontend/scripts/first-load-js.mjs`, same script before and after)

| Route | Before | After | Change |
|---|---|---|---|
| `/dashboard` | 390.4 | 326.9 | **−63.5** (budget: at most +30; `recharts` and the v1 sections left the bundle) |
| `/` | 259.4 | 268.1 | +8.7 |
| `/analytics` | 373.7 | 376.1 | +2.4 |
| `/trades` | 261.2 | 270.1 | +8.9 |
| `/check` | 254.6 | 303.2 | +48.6 |
| `/settings` | 254.9 | 304.4 | +49.5 |
| `/login` | 252.8 | 299.2 | +46.4 |
| `/signup` | 252.9 | 299.4 | +46.5 |
| `/forgot-password` | 252.4 | 298.9 | +46.5 |
| `/reset-password` | 253.7 | 300.0 | +46.3 |
| `/verify-email` | 252.3 | 262.5 | +10.2 |

The 46 to 50 kB on the account pages, settings and check is GSAP and Flip, which the shared `Button` (and `Field`'s neighbours) import through `app/lib/motion.ts`. A login form needs only the spinner. **Open, not done:** load the motion module on first use (a dynamic import in `Button`, `Toast`, `Disclosure`, `DataTable`) so a page that never animates does not pay for it. The dashboard budget is met by a wide margin because the old v1 sections left.

## Independent review of the screenshots

A reviewer subagent (fresh context, no write access) read the screenshots against the lab README and the order. Its 17 findings, with what was done:

| # | Finding | Result |
|---|---|---|
| 1 high | The "no number" case in the headline was plain text, not a ValueState, with a doubled colon | **Fixed.** The headline shows the hollow-diamond "insufficient data" value with its reason and a visible label; the sentence exists only when there is a figure. Tests: `costSentence` returns null without a figure, `costInsufficientReason`. (An earlier version also had "(found 0))" in doubled parentheses, found by my own look at the first shots.) |
| 2 medium | Disconnect buttons were neutral and had no confirm step | **Fixed.** Destructive variant with a confirm step. |
| 3 medium | Share and download sat on the v1 row and made the second line heavy | **Fixed.** The buttons moved to the headline's top row; the v1 note is one short line. |
| 4 medium | The "Orders" column of the totals table read 245 on every row | **Fixed.** Column removed (the API's count per term is the same for every term). |
| 5 medium | ">−0.01 bps" unexplained; medians do not add up | **Partly fixed.** One line says the terms are medians and do not add up to the median total. The ">−0.01 bps" form is the rule of the shared `formatBps` (tested, also used by the PDF), so it stays. |
| 6 medium | The cost sentence was long | **Fixed.** Shortened: "Market orders cost −0.09 bps against 0.11 bps expected: difference −0.21 bps, 90% interval −0.34 bps to −0.09 bps, 80 orders." |
| 7 medium | Ask, data freshness and the broker-file check were in no screenshot | **Fixed for two of three.** A signed-in dashboard shot was added (Ask, Council, broker-file check, evidence buttons). The data-freshness line is not in it (the sync status is not mocked); it is covered by the unit and e2e tests. |
| 8 low | Footer 20 px outside the page column | **Fixed.** Same column and padding as the navbar. |
| 9 low | Text lines shorter than their column, empty right half of the headline card | **Kept.** A 68-character measure is deliberate for reading. |
| 10 low | The "Binance" chip in the navbar was unexplained | **Fixed.** It reads "Venue: Binance". |
| 11 low | "Still open" orphaned in a four-column grid | **Fixed.** Five columns on wide screens. |
| 12 low | Orders and outcomes is crowded | **Kept for part 2.** The sub-blocks are the data of that section; a heavier rule between headline and detail sections is a part 2 spacing decision. |
| 13 low | Replay buttons repeat five times; the finding clause repeats | **Kept.** The repeated clause is in my layout stand-in, not production copy; the Replay button is the action of each row. |
| 14 low | Heading sizes and left edges differ between settings and login | **Partly fixed.** The settings column now starts on the navbar's left edge. Sizes stay: the scale has 28 and 40 px steps, and a settings page title and an account form title are different page types. |
| 15 low | Period after the fingerprint chip looks separated | **Kept.** The chip's own border and padding make the gap; the text has no space. |
| 16 low | Disabled controls read as weak | **Kept.** A disabled state; exempt from the contrast rule. |
| 17 low | Demo provenance appears twice | **Kept.** The banner explains; the chip is the stored `dataSource` label. |

## Not verified

No screen was looked at on a real phone (Chromium at 390 px only). The signed-in screens were checked with mocked API answers and the e2e suite, not with a real connected account. The motion on tables (Flip), disclosures and toasts was checked by the unit tests of the motion module and the e2e behaviour, not by eye. The GSAP licence terms are recorded in `THIRD_PARTY_LICENSES.md` (read 2026-11-20); the fonts (SIL OFL 1.1) now ship in production.

## Notes for part 2

- **Hero** (record of the order's note): the market tape shows from frame 0 and only the order's story animates; the ledger area keeps its space with a muted axis, so there is no blank gap and no layout shift; the hero order is chosen by a stated deterministic rule (for example the market order nearest the account's median execution cost), shown in "Figures and sources".
- Rebuild the screens listed under "Bridge for part 2", then delete the bridge block of `globals.css`, the literal old-palette colours and `NotComputed.tsx`'s dark styling.
- Add the part 2 files to `app/utils/rebuiltFiles.ts` so the advice, copy and style tests scan them.

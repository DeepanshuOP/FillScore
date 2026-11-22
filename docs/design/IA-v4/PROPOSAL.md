# IA v4 proposal: a marketing site and an app (fifth order of 2026-11-22, step 2)

Status: **proposal for Deepanshu's choice.** Nothing in production changes with this document; the working prototype is in the
design lab (`/design-lab/ia4`, 404 in production). Research: `REFERENCES.md` in this folder. Images: `README.md` in this folder.

## 0. The case in five lines

1. Today one top bar serves two jobs: it sells (landing, methodology, verify) and it works (the account's sections in a row of
   tabs plus "More"). A first-time visitor sees both at once; a returning user scans six tabs and a menu.
2. Every product we read (cal.com, Linear, Koyfin, PostHog, Stripe) splits them: a marketing top bar of 6 to 10 items, and an app
   with a left sidebar of about ten nouns. Docs are a third, quiet shell.
3. FillScore already has the pieces of a better app home: the Ask agent (deterministic tools, code-placed numbers, past tense) and
   the account's key figures. Home becomes "Ask FillScore" with the figures under it.
4. The Tape & Receipt identity stays: paper, ink, pen, stamps, the receipt. Nothing in the captures argues for changing it; the
   change is structure, not look.
5. No route disappears without a redirect, and nothing that guards an invariant moves out of sight.

## 1. Sitemap

```
MARKETING (top bar, public)                         APP (left sidebar on a desktop, bottom bar on a phone)
/                  Landing                          /app                Home: Ask FillScore + key figures
/how-it-works      How it works (new page,          /app/overview       Overview (the five chapters of today's overview)
                   from the landing's HowItReads)   /app/orders         Orders (ledger, receipt)
/demo              Demo entry: pick a trader        /app/rules          Rules (exception queue)
/verify            Verify and trust                 /app/rankings       Rankings
/docs              Docs hub                         /app/council        Council (Quick / Deep)
  /methodology       Methodology (unchanged URL)    /app/evidence       Evidence (packs, the record behind the grade)
  /docs/mcp          MCP client (from runbook)      /app/fills          Fills: ledger and patterns (today's Trades + Analytics)
  /docs/package      The open metrics package       /app/check          Check a broker file (tool)
/terms, /privacy   Legal (footer)                   /app/settings       Settings (own shell, "Back")
/share/[userId]    Public score card (unchanged)    /app/connect        Connect an exchange (today's /onboarding)
/login, /signup, /forgot-password, /reset-password, /verify-email: account pages in the quiet marketing shell
```

Pricing: **no page.** Stripe is prepared and off, there is no plan to show (STATUS, M9), so the top bar has no Pricing item.

### Marketing top bar

`FillScore.` · How it works · Demo · Verify · Docs · (right) Log in · **Open the demo** (ink pill). "Demo" and "Open the demo"
both go to `/demo`, the choice of trader; nothing skips the choice. 4 items plus two actions
(cal.com has 10; Linear 8). Methodology and Verify stay public but leave the app's bar: Methodology sits under Docs, Verify is
its own item because "check it yourself" is the trust promise. Phone: wordmark, "Open the demo", Menu; the menu is a receipt
sheet with the five items and Log in / Sign up pinned at the bottom (cal.com's pattern).

### App sidebar (desktop, 1024 px and up)

```
FillScore.                       ⌘K
[ Demo: mixed orders, mixed hours ▾ ]      <- account switcher
SYNTHETIC TRADER, REAL PRICES               <- provenance, printed, never collapsed away
JAN 1 - JAN 31, 2024                        <- period, mono

Home                                        <- Ask FillScore + key figures
Overview
Orders
Rules
Rankings
Council
Evidence
Fills
Check a broker file

────────────
Public score card     (demo accounts)       <- the account's public artefact, like cal.com's "View public page"
Methodology           (opens the public doc)
Settings              (signed in)
Carbon copy  ◐
SCORING V2.3.0 · MEASURE 1.0.0              <- versions, mono, small (cal.com prints its version here)
Log out / Log in
```

Nine nouns, no group labels (cal.com: ten, no labels). The pen underline marks the current item. Width 232 px; collapsible to a
56 px rail of printed initials (O, R, ...) at 1024 to 1279 px, with the provenance line moving into the page header (it is never
only in the sidebar: the header carries it on every app page, see section 4).

### Phone navigation (below 1024 px)

A printed bottom bar of four: **Home · Overview · Orders · More**. "More" opens a Vaul sheet (receipt paper, torn top edge) listing
Rules, Rankings, Council, Evidence, Fills, Check a broker file, then the bottom group (score card, Methodology, Settings, theme,
versions, log in/out). The account switcher and the provenance line sit at the top of every app page, above the title.

## 2. App home: "Ask FillScore"

```
┌ page header ─────────────────────────────────────────────────────────────┐
│ SYNTHETIC TRADER, REAL PRICES · Demo: mixed orders, mixed hours           │
│ Ask FillScore                                                             │
│ Questions about this account's past executions. Answers use only the      │
│ stored measurements; every figure is placed by code.                      │
└──────────────────────────────────────────────────────────────────────────┘
  [ Ask about your past executions ........................ ] [ Ask ]
  ( What did my orders cost in total? ) ( Which orders cost the most? )
  ( What score did my execution get? ) ( How did my market orders compare with the modelled cost? )

  <answer prints here as a receipt slip: the answer, then READ: costs · 2 MODEL CALLS, the values it used in a fold>

  01 TOTAL     $52.08  the 245 orders paid, Jan 1 to Jan 31, 2024        [GRADED A 93.4 stamp, small]
  02 WHERE     the torn strip: fees · unfilled orders · filled orders' execution
  Read the full overview  ->  /app/overview
```

- **Chips**: four complete past-tense questions, each one of the Ask tools (costs, costliest, score, cost against expected). They
  fill the box and send; they never write a figure themselves.
- **Answer**: the Ask agent's output as returned: the answer sentence(s), "Read: <tools>. Used 2 model calls.", the values in a
  printed fold, and when degraded the existing line "Written by code from the measured values, because ...". The LLM block keeps
  its DESIGN §9 heading.
- **Key figures under it** are today's overview chapter 01 (the total and its sentence, the grade stamp) and 02 (the strip),
  served by the same APIs (`/audit/orders-summary`); the other chapters stay on Overview.
- **A demo visitor** picks a trader on `/demo` and lands on `/app?userId=demo-*`. The Ask service refuses demo accounts (no model
  runs on request for demo data), so a demo Home has **no input box**: it shows "Recorded questions" as chips, each printing the
  **recorded** answer of the real Ask agent, labelled "Recorded answer, not live", with a code-built line of scope (period and order
  count). The LLM heading appears only over text the model wrote; a degraded answer is headed "Written by code from the measured
  values". Screen readers hear the answer sentence once (one status element), not each printed line.
- **The stamp** on Home is the small one (period only), so the scoring version and range are printed beside it
  ("SCORING V2.3.0 (MEASURED), RANGE 92.5 TO 94.1"). The locked v1 grade stays where it is today (Evidence, "v1 details").
- **A signed-in user** lands on `/app` after login (today: `/dashboard`). With no exchange connected yet, Home shows the connect
  empty state (one icon, "No trades yet", two lines, one action: "Connect an exchange") and the broker-file tool beside it; Ask is
  disabled with "Ask needs measured orders." With data, Ask is live (2 budget units per question, as today).

## 3. Page inventory

Every route of `frontend/app` (router) and ARCHITECTURE.md §4. Redirects are permanent (308) and keep the query string
(`userId`, `symbol`, `order`), so shared links keep working. "Guard" names the invariant element the page carries; it moves with
the page and stays visible.

| Route today | Decision | Lands at | Redirect | Guard that must stay visible |
|---|---|---|---|---|
| `/` | keep | `/` (top bar trimmed to 5 items) | none | synthetic line on demo receipts, NOT SIGNED |
| (landing section HowItReads) | move | `/how-it-works` | none (new page; the landing keeps a link) | ValueState words, past tense |
| `/dashboard` (`?view=overview`, default) | move + rename | `/app/overview`; `/app` becomes Home | `/dashboard` → `/app`, `/dashboard?view=overview` → `/app/overview` | provenance line, NOT COMPUTED totals, ValueState |
| `/dashboard?view=orders` | move | `/app/orders` | yes | receipt: synthetic line, NOT SIGNED, "not independently measured" |
| `/dashboard?view=rules` | move | `/app/rules` | yes | review states |
| `/dashboard?view=rankings` | move | `/app/rankings` | yes | "too few to tell", "not distinguishable from" |
| `/dashboard?view=council` | move | `/app/council` (Ask moves to Home) | yes | the LLM heading, "every number was checked", recorded output verbatim |
| `/dashboard?view=evidence` | move | `/app/evidence` (the broker-file check moves out to its own tool) | yes | NOT SIGNED, hashes |
| `/trades` | merge | `/app/fills` (tab "Ledger") | yes | not computed cells |
| `/analytics` | merge | `/app/fills?tab=patterns` | yes | v1-only views say "not computed for this data" |
| `/check` | move (becomes an app tool) | `/app/check`, reachable signed out and in demo mode | yes | nothing is uploaded; refusals printed |
| `/verify` | keep public, leaves the app bar | `/verify` (marketing "Verify") | none | nothing is uploaded; VALID / INVALID stamps |
| `/methodology` | keep public, leaves the app bar | `/methodology` (under Docs; the app links to it at the sidebar's bottom) | none | generated from code (drift test) |
| `/settings` | move | `/app/settings` (own shell with "Back") | yes | keys read-only; delete data |
| `/onboarding` | move + rename | `/app/connect` | yes | refused key = returned receipt with corrections |
| `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email` | keep | same URLs, quiet marketing shell; after login go to `/app` | none | none |
| `/share/[userId]` | keep | same, linked from the sidebar ("Public score card") | none | synthetic line, OG image |
| `/terms`, `/privacy` | keep | footer | none | none |
| `/design-lab/*` | keep (dev only, 404 in production) | adds `/design-lab/ia4` | none | none |
| `/api/preflight`, `/frontend-version` | keep (server routes) | same | none | none |
| (new) `/demo` | add | demo entry: the three traders as printed slips (name, orders, period, the synthetic line), each opens `/app?userId=demo-*` | none | synthetic line on each |
| (new) `/docs`, `/docs/mcp`, `/docs/package` | add | docs hub; MCP from `docs/runbooks/MCP_CLIENT.md`; package from `packages/fillscore-metrics/README.md` | none | none |
| ⌘K palette | keep | lists the sidebar's items and actions | n/a | n/a |

Nothing retires. Trades and Analytics merge into one page because both read v1 per-fill scores; one sidebar item is clearer
than two. The redirects go in `next.config` `redirects()`, with a test that every old URL (including each `?view=`, and
combinations such as `?view=orders&userId=demo-moderate&order=...`) answers 308 to its new home and keeps the rest of the query;
and that `/app/*` pages without `userId` send a signed-out visitor to log in, while `/app/check` stays open signed out.

Glosses for the less obvious nouns go in the ⌘K palette and the More sheet, one line each: Rules "orders that broke a stated
rule", Rankings "groups of orders compared, with noise", Council "a language-model review of the audit", Evidence "signed packs and
the record behind the grade", Fills "each fill and its patterns".

## 4. Number presentation rules (proposed DESIGN.md section 12; proposal text only)

DESIGN.md is not edited by this proposal. If chosen, this becomes section 12 and the decisions log moves to 13.

> **12. Numbers**
> 1. **One headline figure per view.** A page or card leads with one figure at display size; everything else is smaller or in a
>    fold. Never a strip of four same-weight figures (§10).
> 2. **Unit and period beside the figure, in words**: "$52.08 the 245 orders paid, Jan 1 to Jan 31, 2024". bps always carries
>    "bps"; a share carries "%"; a count names what it counts.
> 3. **Comparisons are sentences**: "against 0.1 bps modelled", "4 of 245 orders". Shape and words carry better/worse; money
>    is never coloured good or bad (§3). The sign is a true minus.
> 4. **Precision follows meaning**: dollars to cents, bps to one decimal, scores to one decimal; the exact stored value is in
>    the title or the note. No running counters, no 8-decimal shares.
> 5. **Partial and empty data say so** through ValueState (measured / insufficient data / not computed); a missing cost line
>    prints NOT COMPUTED, never 0; an empty page has one icon, one title, two lines and at most one action.
> 6. **Provenance travels with the figure**: the synthetic line in every app page header, NOT SIGNED on demo receipts, "not
>    independently measured" on published-rate fees, the scoring version at the sidebar's bottom and on the stamp.
> 7. **Model text never carries a figure of its own**: figures in Ask and Council answers are placed by code; the block says so.

## 5. Interaction plan and budgets

From REFERENCES §5; every one uses dependencies already installed (no new package, nothing from 21st.dev).

| Interaction | Where | Frequency | Duration, easing | Reduced motion | Touch |
|---|---|---|---|---|---|
| Receipt prints (paper feeds, lines print in order) | order receipt; Ask answer slip; landing demo receipt | first receipt of a session; each Ask answer | paper 420 ms `cubic-bezier(0.32,0.72,0,1)`; lines 18 ms apart, at most 360 ms; tear 220 ms | finished slip at once | same (Vaul from the bottom for the receipt) |
| Sidebar pen underline moves to the current item | sidebar | each navigation | 180 ms `cubic-bezier(0.23,1,0.32,1)` | jumps | phone bar: none |
| Page change | app content | each navigation | 160 ms fade + 8 px, no exit | none | same |
| Pen nib follows the pointer over the hero tape | landing hero | once per visit, fine pointer only | quickTo 90 ms | off | off |
| Stamp press (exists) | overview first entry, Home figures, landing | once per session per account | 420 ms | finished stamp | same |
| NumberFlow after a user action (exists) | Home figures, overview | on switch of account or period | default | plain swap | same |

None on tables, filters, folds, tabs, the palette or keyboard actions (DESIGN §11).

**Bundle budget.** First Load JS on `/dashboard` (today 391.7 kB gzip, `scripts/first-load-js.mjs`) must not grow more than
15 kB for the app shell; the prototype's lab page is measured against the same script in step 3. The print effect is CSS
keyframes; the underline is a CSS transform; no new library.

## 6. Phone layouts (390 and 320)

| Section | 390 px | 320 px |
|---|---|---|
| Shell | top: account switcher (one line, truncates the name, keeps "Demo:"), provenance line under it; bottom bar of 4 printed words, no icons, 56 px tall | same; the four words at 12 px mono, whole (checked in the lab at 320) |
| Home | title 30 px; Ask box full width with the button under it; chips wrap 2 per row, then scroll as one column; total at `display-lg`; the stamp beside it moves under it | chips one per row; total at `display-md` |
| Overview | chapters stacked; rail labels above each chapter instead of a left column | same |
| Orders | ledger: placed, symbol, side, cost; the rest in each row's menu; the receipt as a Vaul drawer | ledger: placed and cost only, symbol under placed |
| Rules, Rankings | ledger rows stack label over value | same |
| Council | Quick/Deep switch full width; notes stacked; cited values in the fold | same |
| Evidence | packs as rows with one action each | same |
| Fills | tabs Ledger / Patterns; the ledger keeps two columns, the heatmap scrolls inside its own box | same |
| Check a broker file | the drop area becomes one "Choose a file" button | same |
| Settings | own shell: "Back" at top, groups as a list | same |
| Receipt | cost lines wrap with their leader (step 0b) | same, tested at 320 |

## 7. What stays

The identity: paper (#F3F2EE), ink, the fill-orange pen as the auditor's mark, Departure Mono for printed things, Cabinet
Grotesk for the rest, the receipt, the stamp, the tape, the envelope, Carbon copy. The captures show cal.com and the fintech
sites on white or dark with sans figures; none shows a reason for FillScore to give up printed paper, which is also what makes it
recognisable among them. The sidebar is set as a printed column on the same paper, with one ink rule beside it (no card, no
shadow).

## 8. Open questions for Deepanshu

1. URL prefix `/app/*` (recommended; one Next app, cal.com uses a subdomain) or keep `/dashboard/*`.
2. Trades and Analytics merged into "Fills" (recommended), or kept as two items.
3. `/how-it-works` as a page (recommended: the landing stays short), or a landing section only.
4. The recorded Ask answers on demo Home (recommended, labelled), or no Ask on demo accounts at all.
5. The Ask agent's recorded comparison answer reads "-0.1 bps in bps" (a doubled unit in the model's sentence; the recording is not
   edited). A renderer or prompt fix is a separate order.
6. The landing hero's figures (spread, impact and timing, fees of one demo order) carry the synthetic line below the call to action,
   not beside the tape. A "One demo order, Jan 31, 2024" label on the tape itself is a small production change, outside this order.

## 9. Review (step 4, one reviewer, Sonnet, read-only)

| Finding (reviewer's rank) | Decision |
|---|---|
| Two demo entries land on different pages (high) | Fixed: both go to the choice of trader (`/demo`; lab: the site's demo section). |
| LLM heading over the code-built fallback answer (high) | Fixed: the heading shows only over model text; a degraded answer is headed "Written by code from the measured values". |
| `aria-live` around the whole printing slip; chips as `aria-pressed` toggles (high) | Fixed: one `role="status"` element announces the answer sentence; chips are plain buttons. |
| Home is a chat box a demo visitor cannot use (medium) | Fixed: no input on a demo Home; "Recorded questions" with a sign-in link. |
| No scoring version beside the small stamp; v1 shows B 84.8 (medium) | Fixed: "Scoring v2.3.0 (measured), range 92.5 to 94.1" printed beside the stamp. v1 stays in Evidence, as today. |
| Sidebar jargon (medium) | Kept the nine nouns (cal.com: ten, unlabelled); added one-line glosses in the ⌘K palette and the More sheet (section 3). |
| Model numbers only "verified in the old Ask path" (medium) | Kept: the recording came from the production `ask_flow`, whose gate drops any number that is not a tool value (`agents/ask.py`); the UI shows its output verbatim. The doubled unit is open question 5. |
| Answer lacks period and count (medium) | Fixed: a code-built scope line on the slip ("JANUARY 2024 · 245 ORDERS"). The strip's sentence sits under the page header's period. |
| Landing hero figures lack a "demo order" label at the tape (medium) | Kept: the hero is production's, unchanged by this order; open question 6. |
| Chips and sidebar items under 44 px (medium) | Fixed for chips (min-height 44 px). Sidebar items are desktop-only (fine pointer); WCAG 2.2 AA asks 24 px, met. Native `<dialog>` returns focus to its opener on close. |
| Pen underline measured once (medium) | Fixed: re-measured on resize and after the fonts load. |
| Redirect test should cover query combinations; `/app/*` auth (low) | Fixed in section 3. |
| NOT SIGNED and "not independently measured" absent from images (low) | Kept: no order receipt is in the prototype (NOT SIGNED lives on the receipt, unchanged); the fee part of the Home strip prints "Not independently measured: fees at the published rate." under its figure. |
| Graphite contrast (low) | Kept: graphite is >= 4.5:1 on all three grounds, tested by `app/ui/contrast.test.ts`; axe 0 serious. |
| Account switcher button does nothing; ⌘K hint read aloud (low) | Fixed: the switcher links to the choice of trader; the ⌘K hint is `aria-hidden`. |

# M8 phase 1: proposal for the design and UI work

Status: **proposal, for Deepanshu to read and change.** No UI code was written. M8 is a collaborative phase: nothing below starts until he answers the questions in section 5.

How this was made. The screen list comes from `ARCHITECTURE.md` §4. The "current problems" come from reading the code, the lint output and the tests, and from computing colour contrast. **No screen was reviewed visually** (no screenshots were taken), so every problem here is a code-level fact or a measurement. Phase 2 should begin with screenshots of every screen, in both themes, at phone, tablet and desktop width, and this list should be corrected against them.

Two rules from the product limit what the design may do, and they are not up for change in M8 (`CLAUDE.md`, rules 1, 2, 6 and 7): copy states past-tense findings and never advice; every number comes from deterministic code; a value that cannot be measured says so; copy says "coincided with" and never "caused".

## 1. Screen inventory

Size is lines of the page file. Warnings are the ESLint warnings today (50 in all, section 3).

| Screen (route) | Purpose | Data it shows | Current problems |
|---|---|---|---|
| Landing (`/`), 615 lines | Explain the product and send a visitor to a demo or to sign-up | The three demo accounts (cards with their grades), hero line, how it works, footer | 83 inline `style` blocks, so the look is repeated by hand; 4 lint warnings (2 relative redirects, 1 state set in an effect, 1 mutation after render); the demo cards show the v1 score from `/audit/score` (`avgFillScore`, the frozen published audit: letters C, B, A) while the dashboard leads with v2 (94.35 A, 93.41 A, 93.68 A), so a visitor sees two different grades for one demo without a word of explanation on the card; the card colours its letter with its own inline map (`app/page.tsx` line 451) that differs from `gradeColor.ts` (a B is `#86efac` on the card and `#bbf7d0` elsewhere) |
| Sign-up, log-in, forgot and reset password, verify e-mail (`/signup`, `/login`, `/forgot-password`, `/reset-password`, `/verify-email`), 175, 205, 122, 226, 77 lines | Account flows | Forms; OAuth buttons; messages from the API | Five separate pages with their own styling next to a shared `AuthCard`; 2 lint warnings each in log-in and sign-up (relative redirects); error texts come from `errorMapping.ts` but are not shown in one pattern |
| Onboarding (`/onboarding`), 654 lines | Connect Binance, Bybit or OKX with a read-only key, choose a look-back, sync | Exchange picker, key form, the rule "read-only keys only" and what to enable or disable when a key is refused, sync progress | One long file; 1 lint warning; the refusal states (`key_not_read_only`, `invalid_key`, `network_error`) are the moment of highest user risk and have no dedicated design |
| Dashboard (`/dashboard`), 1,603 lines | The account's audit: how the past executions measured | Header figures (fills, orders, notional, maker ratio, from current data); the v1 score ("rule-based") and the v2 panel ("measured": components, dollar cost breakdown); cost vs expected with interval or "insufficient data"; the orders panel (outcomes, resting time, shortfall); the explain panel (exceptions, replay, rankings, venue comparison); Ask; Quick and Deep Council; data freshness line; broker-file check; skipped-trades note | The largest screen: 245 inline `style` blocks, 11 lint warnings; about ten panels stacked with no hierarchy between the headline finding and the supporting tools; two scores side by side need a clear reading order; the three "no number" cases (not computed, insufficient data, unavailable) each have their own ad hoc look (`NotComputed.tsx`, `est-cost-not-computed`, text inside panels) |
| Analytics (`/analytics`), 714 lines | Deep dive into one period | Hour heatmap, markout card, exchange comparison, whale correlation (sample accounts only) | 2 lint warnings; the heatmap wording was corrected in M9 but its colour scale carries a good/bad reading; whale correlation shows an "unavailable" answer for connected accounts in yet another style |
| Trades (`/trades`), 866 lines | Blotter of fills, sorting, notes, CSV export | One row per fill: price, size, fee, per-trade v1 fields (or "not computed") | 18 lint warnings (the most of any file); 156 inline styles; table has no stated rules for sticky header, column priority on a phone, or number alignment |
| Verify (`/verify`), 99 lines | Check a signed evidence pack in the browser, nothing uploaded | A dropped pack file, the result per file, the trusted key | Minimal, correct, and unstyled for a page whose job is trust: it should show the three outcomes (valid, a named changed file, unreadable) as clearly as a receipt |
| Broker-file check (`/check`, also a dashboard panel) | Compare a Kraken or mapped CSV with public prices | A file picker, column mapping, per-fill findings, the "not yet checked against a real file" label | The mapping step has the most form fields in the product; the label that says a reading is unverified needs a permanent place |
| Methodology (`/methodology`), 104 lines | The method and scoring version, generated from the code | Metric registry text, version, hash | Long generated text with no navigation; it is the page an interviewer or a reviewer reads, so it needs a contents list and anchored metric names |
| Settings (`/settings`), 232 lines | Disconnect an exchange, download or delete data, personal API keys | Connections, export and delete buttons, API key list and creation (secret shown once) | Destructive actions (delete the account, revoke a key) share the look of ordinary buttons; no evidence-pack download exists here or anywhere (section 3) |
| Share card (`/share/[userId]`) | Public score card for demo accounts, with Open Graph image | The frozen v1 grade of a demo | Shows only v1; needs the same "published grade of the earlier demo data" label the dashboard uses |
| Terms, privacy (`/terms`, `/privacy`), 20 lines each over `LegalDocument` | Legal pages | Text | Fine; readable width and heading scale only |
| Shared: navbar (184 lines), footer, auth nav, Council panel (`AgentCouncil.tsx`, 593 lines), connect prompt | Navigation and the AI explanation | Links; the four specialist cards, debate, synthesis; Quick or Deep toggle and budget | The Council panel has 5 lint warnings and its own agent glyphs (◆); the budget (Deep 9 units, Quick 1) is shown as text only |

`/api/preflight` is a server route, not a screen.

## 2. Design-system proposal

The aim is one small system that makes the product's honesty visible: what was measured, what could not be, and how much to trust a number.

### Where things stand (measured)

- Colour tokens already exist as CSS variables in `app/globals.css` (a warm dark theme with a gold accent, and a light theme), but pages repeat raw hex values: in the dashboard file alone `#888078` appears 43 times, `#ede8e0` 26 times and `#161614` 13 times.
- 30 different `fontSize` values in rem are used across the page and component files. Three font families are loaded (Playfair Display, Inter, JetBrains Mono).
- Contrast, computed from the tokens (WCAG: 4.5 for body text, 3.0 for large text and interface parts):

| Pair | Ratio | Reading |
|---|---|---|
| text-primary `#f0ece4` on `#0f0f0f` | 16.27 | fine |
| text-secondary `#b8b0a6` on `#0f0f0f` | 8.94 | fine |
| text-tertiary `#888078` on `#0f0f0f` / on `#1a1917` | 4.93 / 4.52 | passes, barely |
| text-ghost `#585450` on `#0f0f0f` | 2.55 | fails for text |
| gold-dim `#6b5a47` on `#0f0f0f` | 2.90 | fails for text |
| red `#c0392b` on `#0f0f0f` | 3.52 | fails for body text |
| light theme: tertiary `#7a7570` on `#f5f2ee` | 4.09 | fails |
| light theme: ghost `#c4bfb8` on `#f5f2ee` | 1.64 | fails for text |
| light theme: gold `#8a6e50` on `#f5f2ee` | 4.25 | fails for small text |

The light theme also lacks `--green` and `--red`, so a light page falls back to the dark values.

### Proposal

**Type.** Inter for text, JetBrains Mono with tabular figures for every measured value (so columns of bps and dollars align), Playfair Display only for the landing hero and the large grade letter. One scale of six steps: 12, 14, 16, 20, 28, 40 px, with line heights 1.5 for text and 1.2 for display. Labels become sentence case at 12 px with normal letter spacing; today's wide-spaced uppercase mono labels (0.28em) are hard to read in long lists and are kept only for the grade caption.

**Colour.** Semantic tokens, not raw hex: `surface` (base, raised, overlay), `text` (primary, secondary, tertiary; ghost is for borders and decoration only, never for words), `accent` (gold, with a text-safe variant of at least 4.5), `border`, and four **status** colours that never mean "good or bad money": `info`, `caution`, `error`, and `measured` (a calm accent for "this is a measurement"). A cost is not red and a saving is not green: the product audits the past and does not rate it (the heatmap's good/bad scale is the first thing to replace with a single-hue scale of the measured value). Grades A to F keep their own small set, because the letter is the one place a verdict is allowed, and they stay in one file (`gradeColor.ts`). Every pair in the table above that fails is replaced by a pair that passes, in both themes, and a test computes the ratios from the tokens so a regression fails CI. Light theme: Deepanshu decides whether it ships (question 3).

**Spacing and layout.** A 4 px base unit with steps 4, 8, 12, 16, 24, 32, 48, 64. One content width per page type: reading (68 characters, methodology, legal), app (1,200 px, dashboard, trades), narrow (480 px, auth). Radii 2, 4, 8 (cards today use 3 px). Panels are separated by space first and by a 1 px border second, never by shadows.

**Components** (built on Tailwind 4 theme variables; `components.json` for shadcn is already in the repo, so primitives can be pulled in on demand, with each one restyled to these tokens):

| Component | Notes |
|---|---|
| Panel | Title, optional one-line "what this measures", body, optional "how this was measured" disclosure (version, data source, lineage) |
| StatBlock | Value in mono, unit, optional interval, a provenance chip; one of the three value states below |
| ValueState | The one component that renders measured, not computed and insufficient data (next section) |
| GradeBadge | Letter, number, scoring version, and the words "rule-based" (v1) or "measured" (v2) |
| ProvenanceChip | `synthetic-demo` or `real-user`, set once, read from the stored `dataSource`; a demo is never visually mistakable for a real account |
| DataTable | Sticky header, tabular figures right-aligned, sortable, a phone layout that keeps the first and the most important column, "not computed" cells via ValueState |
| Banner | Stale data ("Data last synced 3 days ago"), refused key, demo is read-only |
| Disclosure | For method, lineage and the claim "numbers come from code" |
| Button, Field, Tabs, Toast, EmptyState | Standard; the destructive button has its own style and a confirm step |
| ChartFrame | A recharts wrapper: single-hue scales, direct labels, a table alternative for each chart, no colour as the only carrier of meaning |

**Measured, not computed, insufficient data.** These are three different facts and must look different, in every panel, from one component.

| State | Meaning | How it looks | Text pattern | Never |
|---|---|---|---|---|
| Measured | A deterministic number from stored measurements | Value in mono and primary text colour; unit; interval or sample size beside it in secondary text; provenance chip; "how measured" link | `12.4 bps` , `n = 24` | Coloured as good or bad; shown without its sample size when one exists |
| Not computed for this data | The view does not exist for this account's data (for example the v1 views of a rebuilt demo) | A quiet outline panel with a dash where the value goes; no number slot, no chart skeleton | `not computed for this data` plus one line saying why | A zero; a blank that reads as zero; an empty chart |
| Insufficient data | It could be computed in principle, but the sample is too small or the market data was unavailable | The same panel with the value slot reading "insufficient data", and a progress line of what is missing | `insufficient data: 7 market orders had a usable expected cost; at least 20 are needed` | A guess; a rounded estimate; a grey number |

All three carry an accessible name that says the state in words, and none is conveyed by colour alone. The strings already exist (`notComputed.ts`, `costVsExpected`, `NOT_COMPUTED`); the work is one component that owns them.

**Copy and content rules built into the components.** Past tense in headings and notes; the words "could save", "should", "route to", "because", "due to" are blocked by the existing advice and claim tests (`adviceCopy.test.ts`, `heatmapCopy.test.ts`); Council text sits in a clearly separated "Explanation (language model; every number was checked against the audit)" block, so a reader can tell explanation from measurement.

**How M8 would be built** (after approval): tokens first (CSS variables, the contrast test), then ValueState, Panel, StatBlock and DataTable, then the dashboard (the largest, the one that shows the product), then the rest in the order of the table above. Each screen keeps its existing tests and e2e specs green; no API route changes.

## 3. The M8 notes

### The 50 lint warnings

0 errors, 50 warnings, all left on purpose in M6 because they need a change of structure in the screens M8 redesigns (`npm run lint`, 2026-11-19).

| Rule | Count | What it is |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | 11 | `any` in the dashboard, trades and Council components: replace with the API response types |
| `@next/next/no-location-assign-relative-destination` | 10 | `window.location.href = '/...'`: use the router |
| `react-hooks/static-components` | 10 | components defined inside components: move them out (a natural result of the new component set) |
| `react-hooks/set-state-in-effect` | 8 | state set inside effects: derive it or move it to the data layer |
| `react-hooks/exhaustive-deps` | 7 | effect dependency lists |
| `react-hooks/immutability` | 4 | values changed after render |

By file: trades 18 (all 10 `static-components` warnings are here), dashboard 11 (6 of the `any` types), Council 5 (3 `any`), landing 4, then one or two in each of eight other files. Target: 0 warnings at the end of M8, and the lint step stays at 0 errors.

### The evidence-pack download button

There is no button. The route exists (`GET /api/evidence/pack?kind=scorecard|best-execution`, signed with Ed25519, 503 until the signing key is set, which Deepanshu did on 2026-11-18) and an analytics event name `evidence_pack_download` is already defined in `app/lib/track.ts`, but nothing in `frontend/app` calls the route. Proposal: two buttons in a "Evidence" panel on the dashboard and on settings: "Download scorecard pack" and "Download best-execution pack". Because the route needs the access token, the button fetches with the token and saves the response as a file (the way the report download already does). The text under the best-execution button reads "supports your documentation" and never "compliant". Next to the buttons: a link to `/verify` and the public key fingerprint (`ba11aa53c4961be4`). The files are about 1 MB, so the button shows progress, and an error state exists for the 503 case. Demo accounts get no pack (they are read-only and synthetic); the button explains that instead of failing.

### Renaming "Alpha Architect"

The name suggests a search for alpha (trading edge), which FillScore never does: the agent audits benchmark-relative execution quality of past trades (`ml-service/agents/alpha_architect.py`, "benchmark-relative execution quality"). The name appears in three kinds of places, and they behave differently:

1. **Display strings** (`AgentCouncil.tsx` lines 54 and 61: the label and glyph): safe to change in M8.
2. **Stored keys and schema** (`alpha_architect`, `alpha`, `alphaRating` in the API output, the recordings, the golden sets and the tests): **must not change.** Recorded LLM output is never edited, and the offline evaluation reads these keys.
3. **The agent's system prompt** ("You are FillScore's Alpha Architect agent"): changing it changes `PROMPT_VERSION`, which would orphan every recording and demo run made under 1.7.0. Leave it until the next planned re-record.

So the rename in M8 is a **display label only**. Candidate names, for Deepanshu to choose: "Benchmark Reviewer" (my pick: it says what the agent reads), "Execution Benchmark", "Alternatives Reviewer". The `alphaRating` value (POSITIVE, NEUTRAL, NEGATIVE) is shown today as a rating of the trader; the design should show it as "versus the benchmark" with the benchmark named.

### "Left, on purpose" items of M9 (`docs/milestones/M9.md`, claims audit)

1. **The dashboard venue sentence** ("Fills on X cost ~N bps less slippage than on Y in this period"). It is a past-tense, period-scoped statement from the v1 data and stayed. For M8: show it with its sample size per venue and the period beside it, in the Measured state, and never as a recommendation; for rebuilt demos and one-venue accounts it already says so.
2. **The "Alpha Architect" name**, above.

Also carried into M8 from M9 and earlier work: the landing page shows only the frozen v1 letters of the demos next to a dashboard that leads with v2 (section 1); the Council's Quick or Deep budget needs a visual form; and the explain panel (`ExplainPanel.tsx`) was written minimal in M4 and is redesigned here.

## 4. What M8 would deliver

A token file and a contrast test; the component set above; the dashboard rebuilt around one headline finding and the supporting panels; every "no number" case rendered by ValueState; the evidence-pack buttons; the display rename; 0 lint warnings; a screenshot set of each screen in both themes (if the light theme ships) at three widths; and an updated `ARCHITECTURE.md` §4.

## 5. Questions for Deepanshu

1. **Direction.** Keep the warm dark theme with the gold accent and refine it (my proposal), or start a new visual direction?
2. **Fonts.** Keep Playfair Display for the hero and the grade letter, or drop it and use two families only?
3. **Light theme.** Ship it (it needs its tokens finished and tested) or remove it for now?
4. **Dashboard order.** Is the headline finding "the v2 grade and the dollar cost" with the v1 grade as a labelled secondary item (my proposal), or do you want both grades equal?
5. **Council name.** Which of "Benchmark Reviewer", "Execution Benchmark", "Alternatives Reviewer", or another?
6. **Evidence panel.** On the dashboard and settings both, or settings only?
7. **Order of work.** Dashboard first (my proposal), or the landing page first because visitors see it first?
8. **Screens to cut or merge.** `/check` could live only as the dashboard panel; the five auth pages could share one layout. Agreed?

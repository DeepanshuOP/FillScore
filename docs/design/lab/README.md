# M8 phase 2a: the design lab

Built 2026-11-19. Read this first; the screenshots are in this folder. The lab is the route `/design-lab` (four pages). It answers 404 in production, it is not in any sitemap, and it asks search engines not to index it. **No production screen was changed.** Two production stylesheet lines were touched (see "Changes outside the lab").

**Decided by Deepanshu, 2026-11-20: direction A "Audit report" (light) with IBM Plex Sans; IBM Plex Mono only for hashes, ids and the key fingerprint.** The production tokens are `frontend/app/ui/tokens.css` (A only, no toggle); B and the other font candidates stay in the lab (`frontend/app/design-lab/lab-tokens.css` and the lab layout). Phase 2b part 1 is in `docs/design/2b-1/README.md`. What follows is the phase 2a record, as written.

Was waiting for Deepanshu: **pick direction A or B, and the font.** Everything below is what was needed to choose.

## What was built

| Part | Where |
|---|---|
| Tokens of A "Audit report" (light) and B "Tape" (dark), CSS variables and Tailwind theme (`bg-ui-surface`, `text-ui-ink`, ...) | `frontend/app/ui/tokens.css` |
| Components: Panel, StatBlock, ValueState, GradeBadge, ProvenanceChip, DataTable, Banner, Disclosure, Button (with destructive confirm), Field, Tabs, Toast, EmptyState, ChartFrame (with `BarList`) | `frontend/app/ui/` |
| Motion module: duration and easing tokens, reduced-motion wrapper over `gsap.matchMedia`, `flipChange` for tables | `frontend/app/lib/motion.ts` |
| Hero prototype "one order, measured" | `frontend/app/design-lab/hero/` |
| Mock of the dashboard headline row, cost ledger, cost against expected and the evidence panel | `frontend/app/design-lab/dashboard/` |
| Component gallery, type specimens | `frontend/app/design-lab/page.tsx`, `fonts/` |
| Data: one real demo order (replay JSON as `buildOrderReplay` returns it, real public prints, the production mid function) and demo-moderate's totals | `frontend/app/design-lab/fixtures/`, cut by `ml-service/scripts/cut_hero_fixture.py` and `cut_lab_fixture.py`; `backend/src/__tests__/heroFixture.test.ts` keeps the replay equal to the builder's output |

Run it: `cd frontend && npm run build && npm run test:lab` (starts the server with `DESIGN_LAB=1`, runs axe and the behaviour checks). Screenshots: `LAB_SHOTS=<dir> npm run test:lab`. To look: `DESIGN_LAB=1 npm run start`, then `/design-lab?theme=a|b&font=plex|hanken|schibsted`.

## Screenshots (23 PNGs)

- `components-{a,b}-{390,834,1440}.png`: the gallery in both directions at three widths.
- `dashboard-{a,b}-{390,834,1440}.png`: the dashboard headline and evidence panel.
- `hero-{a,b}-{start,middle,end}-1440.png`: the hero frozen at progress 0, 0.5 and 1; `hero-{a,b}-end-390.png`: the phone layout; `hero-a-reduced-motion-1440.png`: what a visitor with reduced motion sees (the end frame at once, no controls).
- `fonts-{a,b}-1440.png`: the type specimens (the digit widths are measured in the browser).

## Fonts (question 2): measured, not assumed

Playfair Display and Inter are dropped from the lab. Three OFL sans families were set against the real headline, real per-symbol figures and the real key fingerprint; IBM Plex Mono sets only the fingerprint, hashes and ids. The specimen page measures, in the browser, the spread of the ten digit widths at 28 px with tabular figures on:

| Family | Spread with tabular figures | Verdict | Proposed |
|---|---|---|---|
| IBM Plex Sans | 0.00 px (its default figures are already equal width) | true tabular | **A** (second choice for B) |
| Hanken Grotesk | 0.00 px (default figures already equal width) | true tabular | **B** (second choice for A) |
| Schibsted Grotesk | 1.00 px (7.00 px without the feature) | **not truly tabular**; its punctuation also goes wide under tabular figures ("$52 . 08") | neither |

So the order's example family Schibsted Grotesk fails the "true tabular figures" test and is shown only for comparison. Licences (SIL OFL 1.1) were read in `github.com/google/fonts`; see `THIRD_PARTY_LICENSES.md`.

## Tokens: where the given colours needed help

The given colours were used as given. Contrast, computed from `tokens.css` by `app/ui/contrast.test.ts` (it fails CI):

- A: ink 14.94, graphite 5.78, audit blue 6.97 on ledger; **ochre `#A86F12` is 3.91:1 on ledger, which passes for a mark (3:1) and fails as text (4.5:1)**. Added `--ui-insufficient-text #8A5A0B` (5.46:1) for the words "insufficient data"; ochre stays for the diamond and the dashed line.
- B: ink 13.17, graphite 6.20, signal 8.04, amber 7.13 on slate; all pass as text.
- `rule` (A 1.28:1, B 1.57:1) is a separator only. Added `--ui-edge` (A `#7A828B` 3.59:1, B `#737D87` 3.83:1) for the borders of controls, and `--ui-danger` (A `#A3261F`, B `#F0857D`).
- Charts: a mark is never paler than 65% of the measured colour (a test mixes it in sRGB; 3.2:1 or better in both directions on both surfaces; at 40% it had been 1.94:1).
- Grade chips keep `gradeColor.ts`; the letter on them is near-black or white, whichever reads better (5.02:1 on the F red, the weakest).
- The measured colour paints no control: the primary button is ink on surface. Blue (A) and cyan (B) mean "this is a measured value" and nothing else.

Totals of the test run: 31 contrast tests, 0 failing.

## The three value states (one component, `ValueState`)

| State | Marker | Line | Words |
|---|---|---|---|
| Measured | solid square | solid underline | the figure, then its sample size and interval |
| Insufficient data | hollow diamond | dashed underline | "insufficient data" and what is missing ("7 market orders had a usable expected cost; at least 20 are needed") |
| Not computed | dash | dotted box | "not computed for this data" and one line of why |

A test asserts that the three differ in marker, line and words, and that each has an accessible name that says the state. The states in the gallery are examples of the component, labelled as such; the dashboard mock shows only values from the fixture.

## Motion

GSAP 3.15.1 and `@gsap/react` 2.1.2, pinned. Client components only, through `useGSAP`; one module (`app/lib/motion.ts`). Tests enforce: UI durations are 0.15 to 0.3 s and ease out; with `prefers-reduced-motion: reduce` the animation callback never runs and the final state stays; every importer of gsap is a client component; no tween of text, `snap` or count-up; no scroll-jacking, no ScrollSmoother. Flip moves table rows on sort, filter and expand; the disclosure opens in 0.3 s; the destructive button and the toast answer a click. **Plugins:** only Flip is used; ScrollTrigger and SplitText are not loaded anywhere (the hero needs neither), so there is nothing to dynamic-import yet.

The hero lasts 7.4 s (test: at most 8 s), has a skip button and a play-again button, and ends on the frame the page shows without script (a test runs the timeline to the end and checks every element is visible and every line drawn). Its figures come from the replay data of the order; a test pins the formatted values (hand-computed in the test).

**GSAP licence: not verified.** The package names "Standard 'no charge' license" and the repository README says GSAP and its plugins are free, including commercial use. The licence page itself could not be read (the site showed a "Forums Temporarily Offline" notice). I did not reconstruct its terms. Read https://gsap.com/standard-license once before any production screen ships GSAP; details in `THIRD_PARTY_LICENSES.md`. Nothing of GSAP reaches production users until then (the lab 404s there).

## First Load JS (gzip kB), before and after

Next 16 prints no size table, so `frontend/scripts/first-load-js.mjs` computes it from the build (method in the file header; it is an estimate of what Next 15 printed, the same script before and after). Before = the build before any change of this phase; after = the build with the lab.

| Route | Before | After | Change |
|---|---|---|---|
| `/dashboard` | 390.2 | 390.4 | +0.2 (budget: at most +30) |
| `/` | 259.4 | 259.4 | 0 |
| `/analytics` | 373.7 | 373.7 | 0 |
| `/trades` | 261.2 | 261.2 | 0 |
| `/check` | 254.5 | 254.6 | +0.1 |
| `/settings` | 254.9 | 254.9 | 0 |
| `/design-lab` (new) | n/a | 304.5 | the lab only |
| `/design-lab/hero` (new) | n/a | 304.4 | the lab only |

The other routes moved by at most 0.2 kB (hash noise). The cost of GSAP for a real screen will be measured when a production screen uses it (phase 2b); the lab pages are about 54 kB gzip above a plain page (304.5 against 250.8) for GSAP, Flip, lucide icons, the components and the page code.

## Accessibility and tests

- axe (`@axe-core/playwright` 4.14.0, tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa): **0 serious or critical violations** on all four pages, both directions, at 390 and 1440 px (16 scans; the lab spec has 44 tests in all, 44 passed after the review fixes).
- Behaviour in the browser: reduced motion renders the final frame with no controls; the hero plays, skips and ends static; the lab serves 200 with the footer hidden; tabular-figure measurement (table above).
- e2e (production build, no `DESIGN_LAB`): `/design-lab` and its three sub-pages answer 404.
- Frontend unit tests: 52 files and 387 tests before this phase, 61 files and 480 tests now; `tsc` 0; lint 0 errors and the same 50 warnings as before (none added); e2e 35 passed (29 before).

## Findings of this phase (read these)

1. **`globals.css` has unlayered rules that beat Tailwind utilities.** The reset `* { margin: 0; padding: 0 }` beats every spacing utility (probably why the product screens are inline-styled), and `input::placeholder { color: var(--text-ghost) }` beat the placeholder colour. The reset is lifted under `[data-ui-theme]` (see below) and the placeholder is overridden in `tokens.css`. Phase 2b should remove both when the first production screen moves to the system.
2. **GSAP licence unread** (above).
3. **Schibsted Grotesk is not truly tabular** (above).
4. **The recorded `demo-moderate` Council run shows "Unfilled Opportunity Cost Assessed"** (an alpha flag the model emitted, shown by the card). "Opportunity" is on the product's counterfactual-word list. The old e2e spec ran on `demo-disciplined` and never saw it. The spec now runs on `demo-moderate` with exactly that string exempted and an assertion that it is present, so the exemption must be deleted when the run is re-recorded. Waiting item 27 in PROGRESS.
5. The existing costVsExpected line uses a hyphen for a negative value ("-0.09 bps") while the lab's ValueState uses a real minus sign. The lab reuses the production sentence as it is; phase 2b should move the dashboard to `formatSignedBps`.

## Independent review of the screenshots, and what was done

An independent reviewer (fresh context, no write access) read all 23 screenshots against the design rules. It found no break of the bans (no eyebrows, no arrows, no gradient washes, no accented one-word headlines, mono only on the fingerprint and the hash). Its 11 findings, each checked against the code or the browser before acting:

| # | Finding | Result |
|---|---|---|
| 1 high | The headline total carried the "measured" marker, but about 80% of it is a demo's fees at the published rate | **Fixed.** The total has no marker; the measured part ($10.10) is its own marked figure; the fees ($41.98) are named "not independently measured"; the fee bar is a dashed outline, not the measured colour. Tests: `BarList` unit test, lab spec on the headline |
| 2 high | Phone hero text about 8 to 9 px; the dashed line cut "Filled at"; brackets lost their dollar figures | **Fixed.** Phone drawn in a 360 px box (type 12 and 13 px), a halo in the ground colour behind every label, brackets show bps and dollars, two clipped labels moved in |
| 3 medium | Reference lines at 313.30 and 313.25 unnamed | **Fixed.** Each bracket now states the price range it spans (313.25 to 313.30; 313.30 to 313.40), computed from the data |
| 4 medium | The fill diamond covers a tape dot; "Mid when placed" sat on a gridline | **Dot: kept**, it is the fill's own print, which the demo fill walks (the diamond marks that print). **Gridline: fixed** by the halo |
| 5 medium | Start frame looks empty; no skip button in the stills; "real demo order" collides with "synthetic" | **Fixed:** controls now show in the frozen frames, copy reads "one synthetic demo order on real public prices". The empty start frame is the real state at progress 0 |
| 6 medium | Placeholder looks faint in B | **Confirmed by test and fixed.** A production rule (`input::placeholder { color: var(--text-ghost) }`, 2.55:1) beat the utility class; the lab tokens now override it (graphite, opacity 1); a browser test checks the computed colour in both directions |
| 7 medium | Two competing focal points; one number marked, one not; hyphen and true minus mixed | **Fixed** by the new headline (item 1); the production sentence's hyphens are shown as true minus signs in the lab. The production sentence itself is long; it is reused as it is (copy changes belong to phase 2b) |
| 8 low | Unlabelled ruler ticks; fees segment near 3:1 | **Fixed:** only the two labelled ends remain; the paleness floor is tested at 3.2:1 or better |
| 9 low | Gallery grades read as examples beside the locked grades | **Fixed:** the section says they are the real demo grades; the chip colour is the grade's own (`gradeColor.ts`) |
| 10 low | Schibsted Grotesk punctuation breaks in the specimen | **Kept and explained on the page:** it is the tabular feature widening punctuation; the family fails the digit measurement anyway |
| 11 low | Reduced-motion frame showed a stray vertical line | **Fixed, a real bug:** the sweep hairline was visible when nothing hid it; it now starts hidden. A browser test checks the reduced-motion frame |

## Changes outside the lab

- `frontend/app/globals.css`: one `@import "./ui/tokens.css"` (matches nothing without a `data-ui-theme` ancestor) and the reset rule scoped with `:where(:not([data-ui-theme], [data-ui-theme] *))`, which gives every non-lab element exactly the rule it had.
- `frontend/vitest.config.ts`: excludes `e2e-lab/**`.
- `frontend/e2e/council-demo.spec.ts`: see finding 4, and the two refused-demo tests of item 2(d).
- `ml-service` and `backend`: two cutter scripts, one backend test (the fixture check). No production code.

# Design v3.1 "Quiet audit": plan

Order of 2026-11-21 (second). Design v3 "Tape & Receipt" stays (DESIGN.md: tokens, fonts, objects, the pen rule, the
number rule). v3.1 removes the overload: too much text and too many small captions at once. Research:
`docs/design/REFERENCES-v31.md`. This plan covers the landing page, the overview and the receipt-opening flow; the other
screens follow later with the same rules.

## Measured starting point (before)

`frontend/e2e-shots/words.ts` on the production build of commit `425b03d`, demo-moderate fixtures, reduced motion
(the finished frame), whole page. A word is a token with a letter; figures are counted apart.

| Screen | Words 1440 | Words 390 | Type sizes on the screen (1440) |
|---|---|---|---|
| Landing (main) | 381 | 358 | 18 |
| Overview (view body) | 378 | 377 | 15 |
| Receipt (dialog) | 113 | 113 | 8 |

Targets: landing at most 190 words (half), overview at most 190, receipt at most 80 with the notes folded; at most 6
type sizes on the overview and the landing page, 5 on the receipt.

## Rules

1. **One idea per viewport.** Each section has one visual, one sentence and at most ~25 visible words (the quiet award
   sites hold 14 to 40 words per viewport; the loud ones 188 to 436). Everything else is behind disclosure.
2. **A chapter marker, not a heading.** Each overview chapter opens with a printed rail label in Departure Mono
   (`01 TOTAL`, `02 GRADE`, `03 WHERE IT WENT`, `04 THE MONTH`, `05 AGAINST EXPECTED`) in the left rail on a desktop,
   above the chapter on a phone (Grail, Atalanta, Osmo's bracketed label). The accessible heading stays (an `h2` that
   reads the same words in sentence case).
3. **Pen margin notes.** An explanation becomes a margin note: a small pen mark (a hand-drawn loop with a dot, in
   pen-ink so it passes 4.5:1 and the pen rule holds) right after the value it explains. It is a real `button`
   (accessible name "Note: <what it explains>").
   - Desktop (`(hover: hover) and (pointer: fine)`): Radix Popover, opened on pointer hover after 250 ms (instantly
     within 400 ms of another note closing, Base UI's warm window), on keyboard focus, and on click; it closes 150 ms
     after the pointer leaves both the mark and the note, on blur out of both, and on Escape (focus returns to the mark).
   - Touch (coarse pointer): a tap opens the note in a Vaul bottom sheet with a Close button.
   - The note is printed paper (receipt white, 14 px Cabinet Grotesk, at most 60 words), entering in 160 ms
     (opacity + 4 px, ease-out, origin at the mark) and leaving in 110 ms; reduced motion: opacity only.
   - **Nothing that guards an invariant is hidden:** the synthetic line, "insufficient data" / "not computed"
     (ValueState, with its reason printed), NOT SIGNED, "not independently measured" (the dashed segment says it in
     words), and the past-tense findings stay visible. Field paths, model versions, intervals' method, band, rule-based
     v1 details, instructions ("use the arrow keys") go into notes.
4. **Mono only for figures and printed objects** (tape, receipt, stamp, rail labels, the spec table of facts). Captions
   and sentences are Cabinet Grotesk. Per screen at most 6 sizes: display (the giant figure), display-md (chapter
   figure), 20 px (the sentence), 16 px (body), 13 px (printed label, note), 11 px (sprocket/tape digits only).
5. **Motion budget** (Emil's frequency rule; REFERENCES-v31 "Libraries"):
   - Rich motion only on the landing page and on the **first entry** to each overview chapter (once per session per
     account, `sessionStorage`): the stamp press, the strip tearing, the pen circle, the ruler bracket.
   - None on tables, tabs, filters, the All/Market/Limit switch, the ⌘K palette, sorting, pagination.
   - UI transitions 150 to 300 ms, exits faster than entries; ease-out `cubic-bezier(.23,1,.32,1)` (GSAP: CustomEase
     `fs-out`), drawer `cubic-bezier(.32,.72,0,1)` (`fs-drawer`).
   - Reduced motion and no JavaScript show the finished frame; nothing travels (DESIGN.md invariant 6).
   - Numbers never animate except NumberFlow after a user action (unchanged). No ticker, odometer or scramble.
6. **Words.** Plain names everywhere, never field paths: "Spread", "Impact and timing", "Unfilled orders", "Fees".
   A field path, when shown at all, is the last line of a margin note ("Field: shortfall.feesBps").
7. **Values come from the server.** A new visual that needs a value (a share, a position) gets it from the API with a
   hand-computed test; the browser only places it.

## Text inventory and decision

K = keep, S = shorten (new words given), N = move to a margin note, D = delete.

### Landing page (`app/page.tsx`, `components/marketing/*`)

| Block (current words) | Decision |
|---|---|
| Hero h1 "Every fill, held to the tape." | K |
| Hero lede (33 words) | S: "FillScore holds each fill against the exchange's public prints and writes down what it cost. It grades the past; it never advises." (22) |
| Hero buttons "Open the demo audit", "Check a signed pack" | K |
| Hero proof line (30 words: symbol, date, window, prints, sha) | N, on a pen mark after "public prints" in the lede: the same sentence, the SHA |
| Hero cost list SPREAD / IMPACT AND TIMING / FEES / SYNTHETIC TRADER, REAL PRICES (phone) | K (printed labels) |
| Tape notes (Spread, Impact and timing, Fees with $ and bps) | K (they are the hero's point) |
| Story end label "THE ORDER ABOVE, IN TOTAL" | S: "IN TOTAL" |
| Story end $0.25 + "10.0 bps; fees were 99.99% of it" | K |
| Story end paragraph (34 words) | D (the three amounts are on the tape; the synthetic line moves under the figure as one slim printed line "SYNTHETIC TRADER, REAL PRICES") |
| (new) Pinned horizontal chapter, three objects | "What we read." tape: "Every public print of the seconds you traded." / "What it cost." receipt: "Each order, in dollars: spread, impact, fees." / "The grade." stamp: "One letter for the month, stamped once." (about 30 words with titles) |
| Demo heading "Open a finished audit." | K |
| Demo lede (22 words) | S: "Three synthetic traders, real January 2024 prices." (7) |
| Demo receipts: name, SYNTHETIC TRADER, REAL PRICES, stamp, TOTAL, n ORDERS, "Open the audit" | K (printed object; the synthetic line is an invariant) |
| Check heading "Check it yourself." | K |
| Check paragraph (31 words) | S: "Every audit can ship as a signed pack of SHA-256 hashes. Check one in your browser." (16) |
| Check links: 3 titles + 3 descriptions (25 words) | S: one link "Verify a pack"; "Read the method" and "fillscore-metrics" stay as two plain links without descriptions (descriptions D) |
| Envelope manifest text | K (printed object) |
| "Never" statement (19 words) | K (it states the product's legal line) |
| CTA heading "See what your own orders cost." | K |
| CTA paragraph (12 words) | S: "Read-only keys only; anything more is refused." (7) |
| CTA buttons | K |

### Overview (`app/dashboard/Overview.tsx`, `MonthTape.tsx`, the demo banner in `page.tsx`)

| Block | Decision |
|---|---|
| Demo banner: title + DEMO_NOTE (35 words) + "Connect your exchange" | S: one slim printed line under the top bar, always visible: "SYNTHETIC TRADER, REAL PRICES" + a margin note holding DEMO_NOTE verbatim + the link "Connect your exchange" |
| Label "What the orders paid, January 2024" | S: rail label `01 TOTAL` (the period is in the top bar) |
| Giant figure | K |
| "The 245 orders paid $52.08 in total." | K |
| "The total is 11.7 bps of the value ordered." | N on the figure's sentence |
| Unmeasured-orders note (only when > 0) | K, shortened by its existing function (guards "not measured") |
| Measured $10.10 / Fees at the published rate $41.98 + "not independently measured: generated for the synthetic trader" | moved to chapter 3 |
| Grade stamp | K, rail `02 GRADE`; the press plays on first entry |
| "Measured score, scoring v2.3.0; band 92.5 to 94.1." | N on the stamp |
| Rule-based v1 badge + "Kept unchanged..." note | S: one visible line "Rule-based grade (v1): B" + a margin note with the badge's text and the note (the frozen v1 line) |
| Tape heading "January 2024, order by order" + caption (31 words) | S: rail `04 THE MONTH`, one sentence "Each mark is one order; its height is what it cost." (11) + note: height rule, improvement below the line, keys |
| Tape hover preview (6 lines) | K (it is the lens, printed) |
| Cost receipt title "Where the $52.08 went" + subtitle (12) | S: rail `03 WHERE IT WENT`, the strip with two labelled segments; sentence: "Fees were $41.98 of the $52.08." built from the server's figures (8) |
| All / Market / Limit switch, term table, medians, footnotes | N-fold: a printed "LINES" fold under the strip (closed by default) holds the switch, the table, the star footnote and the medians unchanged (design v3 fixes B2 is kept) |
| Cost against expected: title, description (14), PAID/EXPECTED/DIFFERENCE, ruler, sentence (~25), model caveat (24) | S: rail `05 AGAINST EXPECTED`, the ruler, one sentence "Market orders paid X bps against Y bps expected." (from the server's paid and expected), the rest (interval, n, model version, caveat, left-out counts) N; the insufficient state stays visible with its reason |
| Order outcomes: title, description, count, fills line, tally, list, resting, unfilled note | S: tally marks with each group's word and count printed under it ("230 filled", "11 unfilled"); fills line, resting times and the unfilled note N |
| Footer facts (Period, Venue, Fills, Value traded, Maker share, DATA) | K as one A24-style spec table at the end, mono, hairline rows |
| Freshness (real accounts) | K |

### Receipt (`app/dashboard/OrderReplay.tsx`, `receiptCopy.ts`)

| Block | Decision |
|---|---|
| FillScore / AUDIT RECEIPT / provenance line | K |
| ORDER, MARKET, PLACED, STATUS | K |
| FILLS lines | K |
| "Fills only; the public prints are in the source file." | moved into NOTES |
| COSTS lines, total | K (the cost line's `title="Source field: ..."` stays as a tooltip) |
| Expected-cost line | moved into NOTES (an insufficient-data reason too: the fold's closed label says "NOTES (3)", and the NOT COMPUTED total is never folded) |
| Replay notes | moved into NOTES |
| SOURCE lines with SHA-256 | moved into NOTES |
| Bars + SHA-256 + "not a scannable code" | the bars stay as the receipt's foot; the hex and the sentence move into NOTES |
| SIGNED / NOT SIGNED stamp, Copy order id | K |

## Screens

### Overview: five chapters
1. **The total.** The giant figure, graphite cents, one sentence; the synthetic line slim and always visible.
2. **The grade.** The stamp presses once on first entry: scale 1.6 to 1, rotate -2° to -7°, opacity 0 to 1, 420 ms
   `fs-out`; the double border draws with DrawSVG (two SVG rects as paths, 360 ms, starting 120 ms in); the ink texture
   stays the existing mask. Margin note: scoring version and band. Visible line: "Rule-based grade (v1): B" with its
   note (frozen).
3. **Where the money went.** A torn receipt strip (receipt white, torn ends) with one segment per positive cost part:
   "Measured against market prices" and "Fees"; widths are the server's shares (`strip` on `/audit/orders-summary`,
   new, hand-computed test). Fees not independently measured: dashed outline and hatching, the words "not
   independently measured" printed in the segment's label, and a margin note. A price improvement larger than the costs
   is printed as its own line, never as a negative width. The "LINES" fold opens the full term table.
4. **The month.** The tape is draggable sideways (GSAP Draggable + InertiaPlugin, `type: "x"`, bounds, edge resistance
   0.85, snap to the nearest bar on release) when the bars are denser than 4 px each, at 2x width on a phone; arrow keys
   move the active bar and scroll it into view (no animation on keys). A lens: under the pointer the active bar's
   neighbourhood is drawn at 3x in a round loupe above the tape (rebuilt, not Aceternity's DOM copy; hidden under
   reduced motion, where the plain preview shows). The largest order is circled by the pen with its amount written
   beside it in pen-ink (DrawSVG on first entry). A click (or Enter) on a bar opens the receipt in place with Flip.
5. **Against expected.** The ruler (existing `CostRuler`) with the pen bracket drawn once on first entry; one sentence;
   the rest in a margin note. Outcomes as tally marks.

### Receipt flow
- Opening from the ledger (Orders) or the tape (Overview) uses the same shared-element transition: a stand-in slip
  (receipt white, torn bottom) starts at the clicked bar's or row's rectangle and grows to the receipt's rectangle in
  300 ms (`fs-drawer`), then the real receipt shows and the stand-in fades in 120 ms. Measured with
  `getBoundingClientRect` and driven by `Flip.fit` (the docs do not cover portals, REFERENCES-v31). Reduced motion:
  plain open. Closing: the receipt tears back in 220 ms as today (exit faster than entry).
- The footnotes fold into a printed "NOTES" fold at the foot (a `button` with `aria-expanded`, closed by default).
- First open in a session only: a print-feed motion (the paper advances in three 40 ms steps, then settles; 360 ms
  total); later opens use the plain 300 ms print. Session key `fs-receipt-fed`.

### Landing page
Hero and the giant $0.25 stay. Then:
1. A pinned horizontal chapter: three printed objects (tape, receipt, stamp) in a row that moves left as the page
   scrolls (one `ease: "none"` tween driven by the pinned trigger, snapped to the three objects), each with a masked
   SplitText title and one sentence; a printed counter "1 OF 3".
2. The three demo receipts (heading with a masked line reveal).
3. "Check it yourself" as the envelope.
4. The "never" statement and the closing call to action.
Lenis and GSAP stay lazy-loaded (dynamic import in `components/marketing`, `motion.test.ts`). On a phone the horizontal
chapter becomes a vertical stack (no pin).

## What the QA checks (step 6)
qa3 states at 1440 and 390 (landing hero start, each chapter, story end; overview each chapter; receipt from the tape
and from the ledger; Carbon copy overview and receipt): no overflow, no overlap, axe 0 serious or critical, CLS < 0.05,
keyboard (tape keys, notes by focus, Escape), reduced-motion captures; the review-animations and emil-design-eng
checklists; break-ui; one independent reviewer on the images; word counts after (`words.ts`).

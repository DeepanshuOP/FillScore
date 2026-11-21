# FillScore design system: "Tape & Receipt" (design v3)

Chosen by Deepanshu on 2026-11-20 from two working directions (`docs/design/v3-proposal/README.md`; research in
`docs/design/REFERENCES.md`), with four fixes: a first viewport that holds the headline, the feeding tape and the call to
action, with every pen note tied to its mark; the scroll story ending on the order's total as one giant figure; Carbon
copy as a real, tested theme; and this file. It replaces design v2 "Instrument" (navy, Geist, cards, a gauge). Every UI
file follows this file. Values live in `frontend/app/ui/tokens.css` (contrast-tested by `app/ui/contrast.test.ts`); the
printed objects live in `app/ui/paper.css` and the landing page's in `app/ui/landing.css`.

## 1. Thesis

FillScore holds every fill against the market tape and writes down what it cost. The page is printed paper and ink, and
one hot signal: the fill-orange pen of an auditor. The product's own objects are the design: the ticker tape of public
prints, the thermal receipt of an order, the rubber stamp of a grade, the ledger of orders, the envelope of a signed
pack. Each one explains the method while it decorates. It leaves the category on purpose: crypto is dark and neon; an
audit is light, printed and calm. Carbon copy covers dark rooms.

## 2. Invariants (product rules, not style; never traded for looks)

1. No number written by a language model. Every figure comes from deterministic code and the existing APIs; the landing
   figures come from committed fixtures through `lib/landing/heroData.ts`, tested against the replay.
2. Past tense findings only. No advice, no prediction, no "could save", no "route flow to" (`adviceCopy.test.ts`).
3. Measured, insufficient data and not computed stay distinct through the one `ValueState` component: measured is an ink
   figure with a solid rule and a square; insufficient data is printed words with a dashed ochre rule and a diamond;
   not computed is printed words in a dotted box with a dash. Shape, line and words carry it; colour only repeats it.
4. Demo accounts are always labelled "synthetic trader, real prices" (top bar badge, receipts, demo receipts on the
   landing page, share card, Open Graph image) and are read-only. A demo receipt says NOT SIGNED: demos have no pack.
5. Read-only exchange keys only; a refused key comes back as a returned receipt with the corrections printed.
6. Reduced motion and no JavaScript show the finished frame: the tape at rest on the order, strokes drawn, notes written,
   the giant total written, stamps pressed. Nothing travels. (`html.fs-js`, set by an inline script before paint, is the
   only thing that arms a first frame, and only under `prefers-reduced-motion: no-preference`.)
7. Correlation, never causation: "coincided with", never "caused" or "due to".
8. A value that cannot be measured reads "insufficient data", never a plausible number. A missing cost line on a receipt
   prints NOT COMPUTED, never 0.

## 3. Colour: paper, ink and pen

| Role | Paper (default) | Carbon copy | Use |
|---|---|---|---|
| surface | `#F3F2EE` | `#1C1B19` | the paper (cool printed stock, warm charcoal; never blue-black) |
| raised | `#FBFBF8` | `#262522` | receipt white: receipts, sheets, envelopes, the tape strip |
| overlay | `#EFEDE7` | `#2F2D2A` | menus, hover |
| ink | `#121210` | `#EEECE6` | text and every data mark |
| graphite | `#6B6A66` | `#A6A39B` | secondary text (>= 4.5:1 on all three grounds) |
| rule | `#D8D6CF` | `#36342F` | separators only (< 3:1, never a control border) |
| edge | `#8A8882` | `#7A776F` | control borders (>= 3:1) |
| measured, action | = ink | = ink | data is printed, not coloured; primary buttons are ink pills |
| pen | `#FF4F12` | `#FF5A1F` | strokes: circles, brackets, leaders, underlines, the wordmark's dot, focus on carbon |
| pen-ink | `#C2380A` | `#FF7E4A` | orange text (>= 4.5:1): every value the pen marks, rule names, grade letters on chips |
| stamp | `#DE3F0B` | `#FF6A2E` | the grade stamp's large letter and score (large text, >= 3:1) |
| insufficient | `#8C6510` (text `#7A5608`) | `#D9A441` | the dashed rule and words of "insufficient data" |
| danger | `#A3221A` | `#F2685E` | destructive actions, refusals, FAIL lines |

- **The pen rule.** On paper `#FF4F12` is 2.9:1, under the 3:1 a meaningful mark needs. So on paper an orange mark never
  carries meaning alone: whatever the pen circles, brackets or underlines is also written in pen-ink text beside it, or
  printed in ink nearby. Tested (`contrast.test.ts`, "the pen orange").
- The pen marks what the audit found. It is not a brand colour for buttons, links or backgrounds.
- **Grades are stamped in one ink** whatever the letter: the stamp is the auditor's mark, never a traffic light. Money is
  never coloured good or bad.
- One static paper grain over every page (multiply on paper, screen on carbon), never animated.

## 4. Type

- **Cabinet Grotesk** (Indian Type Foundry, Fontshare; 400, 500, 700, 900) for display, headings, UI and figures.
- **Departure Mono** (Helena Zhang, OFL) is the thermal printer: the tape, receipts, ledger figures, ids, hashes, printed
  labels. Never a paragraph.
- **Tabular figures, measured** in the browser (`/design-lab/v3/specimen`, each digit in its own span at 100 px,
  `tnum` on): Cabinet Grotesk 66.00 px for all ten digits, Departure Mono 63.64 px; both set one width, so both may set
  tables. Clash Grotesk did not (37.1 to 66.2 px) and was ruled out. Body sets `tnum` and `lnum`.
- Scale by weight and size: the period total and the story's $0.25 at display scale in 900 with -0.055em tracking; display
  steps `display-xl` (52 to 152 px), `display-lg` (40 to 76), `display-md` (30 to 44), all 900; section titles 20 to 28 px
  in 700/900; body 16 px / 1.5; captions 13 to 15 px.
- Cabinet Grotesk always tracks negative. **Uppercase and widened tracking belong only to the printer** (Departure Mono
  labels such as `ORDER`, `TOTAL`, `NOTE 1 OF 4`); `rebuiltCopy.test.ts` enforces "font-mono on the same line".
- Stepped decimals: `$52` in ink, `.08` in graphite (`SplitFigure`), the same split while NumberFlow rolls.

## 5. The objects

- **Receipt** (`.fs-receipt`, receipt white, Departure Mono 12.5 px): title in Cabinet Black, `AUDIT RECEIPT`, the
  provenance line, a dashed rule, key/value lines (`ORDER`, `MARKET`, `PLACED`, `STATUS`), sections centred and spaced
  (`FILLS`, `COSTS`), numbered cost lines with dotted leaders and right-aligned bps and USD, a punched perforation
  (`.fs-perf`), the heavy total line (Cabinet Black, 40 px dollars), the expected-cost line or its insufficient-data
  reason, notes, sources with SHA-256, the order record's SHA-256 drawn as bars and labelled "not a scannable code", the
  SIGNED stamp (real accounts only) and a torn bottom edge. On a desktop it prints down out of a slot at the top of the
  screen (Radix Dialog); on a phone it rises as a Vaul drawer with the torn edge on top.
- **Stamp** (`GradeStamp`, `.fs-stamp`): "GRADED / letter score / PERIOD / SCORING version", double border, ink texture
  mask, -7° tilt; it presses in once on first view (oversized and blurred, then flat, 420 ms). Small word stamps
  (`.fs-word-stamp`): SIGNED, VALID, CONSISTENT (dashed, ink), INVALID and RETURNED (danger), NOT ISSUED, NOT ON FILE.
- **Tape** (`.fs-strip` + `.fs-sprockets`): receipt white with sprocket holes punched along both edges. The landing hero's
  tape carries the 38 real prints, the arrival quote and the two fills; the overview's month tape carries one tick per
  order (height = the order's total cost in dollars from the server's ledger; a price improvement hangs below the line); the rankings sit on a tape.
- **Pen** (`app/ui/pen.ts`, seeded, so server and client draw the same stroke): `circlePath`, `bracketPath`,
  `underlinePath`, `leaderPath`; `PenCircle` and `PenBracket` wrap inline content. **A pen note never floats**: each
  note sits beside its mark and is tied to it by a leader.
- **Ledger**: tables open with one ink rule; headers are printed labels; rows are dashed rules; figures in mono. Sections
  of the app are ledger blocks (`panel` = one ink rule above, no card, no radius, no shadow). `sheet` is for the few
  objects that are paper on paper.
- **Envelope** (`.fs-envelope`): a drawn flap, a stamp in the corner, contents in mono. Evidence packs, the drop target
  of /verify, "check it yourself".
- **Slip**: Sonner toasts are printed slips with a torn bottom edge; the ⌘K palette is a sheet of receipt paper.

## 6. Layout

- Full-bleed with a gutter (`--ui-gutter`, 16 to 40 px); app content up to 1440 px. Square corners (4 to 8 px radius at
  most); pill buttons; no shadows except paper lifting off paper.
- App shell: one top bar (wordmark with the orange dot, account switcher, synthetic badge, period in mono, actions,
  "Jump to ⌘K", the Carbon copy toggle, log in/out) and a row of section tabs (Overview, Orders, Rules, Rankings, Council,
  Evidence, then "More": Trades, Analytics, Methodology, Settings). No sidebar. Phones: a Vaul drawer behind "Menu".
- Landing hero: the headline anchored bottom-left at editorial scale, the tape full-bleed across the upper third, the
  lede and call to action bottom-right; on a phone the tape on top, the fee circles centred, the costs printed under it.

## 7. Motion

- UI: 150 to 300 ms, ease-out `cubic-bezier(0.23, 1, 0.32, 1)`; the receipt prints in 560 ms on the drawer curve
  `cubic-bezier(0.32, 0.72, 0, 1)` and tears back in 220 ms. Transform, opacity and clip-path only.
- Landing only: GSAP ScrollTrigger (pinned, scrubbed) with DrawSVG, Lenis owned by `LandingMotion`, all loaded by dynamic
  import, all in `components/marketing` (`motion.test.ts`). The hero tape feeds right to left from frame 0 and eases to
  rest on the order; the pen draws its marks, leaders and notes in order; the giant total is written left to right as
  it scrolls in, then double-underlined.
- **The number rule.** NumberFlow (`Figure`, `SplitFigure`) only after a user action (switching account, period or tab),
  only when its Intl output equals the canonical string, never a count from zero, never a scramble.
- Stamps press once; manifest lines tick once; nothing loops, pulses or shimmers.

## 8. Data

- Single-hue ink scales (`hue.ts`: ink at 100 / 82 / 65% of the paper); never good/bad colours.
- Cost against expected: one ruler of paid minus expected, the expected point at zero (a ring), the paid dot, the pen's
  bracket for the 90% interval with the interval written in pen-ink, n printed; "insufficient data" otherwise.
- Order outcomes as a printed tally, one stroke per order (unfilled strokes in pen, their count in pen-ink).
- Rankings noise-aware: rank 1 first; overlapping intervals share a rank and read "not distinguishable from"; groups
  under 20 orders follow as "too few to tell" with no mark. Every chart has a text or table form.

## 9. Copy

- Past tense, plain words, short sentences. "The 245 orders paid $52.08 in total."
- Printed labels in uppercase mono are the only uppercase. No arrow glyphs on links, no "A · B · C" strings, no
  exclamation marks, no fake testimonials, logos or numbers.
- The LLM block keeps its heading: "Explanation (language model; every number was checked against the audit)"; recorded
  output is shown verbatim (the Council memo's notes and transcript reproduce it).

## 10. Anti-generic list (checked at review)

No navy or blue-black ground; no neon glow; no gradient washes or gradient text; no glassmorphism; no rounded cards with
icon-in-a-square grids; no gauge; no hero-metric strip of four same-weight numbers; no coloured side stripes; no
sparkline standing in for content; no emoji icons; no uppercase tracked eyebrows in the sans; no orange buttons; no
floating annotations.

## 11. Decisions log

- 2026-11-20: direction 1 "Tape & Receipt" chosen over direction 2 "Grid & Highlighter"; replaces design v2
  "Instrument". Fixes 1 to 4 applied. The v2 rules (navy surfaces, cyan measured, blue action, Geist, the aurora, the
  gauge, the bento, "no uppercase anywhere") are deleted.
- 2026-11-21 (design v3 fixes B1): the month tape's ticks are each order's total cost from GET /audit/orders-ledger,
  on one dollar scale with improvements below the line; the next line is superseded.
- (Superseded.) The overview's month tape sizes ticks by order value, not cost: the overview has no per-order cost without fetching
  every replay. The prototype's All/Market/Limit switch is left out: the served summary has no per-type totals.
- 2026-11-21 (design v3 fixes B2): the All / Market / Limit switch is back on the overview's cost receipt; it reads the
  server's `byType` totals (GET /audit/orders-summary), which add up to the all-orders totals.
- The receipt draws fills only: the replay payload carries the source file of the public prints, not the prints, and the
  receipt says so.

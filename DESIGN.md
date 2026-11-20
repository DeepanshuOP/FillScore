# FillScore design system: "Instrument" (design v2)

Written 2026-11-20 from Deepanshu's order of that day. Every UI file follows this file. Values live in
`frontend/app/ui/tokens.css` (tested for contrast by `app/ui/contrast.test.ts`); this file is the rulebook.
References studied (in `docs/design/references/`): Linear (surface ladder, hairlines, restraint), Vercel (Geist, tight
display tracking, 4 px rhythm), Stripe (tabular money figures, layered soft shadow), Mercury (tonal elevation, one solid
action per group).

## 1. Thesis

FillScore is a precision instrument for the past. The page should feel like a well-made measuring device: a dark,
quiet ground; one data colour that means "measured"; figures set like an instrument's readout; every mark traceable
to its source. The signature is **the market tape**: a real order drawn on the exchange's real public prints, with
the spread, impact and fee called out. It is the landing hero and the order-replay drawer in the app.

What it refuses: report-like walls of grey text, same-weight sections, generic icon-card grids, gradients everywhere.

## 2. Invariants (product rules, not style; never traded for looks)

1. No number written by a language model. Every figure comes from deterministic code and the existing APIs.
2. Past tense findings only. No advice, no prediction, no "could save", no "route flow to".
3. Measured, insufficient data and not computed stay visually distinct, through the one `ValueState` component
   (shape + line style + words; colour only repeats them).
4. Demo accounts are always labelled synthetic (`ProvenanceChip`, the top-bar badge) and are read-only.
5. Read-only exchange keys only; refusal states say exactly what to change on the exchange.
6. Reduced motion is respected everywhere (Motion `MotionConfig reducedMotion="user"`, `gsap.matchMedia`, Lenis
   `respectReducedMotion`). With it on, the final frame shows and nothing travels.
7. Correlation, never causation: "coincided with", never "caused" or "due to".
8. A value that cannot be measured reads "insufficient data", never a plausible number.

## 3. Colour

Dark is the default; a light theme is a first-class twin (next-themes, toggle in the top bar, stored per browser).

| Role | Dark | Light | Use |
|---|---|---|---|
| surface | `#0B1015` | `#F6F7F9` | page ground |
| raised | `#11171E` | `#FFFFFF` | panels |
| overlay | `#18202A` | `#EEF1F4` | menus, sheets, hover, secondary buttons |
| ink | `#E8EDF2` | `#0B1015` | text |
| graphite | `#8A96A3` | `#566170` | secondary text (>= 4.5:1 on every surface) |
| rule | `#1F2833` | `#E1E5EA` | separators only (< 3:1) |
| edge | `#66748A` | `#7C8796` | control borders (>= 3:1) |
| measured | `#5EC8E5` | `#06627C` | measured values and data marks; never paints a control |
| action | `#4C8DFF` | `#2563EB` | primary actions, links, focus, selection |
| insufficient | `#E3A73B` | `#B7791F` (text `#8A5A0B`) | "insufficient data" |
| danger | `#F2685E` | `#B42318` | destructive actions, refusals |

- **Strategy: restrained.** Neutrals plus two accents with fixed jobs: cyan = measured, blue = act. Amber only for
  insufficient data. Money is never coloured good or bad.
- **Grades** have a refined chip set (`GradeChip`): the letter in a desaturated grade colour on a 14% tint of it with a
  hairline of the same hue. Dark: A `#6BD6A6`, B `#A9D46F`, C `#E3C25B`, D `#E8955A`, F `#EF7A73`; light counterparts
  in tokens.css. Never a flat saturated square.
- **One aurora**, hero only (`aurora` utility: two soft radial blooms of cyan and blue at about 20%). Nowhere else.

## 4. Type

- **Geist Sans** for text and figures; **Geist Mono** only for ids, hashes, order ids and the key fingerprint
  (never as a "technical" costume). Served by the `geist` package. IBM Plex is gone.
- Tabular figures everywhere (`font-variant-numeric: tabular-nums` on body).
- Expression through scale, weight and tight tracking: display steps `display-xl` (44 to 80 px, -0.045em),
  `display-lg` (36 to 56, -0.035em), `display-md` (28 to 40, -0.028em), `title` (20, -0.015em); body 15 px / 1.55;
  captions 13 px; micro labels 11 px. Weights 400, 500, 600 only.
- **Sentence case.** No uppercase tracked eyebrow labels, ever. A heading carries its own weight.
- Body measure 65 to 75 characters.

## 5. Space, radius, elevation

- 4 px base; steps 4 8 12 16 20 24 32 40 64 96 128. Panels pad 20 to 24 px; landing sections 96 to 160 px apart.
- Radius: 6 (small controls, chips), 9 (buttons), 10 to 12 (inputs, banners, cards), 16 (panels, the tape window),
  full (status pills).
- Elevation is tonal: surface -> raised -> overlay, each with a 1 px hairline (`rule`) and a one-pixel top highlight
  (`--ui-highlight`). Floating layers (menus, sheets, toasts) add `--ui-shadow-float`, a layered low-alpha shadow.
  No zero-offset glow halos except the gauge arc's soft drop shadow in its own hue.

## 6. Motion

- **Motion** (`motion/react`) for component transitions: presence, layout, disclosure height, the gauge arc draw.
  UI durations 150 to 300 ms, ease-out `cubic-bezier(0.22, 1, 0.36, 1)`.
- **GSAP** (ScrollTrigger, SplitText) and **Lenis** on the landing page only, loaded by dynamic import.
- **The number rule:** NumberFlow (`Figure`) may animate a value that changes after a user action (switching account,
  period or tab). On first load a value renders in its final form; it may fade or blur in, never count up from 0.
  `Figure` only animates when NumberFlow's own formatting equals the canonical `formatUsd`/`formatSignedBps` string.
- **The hero tape** is visible from frame 0; only the order's story animates (placement, fills, the spread call-out,
  the cost ledger). It plays once, can be skipped, ends static; with reduced motion only the final frame shows. No
  layout shift: every element is in the DOM from the first paint; the animation changes opacity and transform only.
- No pulse, ping, shimmer or looping decoration.

## 7. Components

| Component | File | Notes |
|---|---|---|
| ValueState | `app/ui/ValueState.tsx` | measured (square, solid line), insufficient (diamond, dashed, amber), not computed (dash, dotted box) |
| GradeChip / GradeBadge | `app/ui/GradeChip.tsx`, `GradeBadge.tsx` | refined chip; badge adds "Measured score, grade A" |
| Figure | `app/ui/Figure.tsx` | NumberFlow under the number rule |
| Button | `app/ui/Button.tsx` | primary (action blue, ink text), secondary (overlay + hairline), quiet, destructive with confirm |
| Panel | `app/ui/Panel.tsx` | raised panel, 15 px title, one-line caption |
| Banner, EmptyState, ProvenanceChip, Disclosure | `app/ui/` | restyled, same semantics |
| Charts | `app/ui/charts/` | ScoreGauge, StackBar, IntervalPlot, RankPlot (+RankTable), BarList (`ChartFrame.tsx`) |
| Tape | `app/ui/tape/` | the signature: prints, quote band, mid, placement, fills, call-outs, cost ledger |
| shadcn/ui | `components/ui/` | Sheet, Drawer (Vaul), Command (cmdk), HoverCard, Popover, Tooltip, Tabs, Table, DropdownMenu, Dialog, ToggleGroup, Sonner; mapped onto the tokens in `globals.css` |

Explanatory text lives in HoverCards, Popovers and the "Method" side sheet; the page shows numbers, charts and
one-line captions.

## 8. Data visualisation

- One data hue (measured cyan) at shares 100 / 82 / 65% of the colour; never paler than 65% (the 3:1 floor).
  A stated, unmeasured value (a demo fee at the published rate) is a dashed outline, not a fill.
- Thin marks, 4 px rounded ends, a 2 px surface gap between stacked parts, markers of at least 8 px, a hover tooltip
  on every mark, recessive axes and grid. Text wears text colours, never the series colour.
- Every chart has a text or table form (`ChartFrame`, `RankTable`, legends with values).
- Cost against expected is drawn on one axis (paid minus expected), never two quantities on one scale.
- Rankings: noise-aware. Ranks start at 1; overlapping intervals share a rank and read "not distinguishable from";
  groups under 20 orders follow the ranked ones as "too few to tell" and get no mark.
- Heatmaps are single-hue. A negative value is never stacked; it is listed "below zero, not drawn".

## 9. Copy

- Past tense, plain words, short sentences. "The 245 orders paid $52.08." Not "You could save".
- No "A · B · C" strings, no arrow glyphs on links, no exclamation marks, no fake testimonials, logos or numbers.
- Demo figures say "synthetic trader, real prices" where a visitor could mistake them for a real account.
- LLM explanation blocks are labelled "Explanation (language model; every number was checked against the audit)".

## 10. Anti-generic list (checked at review)

No uppercase tracked eyebrows; no identical icon-card feature grid; no gradient washes outside the hero; no
one-word-accented headlines; no gradient text; no glassmorphism as decoration; no coloured side stripes on cards; no
hero-metric template; no sparkline standing in for content; no emoji icons.

## 11. Decisions log

- 2026-11-20: direction "Instrument", dark first with a light twin, Geist; replaces direction A "Audit report"
  (light, IBM Plex) after Deepanshu's review of the live site.
- Prototype choices (design lab, 2026-11-20): recorded in section 12 once made.

## 12. Prototype choices (design lab, 2026-11-20)

Both rounds were built from the production components and the screenshot fixtures, and looked at in one 1440 px
capture each (`/design-lab/hero`, `/design-lab/dashboard`, development only).

- **Landing hero: variant A "split" (copy left, tape right) won over B "stage" (centred copy, tape full width
  below).** In A the claim, the tape and the cost ledger with its conclusion ("fees were 99.99% of the cost") are all
  in the first viewport at 1440 x 900, so the proof sits beside the claim. In B the ledger fell below the fold, the
  tape read as a screenshot rather than the subject, and centred copy over a wide chart is the category default.
  B was deleted.
- **Dashboard overview: variant A "bento" won over B "strip" (four figures over two charts).** B is the hero-metric
  template this file bans: four same-weight numbers with no state, no sample size and no provenance, and it dropped
  the outcomes, the "insufficient data" states and the v1 line. A gives each number its own chart, caption and state
  in one grid, with the provenance strip closing it. B was deleted.
- Fixes the captures showed and that were made at once: the interval plot's text scaled with its width (now drawn at
  its measured pixel width); legend notes wrapped badly (notes moved into the tooltips); the tape's call-out was
  clipped at the right edge, a pre-window quote drew above the plot, and the band label collided with prints (call-out
  moved left of the fills, plot clipped, a legend row under the tape).

# Design v3.1 "Quiet audit": references

Research for Deepanshu's order of 2026-11-21 (second): design v3 "Tape & Receipt" stays; v3.1 cuts the sensory
overload. Every site below was opened on 2026-11-21 in headless Chromium at 1440 x 900 (browser-use MCP), scrolled by
wheel events in steps of 900 px, and captured per viewport. **Words per viewport** were counted in the page by a script
(text nodes inside the viewport, visible, not `opacity: 0`); the count is approximate (hidden menu layers that keep
`opacity` above 0 are included and are noted where seen). Captures are in the session scratchpad; eight are kept in
`docs/design/v31-refs/`. Motion timing on the sites was judged by eye from consecutive captures and the Osmo preview
videos; it was not measured with a profiler.

The design v3 references (`docs/design/REFERENCES.md`) still hold; this file adds what v3.1 needs: density, disclosure
and motion.

## Skipped (did not render under automation)

- **Cyera AI Guardian** (SOTD 11 Nov 2026): "Your browser is not supported" (WebGL).
- **Future of Finance** (HM 27 Jun 2026) and **Autonomous Finances** (HM 12 Apr 2026), both Peachworlds: a WebGL
  fallback page of 27 words.
- **Cafeteria 2027 report** (Awwwards data-visualisation category): the capture timed out after 60 s.
- **Osmo vault resources** are members-only; each resource page has a public preview video
  (`osmo.b-cdn.net/resource-video/<slug>-1440x900.mp4`), which was read frame by frame instead of the code.

## Sites

### 1. Hark Capital (Awwwards Honourable Mention, 21 Feb 2026), `harkcap.com` (`01-hark-chapter-numerals.jpg`)
- **Structure:** hero, who we are, core stats, people, solutions (three numbered rows), recent transactions.
- **Density:** hero **14 words in 2 sizes** (16, 92 px); sections 42 to 98 words; one family (Aeonik Pro) plus a serif
  for numerals.
- **Grid:** 12 columns, text in the right half, a giant serif numeral (01, 02, 03, about 240 px) as the right edge of
  each solution row.
- **Disclosure:** the menu is a small card that expands; solution rows end in one "Explore" link.
- **Signature:** the chapter numeral as the image of the row.
- **Borrow (overview, landing):** one large figure per chapter carries the screen; everything else is two short lines.
  Our numeral is the figure itself ($52.08, the grade, the month), never a decorative index.
- **Reject:** the stat strip of four same-weight numbers (2013, $2.1B+, 70+, 4) is exactly the hero-metric strip on our
  anti-generic list.

### 2. The Equator Company, `equatorcompany.com` (`02-equator-one-sentence.jpg`)
- **Structure:** a colour field with a mark; a headline; a story told one sentence per viewport; then chapters on hard
  colour cuts with a "2/5" counter.
- **Density:** the visible copy is 10 to 30 words per viewport (the script reads 64 to 192, of which 61 at 16 px are a
  hidden menu layer); 3 sizes per screen (16, 72 or 96, 21).
- **Grid:** sentences indented further on each line; a chapter pins while its text changes.
- **Signature:** one sentence at display size per viewport, revealed as you scroll.
- **Borrow (landing):** the pacing: one sentence per chapter, and a small printed counter ("1 of 3") instead of a
  heading. **Reject:** the abstract mascot and the colour cuts (our ground is paper; chapters change object, not colour).

### 3. Grail (SOTD 4 Nov 2026), `grail-app.com` (`04-grail-chapter-label.jpg`)
- **Structure:** hero, then "Chapter 01 / 02 / 03" each with one headline and one paragraph, a numbered list of
  outcomes, a sticky pill call to action at the bottom.
- **Density:** 88 to 156 words per viewport early, 227 to 308 in the later list sections (the page gets loud as it
  goes).
- **Disclosure:** none; everything is printed.
- **Signature:** a chapter label in the top corner ("About Problem", "Chapter 01") that changes as you scroll.
- **Borrow (overview):** a quiet chapter label in a fixed corner position, so a reader always knows where they are
  without a heading per section. **Reject:** the floating 3D cards, the sticky pill, and the density of the later
  sections.

### 4. A24 (SOTD 26 Oct 2026), `a24.raviklaassens.com` (`05-a24-spec-table.jpg`)
- **Density:** 36 words per viewport; the film plays behind (the canvas did not render headless).
- **Signature:** a tiny spec table at the top left (DIRECTED BY / YEAR / STARRING, hairline rows, label left and value
  right) is the only text over a full field, and two short press quotes at the bottom.
- **Borrow (receipt, overview):** the key/value spec table with hairlines as the one block of facts per screen; it is
  already our receipt's `ORDER / MARKET / PLACED / STATUS`. On the overview the period, account and data source go into
  one such table instead of sentences.
- **Reject:** 8 px labels (our printed labels stay at 11 px or more).

### 5. Creative Reference Library (SOTD 10 Nov 2026), `crl-2026.webflow.io`
- **Density:** 188 words in the first viewport, 184 of them at 15 px, around one display line ("CRL® /V.01 (2026)",
  95 px) split across three columns. The page uses its own scroll container (wheel did not move it).
- **Borrow:** the display line split by the grid, with parenthesised numbers "(1)" "(2)" as quiet captions.
- **Reject (counter-example):** a dense wall of small captions around one big line is exactly our overload.

### 6. Atalanta (SiteInspire, Business & Finance), `atalanta.tech` (`03-atalanta-rail-reading-line.jpg`)
- **Structure:** a left rail with a square-marked label ("■ THE PROBLEM", "■ INTRODUCING ARGO"); the text column to
  its right; a pixelated image field.
- **Density:** 54 to 105 words per viewport, but at 50 to 64 px, so 2 to 3 sentences.
- **Signature:** two-tone headlines (the subject in ink, the rest in grey) and paragraphs that brighten from grey to ink
  as they reach the reading line.
- **Borrow (landing):** the left rail label as the chapter marker; two-tone sentences (the figure in ink, the rest in
  graphite). The scroll-lit paragraph is rejected for us: grey-on-paper text before it lights would fail contrast.

### 7. 1984 Ventures (SiteInspire, Business & Finance), `1984.vc`
- **Density:** hero 31 words (48 px serif headline, 13 to 16 px labels), sections 61 to 104.
- **Borrow:** a serif-free lesson: one headline, then the object (three colour blocks), then nothing.
  **Reject:** the testimonial carousel (we have no testimonials, by rule).

### 8. Town (SiteInspire, Technology), `town.com`
- **Density:** hero 90 words; product sections 224 to 436 words at 14 to 16 px.
- **Borrow:** a hand highlight on one phrase of the lede ("unusually helpful"): one pen mark per sentence at most.
- **Reject (counter-example):** product screenshots full of small text as content.

### 9. Factura (gsap.com showcase), `getfactura.app` (`06-factura-step-list.jpg`)
- **Structure:** hero (26 words, 125 px display), logos, a product table, then "One invoice, start to finish" with a
  numbered step list (01 Create, 02 Send, 03 Get paid) beside one product panel that changes per step.
- **Density:** hero 26 words; product sections 200 to 238 words (most inside the UI shots).
- **Signature:** the step list that drives one object.
- **Borrow (landing, the pinned horizontal chapter):** three numbered steps, one object each: tape, receipt, stamp.
  **Reject:** the dark gothic hero, the logo strip, UI shots as content.

### 10. gsap.com showcase (`gsap.com/showcase/`)
- 35 words in the first viewport, then a grid of mostly portfolio and studio sites (Factura was the only one about a
  financial object). Lesson: GSAP craft on award sites is mostly one scroll-driven moment per page and quiet elsewhere,
  as in the v3 research.

### 11. Osmo vault resource demos (preview videos)
| Demo | What it does (from the video) | v3.1 use |
|---|---|---|
| **Scroll Ruler** (`07-osmo-scroll-ruler.jpg`, 4.0 s) | a vertical ruler of ticks with three labels; the tick under the scroll position and its label turn red | overview chapter 5: the cost-against-expected ruler; the tick that marks the paid point is the pen's, the labels are printed |
| **Masked Text Reveal** (4.3 s) | SplitText lines rise out of a clip mask, one after another; a switch for lines / words / letters | landing chapter headlines: lines only, never letters (letters on figures would read as a scramble) |
| **Sticky Title Scroll** (11.7 s) | a title pins; the next title layers over it as the section scrolls; a "[ RESOURCE ]" printed label above | overview chapter labels; the bracketed printed label matches our mono labels |
| **List/Grid Toggle (Flip)** (2.7 s) | the same items fly from grid cells to list rows with Flip; thumbnails shrink in place | overview chapter 4 to receipt: the bar is the same element in two states (Flip) |
| **Scaling Media on Scroll** (5.7 s) | images grow from small to large around a pinned headline as the page scrolls | rejected: decoration with no data |
| **Step-by-step Timeline** (`08-osmo-step-timeline.jpg`, 6.8 s) | a vertical line with numbered dots; the active step is ink, past and future steps grey; the line fills as you scroll | landing "how it works" in three steps; the receipt's notes fold. We keep every step at full contrast (no grey-out below 4.5:1) |

## What the sites agree on (rules for v3.1)

1. **One idea per viewport.** The quiet winners hold 14 to 40 visible words per viewport (Hark hero 14, Factura hero
   26, 1984 hero 31, A24 36). The loud pages (CRL 188, Town 436, Grail later sections 308) are what Deepanshu called
   overload. Target: **at most ~25 words per section, one visual, one sentence.**
2. **Two or three type sizes per screen.** Hark: 2 in the hero; Equator: 3; Atalanta: 3. Our overview has 7 or more.
3. **Facts in one small table, not in sentences** (A24, our receipt).
4. **A chapter marker, not a heading** (Grail's corner label, Atalanta's rail, Equator's 2/5, Osmo's bracketed label).
5. **One signature motion per page; the rest is still.**

## Libraries

Sources: official docs and component source (`docs-researcher` digests, 2026-11-21). Libraries are references only;
everything is rebuilt in our tokens.

| Library / item | What we borrow, and where | What we reject, and why |
|---|---|---|
| **GSAP ScrollTrigger** (gsap.com/docs/v3/Plugins/ScrollTrigger/) | pin with `anticipatePin: 1`; `scrub: 0.6`; `snap` to labels for the landing's three objects; `gsap.matchMedia()` (`ScrollTrigger.matchMedia` is deprecated) with a `(prefers-reduced-motion: no-preference)` branch | `containerAnimation` triggers cannot pin or snap; we pin the section and drive one `ease: "none"` horizontal tween from the same trigger |
| **Flip** (gsap.com/docs/v3/Plugins/Flip/) | `Flip.fit` / `Flip.from` with `absolute`, `scale`: the tape bar or ledger row grows into the receipt slip | the docs do not cover portals or `position: fixed` targets, so we measure both rects ourselves and animate a stand-in slip (clone) on top, then hand over to the real dialog |
| **Draggable + InertiaPlugin** (gsap.com/docs/v3/Plugins/Draggable/) | `type: "x"`, `bounds`, `inertia`, `snap` to bar positions, `edgeResistance: 0.85`, `allowNativeTouchScrolling` (vertical scroll still works) for the month tape | no keyboard support is documented: arrow keys are our own, as today |
| **Observer** | not needed (ScrollTrigger and Draggable cover it) | scroll-jacking the overview |
| **SplitText** (3.13) | `mask: "lines"`, `autoSplit` with the tween returned from `onSplit`, `aria: "auto"` for masked headline reveals on the landing | chars and words on figures (reads as a scramble, forbidden on numbers) |
| **DrawSVG** | the stamp's double border drawn once; the pen circle on the largest order | animating strokes on every hover |
| **CustomEase** | `CustomEase.create("fs-out", ".23,1,.32,1")` and `("fs-drawer", ".32,.72,0,1")` so GSAP and CSS share DESIGN.md's curves | new curves |
| **useGSAP** (gsap.com/resources/React/) | `scope` + `contextSafe`; reverts tweens, ScrollTriggers, Draggables and SplitText on unmount; StrictMode-safe | GSAP calls during SSR |
| GSAP licence (gsap.com/community/standard-license/) | all plugins free for commercial use in the public `gsap` package; the only prohibited use is a no-code animation builder competing with Webflow, which FillScore is not | — |
| **Radix Popover** (radix-ui.com) | the pen margin note: a button next to the value; opens on hover (fine pointer, after a short delay), on focus and on click; Escape closes and returns focus | — |
| **Radix HoverCard** | — | it ignores touch (`excludeTouch` in the source) and its docs say it is ignored by screen readers: unfit for a note that explains a value |
| **Base UI** Tooltip / Popover (base-ui.com) | the provider "warm window": after one note has opened, the next opens without delay (400 ms window) | tooltips on touch (Base UI disables them for good reason) |
| **Vaul** (vaul.emilkowal.ski) | margin notes on touch open in a bottom sheet; the receipt drawer on phones stays | the repository is marked unmaintained: we keep the pinned 1.1.2 and nothing new depends on its undocumented props |
| **cmdk** | unchanged | any open/close animation (Emil: used 100+ times a day) |
| **Sonner** | unchanged (printed slips) | — |
| **NumberFlow** (source `lite.ts`) | unchanged rule: after a user action only; it does not animate on first render (`startDigitsAtZero` false) | the `continuous` plugin (passes through intermediate numbers, which reads as counting) |
| **Aceternity Lens** (ui.aceternity.com) | the idea of a loupe over the bars under the pointer, for the month tape | duplicating the children in the DOM and mouse-only behaviour: ours magnifies one bar's printed slip, follows the keyboard too, and is off under reduced motion |
| **Aceternity Sticky Scroll Reveal / Timeline / Tracing Beam** | sticky chapter labels | colour cycling, inactive text at 30% opacity (fails contrast on paper), scroll-filled gradient lines |
| **Magic UI Number Ticker** | — | counts from zero by default: forbidden by the number rule |
| **Magic UI Marquee / Animated Beam** | "connect two things, drawn once" | infinite loops (nothing loops, DESIGN.md §7) |
| **Magic UI Blur Fade** | the 6 px rise | the blur on paper text |
| **21st.dev** (Numbers, Marquees, Tabs, Timelines, Tooltips, Charts, Heroes) | plain timelines and the tooltip pattern (the source is gated behind an API key; the listing and docs pages were read) | Spline and scroll-hijack heroes, orbital timelines, gradient charts |
| **Emil Kowalski, emil-design-eng / animate** | the frequency table (none on keyboard actions and high-frequency UI; standard on occasional; delight only on rare first-time moments); UI 150 to 300 ms; exits faster than entries; `ease-out` (.23,1,.32,1), drawer (.32,.72,0,1); never from `scale(0)`; origin-aware popovers; hover only behind `(hover: hover) and (pointer: fine)`; reduced motion keeps opacity and drops movement | — |

## Per screen

- **Landing:** Equator's pacing (one sentence per chapter), Factura's three numbered steps as one pinned horizontal
  chapter (tape, receipt, stamp), Osmo's masked line reveal for chapter headlines, Atalanta's rail label.
- **Overview:** five chapters, each one figure or object (Hark), a corner chapter label (Grail), facts in one spec table
  (A24), the scroll ruler for cost against expected (Osmo), a lens over the tape (Aceternity, rebuilt), Flip from bar to
  receipt (Osmo List/Grid).
- **Receipt flow:** Flip from the clicked bar or ledger row; a step-timeline-like "Notes" fold at the bottom; the print
  feed once per session.

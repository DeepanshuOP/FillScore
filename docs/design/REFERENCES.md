# Design v3 references

Research for design v3 (Deepanshu's order of 2026-11-20). Every site below was opened in a real browser (headless
Chromium at 1440 x 900, through the browser-use MCP) on 2026-11-20 and looked at in a viewport capture. The captures are in
`.work/refs/` (local only, not committed). The Awwwards dates are the award dates shown on each site's Awwwards page.

Sites that did not render under automation were skipped, as the order allows:
- **EverSwap** (SOTD, Jun 2026): the preloader stayed at "0%" for more than 15 s (it waits on WebGL).
- **Tenity** (SOTD, May 2026): the hero canvas rendered black (WebGL without a GPU). Its text was readable: a Diagramm
  display face and the line "Fintech makers and other impossible things", set one word per line.
- **SiteInspire** has no finance category any more; "Business & Finance" and "Technology" were used instead.

Looked at and not kept, as negative evidence: Equitify Assets (Awwwards data-visualization category; stock-photo hero,
pill buttons), Telemyr (data visualization; blob icons, no data), Statements (One Page Love finance; centred headline over
two pills and a logo-card grid). All three are the category default this redesign has to leave.

## The references

### 1. Awwwards Sites of the Day, November 2026 (`01-awwwards-sotd-grid.jpg`)
The current SOTD run (Sweet Tape, Bulletproof, Santal, Delta Cafés, Grids, Creative Reference Library, Deepbook, Cyera).
- **What they share:** every winner owns one material or one object (crumpled paper, a book, a studio's wordmark) and
  builds the whole page from it. None is a template with a brand colour.
- **Avoid:** the device-mockup thumbnail (a laptop on a plinth) as a hero; it is how sites are shown on Awwwards, not how
  they are built.

### 2. aqryl, trading analytics (Awwwards Nominee, May 2026) (`02-aqryl-hero.jpg`)
The closest product in category: a trading journal with performance analytics.
- **Borrow:** one detail only. "guessing" carries a hand-drawn blue underline: a pen mark used as emphasis. In v3 this
  becomes the auditor's pen: orange strokes that circle and bracket measured values.
- **Avoid:** almost everything else. Centred headline, blue pill button, a phone in a hand; inside, same-size tiles of
  "Win rate 60.45%", red-green gauges and donut rings. This is design v2's gauge and tile grid, and it was only a nominee.
  Fonts: Geist + Helvetica + Geist Mono: the default stack.

### 3. Synthesis Capital (Awwwards, May 2026) (`03-synthesis-capital.jpg`)
- **Borrow:** the stack of slightly rotated photo cards that overlap and scroll at different speeds. A physical pile of
  flat objects is the right model for receipts: in v3 the overview's receipts can sit as a loose stack with a 1-3 degree
  rotation each, never a grid of cards.
- **Avoid:** the navy-on-white corporate palette, a full-width cookie modal over the hero, the uppercase tracked
  caption ("REDEFINE MEAT: A WHOLE DIFFERENT ANIMAL").

### 4. The Equator Company (`05-equator-hero.jpg`, `06-equator-editorial.jpg`)
The architect's named reference for colour and pacing. Typeface National (Klim), 96 px, weight 500, tracking -0.03em.
- **Borrow:** (a) *one warm signature colour as a whole field*: the opening viewport is entirely peach `rgb(255,155,105)`
  with brown ink `rgb(62,32,2)`, never an accent on white. (b) *editorial pacing*: one sentence spread over a full viewport
  at display size, the next line indented further ("It is a unique partner for / organizations seeking change." then
  "And it is here: meet / **The Equator Company**"), with a weight change instead of a colour change for the name.
  (c) Section colour changes as hard cuts (cream to lime), never gradients.
- **Avoid:** the abstract mascot shape; it carries no information, and FillScore's equivalent object is the receipt.

### 5. Sweet Tape (SOTD 17 Nov 2026) (`07-sweet-tape-paper-tab.jpg`)
Futura PT Condensed display, Inter Tight for text.
- **Borrow:** (a) a *real paper texture* over the whole page (crumpled sheet scan, low contrast); v3 uses a fine paper
  grain at 3-4% so the ground reads as printed stock, not as `#F3F2EE`. (b) The *"PULL ME" tab*: a white paper tab with a
  dotted perforation line and a notched zigzag bottom edge. This is the torn edge of the receipt drawer, and the
  perforation is the line between line items and the total. (c) Display type set on a curve, deformed like printed tape.
- **Avoid:** the drenched chartreuse with heavy condensed caps: it is the "flat saturated ink" cliché, and the curved
  baseline would make figures unreadable.

### 6. Santal (SOTD 15 Nov 2026; Business & Services Honors, Oct 2026) (`08-santal-grid-wordmark.jpg`)
Helvetica throughout.
- **Borrow:** (a) the *wordmark cropped by the viewport*, letters running off the top and both edges: type as image.
  For FillScore the cropped object is a figure (the month's total, the grade letter). (b) The *visible column grid*:
  hairline column rules down the whole page, and a tick mark where each nav item meets its column. (c) A diagonal hairline
  across the grid as the single expressive line. (d) An "invert color" switch as the theme toggle: one word, no icon.
- **Avoid:** the 9 px body copy and the debug "Controls" panel left in production.

### 7. Deepbook (SOTD 3 Nov 2026) (`09-deepbook-tick-field.jpg`)
A crypto exchange. TWK Everett.
- **Borrow:** the *tick field*: thousands of short vertical dashes on a grid that bend into a wave, a few lit in the
  accent. This is the right mark for the month tape: one tick per order on a time axis, height from its measured cost,
  unmeasured orders drawn as hollow ticks (ValueState), the selected one lit in orange.
- **Avoid:** the blue-black ground, the blue announcement bar, the blue primary button and the centred headline: it is
  design v2 in another typeface.

### 8. Grids S03 by Obys (SOTD 2 Nov 2026) (`10-obys-grids-ledger.jpg`)
Obys Sans.
- **Borrow:** the *ledger list*: index number at the left margin, title and two-line description staggered by indent
  every second row, a duration right-aligned on the same hairline. It is the receipt's line-item layout already set:
  `01 Spread paid ........ 0.00 bps   $0.00`. (b) The giant pixel-block wordmark cut off by the top edge.
- **Avoid:** the lecture count in a small grey line as the only hierarchy; FillScore's total must outweigh the lines.

### 9. project://cult (Typography Honors, Oct 2026; SOTD Sep 2026) (`11-project-cult-type-as-image.jpg`)
Trade Gothic Next Condensed display, Geist Mono micro text.
- **Borrow:** (a) display type as the image: three lines at roughly 200 px, words split across columns with gaps that the
  grid decides. (b) *Micro text in a staircase*: four short mono lines, each indented a little more, placed in the empty
  columns. FillScore's margin notes (the pen's written amounts) can use this indent. (c) One colour only, everywhere,
  including the micro text.
- **Avoid:** the CRT bloom and pure red on black (aggressive, and red reads as "loss" on a cost page); the profanity.

### 10. Stripe Press (SiteInspire, Technology) (`12-stripe-press-objects.jpg`)
Cardinal Fruit display, Suisse Mono labels.
- **Borrow:** (a) *objects with real material*: each book spine has its own cloth texture, and the selected book turns to
  face the reader. In v3 each order is a printed object; opening it prints its receipt. (b) The title line that scrolls
  horizontally with the selection: a ticker made of real titles, not decoration. (c) Mono labels in square brackets,
  `[ FULL CATALOGUE ]`, as the only chrome.
- **Avoid:** the warm serif display and the light-beige ground: they are close to the "cream serif" cliché the order rules
  out.

### 11. UGLYCASH (One Page Love, Finance) (`13-uglycash-figure-sticker.jpg`)
Helvetica Now Display Condensed Bold.
- **Borrow:** (a) the *balance figure with stepped decimals*: `$2,400` at full size, `.20` smaller, `356` smaller and grey,
  the last digit underlined. Precision shown by size, which suits bps and dollar amounts with four decimals. (b) A tilted
  sticker ("BOOST TO 7%") laid over the card at about 10 degrees: the physical gesture of the grade stamp.
- **Avoid:** the stuck-on sticker advertises a rate; FillScore's stamp records a past grade, so its words are past tense
  ("Graded A, 93.4, January 2024").

### 12. Hark Capital (named in the order) (`14-hark-anchored-display.jpg`)
Aeonik Pro.
- **Borrow:** the headline *anchored bottom-left* at the end of the first viewport, at display size, with nothing
  above it but the image. The menu as a small card in the corner that expands ("Click to Expand").
- **Avoid:** the corporate blue render of a building; the copy ("Pioneers in NAV financing") is a claim with no proof.

## The five patterns that most separate award-level work from v2

1. **One material owns the page.** Sweet Tape is paper, Stripe Press is cloth and board, Equator is one colour field.
   v2 is a dark template with a cyan accent: tokens, not a material. v3 must choose a material (paper and ink, or the
   ruled sheet) and draw every part from it: ground, panels, toasts, drawers, focus rings.
2. **Type is the image.** Santal, Obys and project://cult crop display type at the viewport edge and let the grid split
   words. v2's largest type is 80 px in a column beside a chart. v3 sets the month's total, the grade and the order's
   costs at sizes where they become the composition.
3. **The signature is an object you can touch.** The Sweet Tape tab pulls; the Stripe Press books turn. v2's tape is a
   chart that plays once. In v3 the order is a receipt that prints, tears and gets stamped; the grade is a stamp with
   weight; the month is a tape you can scrub.
4. **Visible structure instead of boxes.** Santal's column rules and Obys's hairline ledger give order without cards.
   v2 is a bento of rounded panels (the aqryl problem). v3 uses rules, columns, perforations and indents, and no
   rounded card.
5. **One authored motion with a reason.** Every winner has one scroll-driven moment that explains something, and quiet
   everywhere else. v2 animates many small entrances. v3 has one pinned, scrubbed sequence: the tape slows, stops on the
   order, and the pen marks the costs; the rest of the page is still.

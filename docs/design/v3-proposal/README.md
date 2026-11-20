# Design v3 proposal: two directions

Deepanshu's order of 2026-11-20. Design v2 is live and competent but generic (navy-black SaaS, blue accent, rounded
cards, a gauge). This round builds two complete directions as working prototypes in the development-only design lab
and stops for the choice. **Production screens are unchanged.** Research: `docs/design/REFERENCES.md`.

| | Direction 1: Tape & Receipt | Direction 2: Grid & Highlighter |
|---|---|---|
| Hero 1440 | `1-tape-hero-1440.jpg` | `2-grid-hero-1440.jpg` |
| Overview 1440 | `1-tape-overview-1440.jpg` | `2-grid-overview-1440.jpg` |
| Receipt 1440 | `1-tape-receipt-1440.jpg` | `2-grid-receipt-1440.jpg` |
| Hero 390 | `1-tape-hero-390.jpg` | `2-grid-hero-390.jpg` |
| Receipt 390 | `1-tape-receipt-390.jpg` | `2-grid-receipt-390.jpg` |

The heroes are captured at the final frame of their scroll story (the pinned section scrolled to its end), from a
local production build (`DESIGN_LAB=1 next start`), headless Chromium, JPEG quality 60.

To see them move: `cd frontend && npm run dev`, then `/design-lab/v3` (index), `/design-lab/v3/{tape,grid}/{tokens,hero,overview,receipt}`
and `/design-lab/v3/specimen`. Scroll the heroes slowly; on the overview, hover the month tape or tab to it and use
the arrow keys, Enter opens the receipt; switch "All orders / Market / Limit" to see the counter roll.

## Both directions show the same real numbers

Every figure is computed by deterministic code from committed fixtures; nothing was typed in by hand.
- **The hero order** is the one the stated rule picks (`app/lib/landing/heroOrder.ts`): demo-moderate's BTCUSDT market
  sell of 28 January 2024, 20:41:40.962 UTC. The tape is the 38 real public prints from Binance's daily trades file
  (sha256 `ec7442f3c645…`), the quote at arrival and the order's two fills. Costs come from the production replay:
  spread <$0.01, impact and timing $0.00, fees $0.25, total $0.25 (10.0 bps), "fees were 99.99% of it".
- **The month** (`frontend/app/design-lab/v3/fixtures/month-orders.json`) is all 245 January orders of demo-moderate,
  each run through the production `buildOrderReplay` over the offline demo build (`cut-month.ts`; no network, no
  database). A unit test proves it adds up to what the API serves for the account: $52.08, 11.7 bps of $44,411.78,
  the four cost terms, 84 market and 161 limit orders.
- **The grade** is the served v2 grade (A, 93.4, band 92.5 to 94.1, scoring v2.3.0); the frozen v1 grade (B, 84.8)
  sits beside it. The locked v1 grades are untouched.
- **Invariants held:** the demo reads "synthetic trader, real prices" in the top bar, in the hero's source line and on
  every receipt; copy is past tense with no advice; measured, insufficient data and not computed print as distinct words
  on the receipts (production keeps `ValueState`); the counter never counts up on first load, rolls only after a user
  action, and only when NumberFlow's output equals the canonical string; with reduced motion, and without JavaScript,
  the DOM's default state is the finished frame (strokes drawn, notes written, tape stopped) and nothing travels.

## Direction 1: Tape & Receipt (recommended)

FillScore holds every fill against the market tape and writes down what it cost. The page is printed paper and ink:
paper `#F3F2EE`, ink `#121210`, graphite `#6B6A66`, rule `#D8D6CF`, receipt white `#FBFBF8`, and one hot signal, fill
orange `#FF4F12`, used as an auditor's pen. The alternative theme "Carbon copy" is warm charcoal with the same orange.
Type: **Cabinet Grotesk** (display and UI, 400 to 900) and **Departure Mono** (tape, receipts, labels: the thermal
printer's dot matrix).

- **Hero:** a ticker tape of the real prints, with sprocket holes, feeds in from the right. Scrubbed by scroll (GSAP
  ScrollTrigger, pinned, with Lenis), it slows and stops on the order; the other prints fade back; the pen brackets the
  arrival quote (spread), brackets arrival to last fill (impact and timing), circles both fills (fees), and writes each
  measured amount in the margin, ending with "Total $0.25, 10.0 bps; fees were 99.99% of it" double-underlined. The
  strokes are seeded hand-drawn paths drawn with DrawSVG. On a phone the two circled fills are centred and the amounts
  are listed under the tape.
- **Overview top:** the month's total as the image (`$52` in ink, `.08` in graphite; the mechanical counter rolls the
  same split while it changes); the grade as a rubber stamp ("GRADED / A 93.4 / JANUARY 2024 / SCORING v2.3.0", ink
  texture, rotated, it stamps in once on first view); the month as a ticker tape, one tick per order, with a receipt
  preview on hover or arrow keys; the four cost terms as receipt lines.
- **Receipt:** clicking an order prints a thermal receipt down out of a slot at the top of the screen (Radix Dialog, the
  Sheet primitive; on a phone a Vaul drawer with the torn edge on top): order lines, fills, the fills against the
  public prints, the cost lines with leaders, a punched perforation, a heavy total, the 90% range for orders like it,
  the source file and its hash, bars drawn from the SHA-256 of the order record (and labelled as not scannable), and a
  "SIGNED" stamp that links to the evidence signature. "Copy order id" prints a slip (Sonner).
- **Borrowed:** the pen mark (aqryl's one good detail), paper grain, perforation and the notched tab (Sweet Tape), the
  loose pile of flat objects (Synthesis Capital), the ledger line layout (Obys Grids), the tilted sticker as the stamp
  and stepped decimals (UGLYCASH), editorial scale and the bottom-left anchored headline (Equator, Hark), one authored
  scroll moment (the SOTD set).

## Direction 2: Grid & Highlighter

The strongest distinct direction the research suggests: a Swiss accounting sheet. A visible twelve-column grid of
hairlines over warm black `#11110F` (never blue-black), chalk text `#ECEBE4`, and a lime highlighter `#D4F53C` that
marks what was measured (text on it is ink, 4.5:1 or more). The light twin "Sheet" is `#F2F2EC`. Type: **Archivo**
variable at width 125 for display figures and width 100 for UI, with **Fragment Mono** for indices, hashes and labels.

- **Hero:** the order's cost, `$0.25`, set at about 340 px wide-stretch and cropped by the top bar (type as image); the
  38 prints as a tick field on the grid; a ledger whose lines the highlighter marks one by one as the scroll measures
  each part (quote at arrival, arrival to last fill, fees, total).
- **Overview top:** `$52.08` across eight columns, the grade as a lime letter "A" with its score and versions across
  four, the month as a tick field (Deepbook's device, warm), the cost terms as an indexed, staggered ledger.
- **Receipt:** a ledger sheet wiped in from the right (clip-path, Radix Dialog; Vaul on a phone): the total as the
  image, numbered cost rows, the total highlighted, fills, ticks, the hash in four groups and a highlighted "Signed".
- **Borrowed:** the visible grid, nav ticks and cropped wordmark (Santal), the indexed staggered ledger (Obys Grids),
  type split by the grid (project://cult), the tick field (Deepbook), bracketed mono labels (Stripe Press).

## Recommendation: Direction 1, Tape & Receipt

1. **It is FillScore's own object.** The product is literally a receipt for a fill, checked against the tape. Every
   signature moment explains the method while it decorates: the tape stops where the order sits, the pen shows what
   each cost is measured from, the receipt is the audit. Direction 2 is a beautiful sheet, but the grid and the
   highlighter could belong to any finance product; it argues through typography, not through the product's mechanism.
2. **It leaves the category.** Crypto and trading sites are dark (Deepbook, design v2, most exchanges). A light, printed,
   tactile audit is the distinct position, and it says "auditor" before a word is read. Direction 2 is dark again,
   close to the "near-black with one neon accent" look, even if warm and without glow.
3. **It reads well for long work.** Paper and ink is calm in the app for hours; the orange appears only where the pen
   marked something, so attention goes where the audit found something. Carbon copy covers dark-room use.
4. **Risks, stated:** pure `#FF4F12` on paper is 2.9:1, under 3:1, so in the paper theme an orange mark never carries
   meaning alone (every circled value is also written in `penInk #C2380A`, 4.5:1 or more; tested in
   `tokens.test.ts`). The receipt chart can draw public prints only for the hero order today; for other orders it
   draws the fills and says so (the replay payload needs the prints; already open with Deepanshu from M8). Departure
   Mono is a pixel face: right for receipts and the tape, wrong for long text, so it stays out of paragraphs.

## Checks and process

- Contrast of every token pair in both directions and both themes: `frontend/app/design-lab/v3/tokens.test.ts`
  (text >= 4.5:1, large text and marks and control edges >= 3:1, no blue-black ground).
- Tabular figures measured in the browser (`/design-lab/v3/specimen`, digit widths at 100 px): Cabinet Grotesk,
  Departure Mono, Martian Mono, Archivo at widths 100 and 125, and Fragment Mono set all ten digits at one width.
  **Clash Grotesk does not** (37.1 to 66.2 px), which ruled it out for a product made of tables. PP Neue Montreal was
  not tried: it is not downloadable without its foundry's form.
- No new dependency. GSAP DrawSVGPlugin ships in the installed `gsap` 3.15; the hand-drawn strokes are generated by
  `lib/pen.ts` (seeded, so server and client draw the same stroke) instead of adding rough-notation. No Magic UI or
  Aceternity effect is used: the shadcn MCP has no such registry configured here, and the two that could serve the
  concept (Marquee, Highlighter) would be a looping decoration and a new dependency where the tape is data and the
  strokes already exist.
- Docs checked through Context7: GSAP 3.15 (DrawSVGPlugin, ScrollTrigger, registerPlugin), Lenis (ScrollTrigger
  integration), NumberFlow (timing, trend, parts: digit size cannot change mid-roll, so the decimal step is a tone step).
- The scroll story lives in `frontend/app/components/marketing/v3/pinnedStory.ts`: landing-page scroll motion is allowed
  only in `components/marketing` and must load GSAP, ScrollTrigger and Lenis by dynamic import (`app/lib/motion.test.ts`).
- Impeccable's concept roll (`concept-seed`) was not run: it requires a PRODUCT.md and an interview first, while this
  order pins direction 1 and asks for direction 2 from the research and a stop for review. Its craft floor and detector
  were applied (`impeccable detect`: no findings). The `pick-ui-library` skill is not installed.
- Inspection: one batched round of the ten frames, one fix batch, one confirmation round, then two phone fixes
  re-captured.

## Not verified

The alternative themes (Carbon copy, Sheet) and the printed-slip toast were built but not captured or looked at; motion
was judged at its final frame and by scrolling in headless Chromium, not on a real phone or in Safari or Firefox; no
axe pass was run on the lab pages.

## Not done in this round, by design

Production screens, DESIGN.md (rewritten from the chosen direction once it is built), the rest of the landing page,
the app shell, ⌘K styling, Verify a pack (manifest lines ticking, the signature stamping) and the remaining screens.

# IA v4 references (fifth order of 2026-11-22, step 1)

Observed 2026-11-22. **Observe only:** public pages in headless Chromium (Playwright), JPEG q60 captures at 1440 and 390 in
`.work/ia/` (local, never committed), measured by a script (`.work/ia/measure.ts`: nav items, top-level sections, words per
section, computed type sizes, footer links; `.work/ia/hover.ts`: running animations, CSS transitions, the same page under
`prefers-reduced-motion: reduce`). Nothing was created, edited or submitted on any site. No code, text, image, logo or brand was
copied; cal.com's source (AGPL) was not read. Words are counted from `innerText` and include the footer.

**The logged-in cal.com app** could not be opened by automation: cal.com refused the login in the headed test browser (email and
Google). It was not worked around. Deepanshu took 11 read-only screenshots from his own browser (Home with Ask, Links, Events,
Bookings, Availability, Teams, Apps, Routing, Workflows, Settings; 1920 wide, dark theme). Not covered: Insights, the collapsed
sidebar, the phone layout, keyboard shortcuts. Those rows below say "not observed".

**Wealthsimple** answered our headless browser with a security block page ("What happened?"); it was not retried. Nine other
sites were read, three more than the six required.

## 1. cal.com, public site

| Measure | 1440 | 390 |
|---|---|---|
| Top nav | 10 items: 5 mega-menu groups (Products, Use cases, AI, Features, Resources), Enterprise, Pricing; right: Talk to sales, Sign in, Get started (ink pill) | logo, Get started, menu button |
| Landing | 14 sections, 2,657 words, 18,004 px tall | 14 sections, 2,291 words, 22,907 px |
| Type | h1 80 px/700, section h2 56 px/700, lede ~19 px | h1 42 px, h2 34 px |
| Footer | 138 links in 12 columns, status line, language, app badges, "Ask AI about ...", compliance badges | same, stacked |
| Motion | 15 running animations on load (3 infinite: 6.1 s, 6.8 s, 18 s; one-shots 200 ms, 1.2 s, 2 s), 528 elements with transitions | under reduced motion: 0 running animations |

Section order of the landing page (words): hero, a headline with inline image chips, one lede line, two sign-up buttons and
"no credit card required" (48); the real product in a browser frame plus a logo row (114); the problem in one sentence with three
tabs (358); the AI assistant, tabs per surface, a screenshot of the app with its sidebar and an Ask panel (237); a feature grid of
six cards, each a title and one sentence (224); integrations (144); agents and MCP with a prompt box and "Read the API docs" (157);
case studies (202); a testimonial wall (436); two sub-products (66, 168); enterprise with badges (89); FAQ accordion (80); closing
call to action (45). Median about 160 words per section.

Every section after the hero has the same shape: a small tag, one 5 to 10 word headline at 56 px, one sentence, one visual.

- **Pricing**: h1 56 px, four plan cards (Free, $12, $28, Custom), a yearly toggle with "Save 25%", feature lists whose dotted
  underlines open definitions, a small line under each call to action. 967 words.
- **Trust** (`/security`): a one-sentence claim naming the certifications, a badge row, then a ledger of documents, each row a
  name and a "Download" button. 1,775 words, one page.
- **Docs**: a separate shell with a left navigation; h1 36 px/600.
- **Mobile menu**: a full-height sheet: the five groups with chevrons, Search, Enterprise, Pricing; Sign in, Get started and Talk to
  sales pinned at the bottom.
- **Mega-menu** (hover, Products): five image cards (title, "New" tag, one line) and a release strip.

**Borrow**: the clean split between a marketing site and the app; one idea per section, a headline and a sentence; the trust page
as a ledger of documents to download (ours: the evidence-pack verifier, the open package, the methodology, the hashes); the
mobile menu sheet with account actions pinned at the bottom; showing the real product in the hero; reduced motion honoured.
**Avoid**: 14 sections and 2.6k words (our v3.1 landing is 179 words); the logo row, testimonial wall and ratings (FillScore has no
customers; DESIGN §9 forbids fake testimonials, logos or numbers); infinite marquees (DESIGN §7 "nothing loops"); a 138-link
footer; mega-menus (we have about six public pages); the floating chat bubble.

## 2. cal.com, the app (from Deepanshu's screenshots)

| Part | What is there |
|---|---|
| Sidebar | Fixed left column, about 19% of a 1920 px window. Top: wordmark, search icon, avatar with a status dot. **10 items, no group labels**, icon + word: Home, Links, Events, Bookings, Availability, Teams, Apps (chevron), Routing, Workflows, Insights (chevron). Apps expands in place (App store, Installed apps); no flyouts. Active item: a filled row. |
| Sidebar bottom | View public page, Copy public page link, Settings; under them the copyright and version (`v7.0.3-h`) in small grey. |
| Content | An inset panel with rounded corners beside the sidebar; bottom right of the window a small "Agent" link. |
| Page header | Title (bold, about 20 px at 1000 px scale) + one sentence under it; right: search field and a primary "New" (light pill). No breadcrumbs. |
| Lists | Rows in one bordered block: name, a muted path, chips (duration, "Hidden"); right: switches and icon buttons, an overflow menu. |
| Tabs and filters | Bookings: segmented tabs (Upcoming, Unconfirmed, Recurring, Past, Canceled) + "Filter"; right: "Saved filters" and a list/calendar view switch. |
| Empty states | A small icon in a square, a bold title ("No upcoming bookings"), two lines of plain text, at most one button; Workflows adds template cards under it. Teams shows an upsell instead (avoid). |
| Settings | Its own shell: "Back" replaces the app sidebar; a grouped sidebar (personal, Security, Billing, Developer) and an overview of cards (icon, title, one line), search at the top right. |
| Home | "New chat" menu at the top left; centred "Ask Cal.ai" (about 24 px bold), one input "Ask anything..." with a send button, **three suggestion chips** under it, each a complete request ("Change the length of ...", "Create a 30 minute intro call event type", "How do I connect Google Calendar?"). Nothing else on the page. |
| Collapsed sidebar, phone, shortcuts, Insights | Not observed. |

**Borrow**: a flat sidebar of about ten nouns with no group labels; the account's public artefact and Settings pinned at the
bottom with the version; title + one sentence headers; empty states of one icon, one title, two lines, one action; Settings as its
own shell with "Back"; Home as one Ask box and three full-sentence chips. **Avoid**: an empty Home with nothing but the Ask box
(FillScore's first answer is the account's figures, so they sit under the box); upsell panels in place of empty states; icon-only
actions without labels; the "Agent" corner link (ours would duplicate the Ask box).

## 3. Other references (public pages)

| Site | Nav (1440) | Landing | What to borrow | What to avoid |
|---|---|---|---|---|
| linear.app | 8 (Product, Resources, Customers, Pricing, Now, Contact, Log in, Sign up) | 10 sections, 1,337 words, h1 64 px/510, 46 footer links | the product shown as itself, dense and quiet; a changelog as a first-class page ("Now") | the dark ground (DESIGN §10); first viewport black until scripts run |
| mercury.com | 9, with "Launch demo" beside "Open account" | 13 sections, 1,641 words, h1 49 px/480 | **a demo entry next to the sign-up**, the same weight; a legal line about what the company is not ("not an FDIC-insured bank") in the first viewport | full-bleed photography; a gradient sky |
| ramp.com | 10 | 1,480 words, h1 64 px/400, 136 footer links | one input as the call to action; "We've got the receipts" (receipts as proof) | the live counter strip "receipts processed 1,437,803 ..." in the hero: running totals that cannot be checked |
| stripe.com | 7 | 8 sections, 2,339 words, h1 48 px/300 | each product block names one job in a sentence | "Global GDP running on Stripe: 1.75403493%" (8 decimals: false precision); the four-figure stat strip "135+ / US$1.9tn / 99.999% / 200m+" (DESIGN §10 bans it) |
| docs.stripe.com | 9 category tabs | 400 words, h1 32 px/700 | docs as a separate shell: search with "Ask AI" in the top bar, category tabs, a "Try it out" block that runs a real call | the 9-tab bar (we have four docs) |
| vercel.com | 7 | 124 words seen (the page renders most content late), h1 64 px/400 | very few words above the fold; "Deploy now" + "Talk to sales" | logo row |
| posthog.com | in a desktop-OS frame | 913 words, h1 36 px/800 | **"Ask PostHog anything" box with chips** in the hero (Coding, Product analytics, SQL, Session replay) and the app shown as windows | the playful OS metaphor and illustration (not an audit's voice) |
| copilot.money | 6 | 10 sections, 2,545 words, h1 64 px/600 | **one figure per card with its unit and its comparison in words** ("$183 left" under a ring; "$3,221 left out of $10,400 budgeted"); a smaller superscript `$`; a contextual chip beside a figure ("Explain the increase"); privacy as its own section | green/red money and pastel gradients (DESIGN §3: money is never coloured good or bad) |
| koyfin.com | 6 | 17 sections, 1,287 words, h1 88 px/500 | the product screenshot first, tables with units in the column heads; "Ask Koyfin AI" pinned in the app | a privacy banner covering the screenshot; hero-metric tables of many same-weight numbers |

**How the marketing site differs from the app**, in all nine: the marketing nav is 6 to 10 items across the top with sign-in and
a primary action at the right; the app has a left sidebar (Linear, Koyfin, PostHog, cal.com) and no marketing links. Docs are a
third shell (Stripe, cal.com). The app is shown on the marketing site as a framed picture of itself, never as a live copy.

## 4. Number presentation: what the references teach

1. **One headline figure per view, with its unit and period in words** next to it (Copilot "$183 left", cal.com Insights
   "130 total events" in a ring). Large numbers are rounded to what is meaningful; the exact value is one step away.
2. **A comparison written as a sentence, not a colour**: "out of $10,400 budgeted", "from last period". Arrows and green/red
   carry it on Copilot and Koyfin; ours must use words and shape only (DESIGN §3, §8).
3. **Partial and empty data say so in words** (cal.com: "No upcoming bookings" with a sentence; Stripe docs: "Sign in to load your
   test keys"). Nobody shows a zero in place of "not measured"; ours already has ValueState for this.
4. **Provenance is a line, not a page**: Mercury's legal line in the first viewport, Stripe's "test mode" banner. Ours: the
   synthetic line and NOT SIGNED stay visible.
5. **Progressive disclosure**: cards show a figure and a sentence; the table is a click away (Koyfin, cal.com Insights).
6. **False precision and running counters** (Stripe's 8-decimal GDP share, Ramp's ticking totals) are what to avoid.

## 5. Interactions (step 1d)

Sources: gsap.com (showcase page rendered blank until scrolled in our headless run; the docs and the GSAP skills were used for the
technique facts), motion.dev/examples (526 patterns; Spotlight, filters by platform), 21st.dev, and three Awwwards Sites of the
Day: artemiilebedev.com (mono index of projects, "click and hold", "press Esc for effects", GSAP + Lenis; under reduced motion 2
animations still ran and Lenis stayed on: it does not honour the setting), 197historiasilustradas.com (an intro paragraph with
a "[ skip ]" control; 13 transitions, no running animation), sweet-tape.com (a paper tag "PULL ME" at the top right, a tape-roll
product as the hero, display type 293 px; Lenis on, and off under reduced motion).

**Licences.** GSAP 3.15.1 (standard "no charge" licence, read and recorded in `THIRD_PARTY_LICENSES.md`), Motion 14.14.0 (MIT;
Motion+ is a paid product and is not used), Lenis 1.3.27 (MIT), NumberFlow 0.6.2 (MIT), Vaul 1.1.2 are already pinned
dependencies. **21st.dev**: its Terms (https://21st.dev/terms, updated 2026-07-20) grant no licence to copy component code
("view and use the content solely through the official 21st.dev platform"; no redistributing "without authorization"), and the
component page read (Spotlight Card) shows "License: unknown". **No 21st.dev code is copied**; it is an idea source only, so
nothing is added to `THIRD_PARTY_LICENSES.md`. No new runtime dependency is proposed.

Shortlist that fits Tape & Receipt (each uses dependencies already installed; bundle figures are measured in step 3):

| Interaction | Where | How often a person meets it | Duration, easing | Reduced motion | Touch | New JS | Licence |
|---|---|---|---|---|---|---|---|
| **Receipt prints**: the paper feeds out of the slot and its lines print one by one (clip-path on the paper, each line revealed in order) | the order receipt; the landing's demo receipt | first receipt of a session (`useFirstEntry`); later opens 300 ms plain | paper 420 ms on `cubic-bezier(0.32,0.72,0,1)`; lines 18 ms apart, at most 360 ms in all; tear back 220 ms | finished receipt at once | same, from the bottom (Vaul) | 0 (CSS keyframes + existing Motion) | ours |
| **Ask answer prints**: the Ask reply arrives as a receipt slip whose lines print in order; figures appear with their line, never counted up | app Home (Ask) | each answer | 240 ms slip, lines 30 ms apart | text at once | same | 0 | ours |
| **Sidebar active mark**: the pen underline moves to the chosen item | app sidebar | each navigation | 180 ms ease-out `cubic-bezier(0.23,1,0.32,1)` | jumps | none on the phone bar (instant) | 0 (CSS transform) | ours |
| **Page change**: content fades in 8 px | app pages | each navigation | 160 ms in, no exit | none | same | 0 (CSS) | ours |
| **Pen cursor on the landing tape**: a small pen nib follows the pointer over the hero tape and leaves no mark | landing hero only | once per visit, fine pointers only | follows with a 90 ms lag (quickTo) | off | off (no hover) | 0 (GSAP already loaded on the landing) | GSAP standard |
| **Stamp press** (exists): GRADED stamp presses once | overview first entry, landing | once per session per account | 420 ms | finished stamp | same | 0 | ours |
| **Number reveal after an action** (exists, NumberFlow): figures roll only after a switch of account or period | overview, Home figures | on user action only | NumberFlow default | plain swap | same | 0 | MIT |
| **"Pull" tag for the demo** (idea from a paper tag): a printed tag at the top of the landing pulls the demo receipt down | landing | once | 300 ms | link only | tap | 0 | ours |

Rejected: scroll-hijacking (Lenis on app pages), infinite marquees and tickers, cursor trails, scrambled or counted-up numbers
(DESIGN §7 "the number rule"), "click and hold" gates, any motion on tables, filters and keyboard actions (DESIGN §11).

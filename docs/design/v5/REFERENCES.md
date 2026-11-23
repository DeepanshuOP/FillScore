# Design v5 references (orders of 2026-11-24, step 2)

What to take, from where, why, the license and the bundle cost. Sites were opened and measured on 2026-11-23 with
`frontend/e2e-shots/refs5.ts` (Chromium, 1440x900 and Pixel 8 with touch, device scale 1; no login, nothing clicked but a cookie
banner's reject or close). The captures are in `refs/` (`<name>-1440.jpg`, `<name>-phone.jpg`); the measures in `refs/measures.json`.
Library facts were read the same day from the official sites, the npm registry and bundlephobia (one read-only research subagent,
Sonnet; each fact with its source below). Nothing here is installed yet: adoption is a decision for Deepanshu (PROPOSAL §9).

## 1. Sites

### 1.1 Measured type (refs/measures.json; "common" = the sizes that carry the most characters in the first three screens)

| Site | Body | Most text set at | Smallest | Text under 12 px | Letter-spaced caps |
|---|---|---|---|---|---|
| cal.com (home, pricing, docs) | 16 | 13 to 16 px | 10 to 12 | 0 to 11 nodes | 0 to 2 |
| Stripe docs (dashboard basics) | 14 | 16 / 14 px | 12 | 0 | 0 |
| Resend | 16 | 14 / 18 px | 12 | 0 | 0 |
| Plausible live dashboard | 16 | 14 / 16 / 12 px | 12 | 0 | 4 (12 px tile labels) |
| Mercury, Vercel, Linear, Ramp, Dub (marketing, with app pictures drawn in DOM) | 16 | 12 to 24 px | 5 to 12 | 0 to 68 (the drawn app pictures) | 0 |
| Kaiko, Amberdata, BestEx Research | 16 | 16 px | 12 to 14 | 0 | 0 to 15 (headings, not under 12) |
| TradingView chart | 14 | 12 to 14 px | 10 | 52 (axis ticks) | 0 |
| **FillScore today** (AUDIT.md, 200 states) | 16 | 13 to 16 px, tables and labels in 11 to 13 px mono | **10** | **3,670** nodes on 14 of 20 pages | **1,184** (280 under 12 px) |

The products people read for work set body text at 14 to 16 px and nothing below 12 px; where uppercase appears it is a 12 px tile
label, never a 9 to 11 px letter-spaced run. Small type appears only inside drawn product pictures on marketing pages.

### 1.2 What each one does, and what to take

| Reference | Navigation | Page header and period | Tables, numbers, charts | Empty, onboarding, settings, motion | Take |
|---|---|---|---|---|---|
| **cal.com app** (Deepanshu's login, captures private in `.work/refs-private/`) | left sidebar of 10 nouns with a 16 px icon each (Home, Links, Events, Bookings, Availability, Teams, Apps, Routing, Workflows, Insights); one group expands in place (Insights: 6 sub-pages); a bottom group (View public page, Copy public page link, Settings); search and avatar at the top | title (20 px, bold) and one plain sentence under it ("Configure different links for people to book on your calendar."); search and one dark primary button "New" on the right | list rows in one bordered card: name, a muted path, small duration chips, a switch and icon buttons on the right | phone: a top bar (logo, search, avatar), tabs that scroll sideways (Upcoming, Unconfirmed, Recurring, Past), Filter and Saved filters, skeleton rows while loading, a floating icon bar at the bottom, dialogs become bottom sheets; locked features show a greyed preview with "Try it for free" | the whole shell: sidebar of nouns with icons, header sentence, one primary action, list card, phone top bar plus bottom bar, sheets |
| cal.com marketing (`cal-home-*`) | top bar of 7 items with menus, Sign in, a dark "Get started" | headline at display size with small inline pictures inside the words | | the product shown inside a drawn desktop | headline with an inline object (our receipt or stamp could sit in the line) |
| Linear (`linear-home-*`) | the app picture on the landing: workspace switcher, Pulse, Inbox, My issues, Reviews, then a "Workspace" group (Initiatives, Projects, More) and Favorites | | | dark, quiet; the product itself is the hero, under a two-line headline | a quiet sidebar with groups titled in plain words; the product as the hero |
| Stripe dashboard docs (`stripe-dashboard-docs-*`, page text read 2026-11-23) | "the first section of the sidebar is where you can access and act on information related to your balances, transactions, customers, and products" (Home, Balances, Transactions, Customers, Product catalogue) | "The Home page provides analytics and charts about your business performance. It also surfaces important notifications"; widgets added and removed under "Your overview" | Transactions "can filter ... or export" | (period comparison and test-mode banners are Stripe features not described on this page; not relied on) | the sidebar's first group = the things you act on; Home = a few chosen charts plus the notices that need attention; filter and export on every list |
| Vercel, Resend, Dub | top bars on the captured marketing pages | | Resend's page: 14 px text, mono only for code | | mono only for ids, keys, hashes and code |
| Mercury, Ramp (`mercury-home-*`, `ramp-home-*`) | top bars | | their product pictures on the landing set labels at 10 px (Ramp: 193 characters at 10 px; Mercury's phone page: 68 text nodes under 12 px) | | a counter-example: small type is tolerable inside a picture of the product, not in the product |
| **Plausible** (`plausible-live-*`) | site switcher, Filter, "Last 28 days" picker in one row | the picker is a plain button with a calendar icon | six tiles: label (12 px caps), value (bold), change against the previous period with an arrow and %; one area chart with labelled axes (dates, counts); cards with tabs (Channels, Sources, Campaigns) and tables with a light bar behind each row's value | no sign-up needed to read a public dashboard | the tile row with "against previous period", the in-row bars, tabbed cards, labelled axes |
| PostHog (`posthog-home-*`) | | | | playful marketing; dense type in drawn pictures | not for the app |
| TradingView (`tradingview-chart-*`) | | | price on the right axis, time below, crosshair with a value label | | the receipt's price chart: right price axis, crosshair label, markers for our fills |
| Koinly, CoinTracker | Cloudflare bot checks on desktop (captures deleted); the phone pages loaded (`koinly-home-phone`, `cointracker-home-phone`) | | | | only their phone marketing pages were seen; nothing about their apps is claimed here |
| Talos, Kaiko, Amberdata, BestEx Research (`*-1440`, `*-phone`) | top bars with "Request a demo" (Talos: Solutions, Clients, About, Careers, Provider Network, Insights) | | the public pages sell; the TCA products are behind demos and were not seen | Talos: dark generative curves behind a one-line claim; cookie dialog with "Deny all" first | nothing for the app; for the docs, the vocabulary institutions use (arrival price, implementation shortfall, benchmark) next to FillScore's plain words |
| Awwwards SaaS and finance listings (`awwwards-*`) | the listing pages themselves (thumbnails of winners) | | | the listing page sets 13 to 15 px; the winners were not opened one by one | marketing motion ideas are taken from the skills' guidance and the existing landing, not claimed from specific winners |

## 2. Libraries

Short names: NPM = `https://registry.npmjs.org/<pkg>/latest`; BP = `https://bundlephobia.com/api/size?package=<pkg>@<version>`.
Sizes are min+gzip of the whole package as bundlephobia measures it; what a route really pays depends on what it imports, and the
proposal's budgets (PROPOSAL §8) are checked with `scripts/first-load-js.mjs` on a real build, not with these numbers.

| Item | License (notice) | Version read | Cost | Take for FillScore | Sources |
|---|---|---|---|---|---|
| shadcn/ui (already used: `components/ui/`) | MIT (none needed in the app) | CLI, copy-paste | only the copied file and its deps (Radix, recharts for `chart`) | the `sidebar-07` pattern (collapses to icons), the `dashboard-01` page layout (header, cards, chart, table), the `chart` wrapper (Recharts v3, colours from CSS variables) | ui.shadcn.com/blocks; /docs/components/chart; /docs/components/sidebar; github LICENSE.md |
| Tremor (`@tremor/react`) | Apache-2.0 (NOTICE and terms) | 3.18.7 | not measured | **not adopted**: peers declare React 18, not 19; its charts are Recharts underneath, which shadcn's wrapper already gives | NPM; github.com/tremorlabs/tremor |
| Origin UI (now coss.com/ui) | **not verified** | n/a | copy-paste (Base UI) | **not adopted** until a license is found: originui.com redirects to coss.com/ui, which names no license on the page read | originui.com (301); coss.com/ui |
| Magic UI | MIT for the free repo (Pro is paid, $199, not used) | n/a | copy-paste; motion | marketing only, one or two pieces at most (e.g. a number ticker is not needed: NumberFlow is in use) | github.com/magicuidesign/magicui |
| Aceternity UI | **not verified** (free tier stated, license page 404) | n/a | copy-paste | **not adopted**: no license text found | ui.aceternity.com/pricing |
| 21st.dev | **not verified** (per-component license not shown on the page read) | n/a | copy-paste | only a component whose page shows an MIT or Apache license; none chosen | 21st.dev |
| Motion (`motion`, already used through LazyMotion) | MIT | 14.14.0 | `m` + `LazyMotion` about 5 kB initial, plus `domAnimation` 24 kB loaded later; `useAnimate` mini 3.3 kB | app motion stays here: 120 to 200 ms state changes, sheet and dialog entries | NPM; motion.dev/docs/react-reduce-bundle-size |
| GSAP + ScrollTrigger (already used on the landing, dynamic import) | GSAP Standard "no charge" license, owned by Webflow (not OSI; keep its notices; no visual animation builder competing with Webflow) | 3.15.1 | 27.4 kB gzip whole package (BP); plugins imported one by one | marketing scroll story only (pin, scrub, SplitText, DrawSVG); never in the app | gsap.com/standard-license; NPM; BP |
| Lenis (already used on the landing) | MIT | 1.3.28 | 5.5 kB (BP) | marketing only; off in the app (inner scroll boxes) | NPM; BP |
| View Transitions | web standard | n/a | 0 kB | page-to-page cross-fade on the marketing site; in the app only the list to receipt hand-off. Same-document support: Chrome/Edge 111, Safari 18, Firefox 144 (caniuse, 93% global). Next.js App Router: React 19.3 `<ViewTransition>`, no config (guide updated 2026-11-18); without support the page simply changes | caniuse.com/view-transitions; nextjs.org/docs/app/guides/view-transitions |
| TradingView lightweight-charts | Apache-2.0; NOTICE "TradingView Lightweight Charts™ Copyright (с) 2025 TradingView, Inc. https://www.tradingview.com/"; the docs require naming TradingView as the product creator; `attributionLogo` (default true) shows their logo on the chart | 5.3.0 | 61.9 kB (BP) | the receipt's price-against-prints chart (time axis, price, fill markers) if Deepanshu accepts the logo or a NOTICE line and link; otherwise a small SVG chart of our own (decision D4) | NPM; github NOTICE; LayoutOptions docs; BP |
| Recharts (through shadcn `chart`) | MIT | 3.11.1 | 177 kB whole package (BP); a bar or area chart imports far less | bars, stacked bars, small area charts on Overview and Home; loaded on the chart's route only | NPM; BP |
| react-day-picker | MIT | 10.0.2 (v10, not v9) | 19.8 kB (BP); date-fns 4 and @date-fns/tz | the custom range of the period picker (shadcn Calendar wraps it, `mode="range"`); load on open | NPM; BP; ui.shadcn.com/docs/components/calendar |
| nuqs | MIT | 2.10.3 | about 6.1 kB (its site) | period, comparison, filters and tabs in the URL (shareable views, back button works) | NPM; nuqs.dev/docs/adapters |
| lucide-react (already used) | ISC | 1.78.0 (repo has 1.75.0) | per icon | every icon, including the sun/moon of the theme control | NPM |

Not found: no official shadcn block for "period with comparison to the previous period". It is built from Popover + Calendar
(range) + a preset list; the previous period is computed by the server from the same rule (PROPOSAL §5.3).

Unverified (stays out until checked): Origin UI, Aceternity and 21st.dev licenses; Tremor's React 19 support; tree-shaking of most
packages; Baseline status of View Transitions.

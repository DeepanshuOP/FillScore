# IA v4: a marketing site and an app (fifth order of 2026-11-22)

Proposal for Deepanshu's choice. Read in this order: `PROPOSAL.md` (structure, inventory, rules, budgets), `REFERENCES.md`
(what was observed and measured), then the images below. Production screens are unchanged.

**Status (2026-11-23): built in production.** The prototype described below was deleted when IA v4 was built (production replaced it, and
its tests asserted a view model the order changed). The images stay as the record of the proposal; the built screens are in `built/`
(see `built/README.md`). The recorded Ask answers now live at `frontend/app/lib/ask/ask-recorded.json`.

**Prototype (deleted):** `/design-lab/ia4` (development only; 404 in production, `e2e/design-lab-guard.spec.ts`). It ran with
`cd frontend && npm run build && DESIGN_LAB=1 PORT=3101 npm run start`, then open `/design-lab/ia4/site` and `/design-lab/ia4/app`.
Every figure comes from committed fixtures through the production model functions (`frontend/app/design-lab/ia4/data.ts`,
tested in `data.test.ts`); the Ask answers are the real Ask agent's recorded output on demo-moderate
(`frontend/app/design-lab/ia4/fixtures/ask-recorded.json`, recorded by `ml-service/scripts/record_ask_fixture.py`, shown verbatim and
labelled "Recorded answer, not live").

## Images (JPEG q60, from `frontend/e2e-shots/ia4-shots.ts`, Chromium, deviceScaleFactor 1)

| File | What it shows |
|---|---|
| `site-1440.jpg` | Marketing top bar (5 items, Log in, Open the demo) over today's tape hero, unchanged |
| `site-demo-1440.jpg` | Viewport 2: the demo entry, three traders as printed slips (orders and fills from the fixtures) and the footer's start |
| `site-390.jpg` | The same at 390: wordmark, Open the demo, Menu |
| `site-menu-390.jpg` | The phone menu sheet: the four items, account actions pinned at the bottom |
| `app-home-1440.jpg` | App shell: the sidebar of nine nouns with the pen underline, provenance and period at its top, versions at its bottom; the page header's provenance line; Home: Ask FillScore, four chips, then the key figures (01 total $52.08 with its sentence and the stamp, 02 the strip) |
| `app-ask-printing-1440.jpg` | 260 ms after a chip: the receipt slip feeding out and its lines printing left to right |
| `app-ask-1440.jpg` | The printed answer: recorded label, question, the LLM heading, the answer, "Read: costs. Used 2 model calls.", the model and date, values in a fold |
| `app-home-390.jpg` | Phone: provenance and account above the title, chips wrap, the bottom bar Home, Overview, Orders, More |
| `app-more-390.jpg` | The More sheet: the other six sections, then score card, Methodology, Settings, versions, Log in |
| `app-home-320.jpg` | 320 px: the Ask button moves under the box, the four bar words stay whole |
| `app-ask-390-reduced.jpg` | Reduced motion: the slip is finished at once (the degraded answer with its code-built note) |

## Checks (2026-11-22)

`e2e-shots/ia4-shots.ts`: 10 states, horizontal overflow 0 in each, axe serious or critical 0 in each; the slip's animation is
`ia4-feed` with motion and `none` under reduced motion. First Load JS (gzip, `scripts/first-load-js.mjs`): `/design-lab/ia4/app` 312.0 kB
against 308.3 kB for the near-empty lab index (the shell and Ask home add 3.7 kB; budget 15 kB); `/dashboard` 389.6 kB, unchanged by
this order. The prototype adds no dependency.

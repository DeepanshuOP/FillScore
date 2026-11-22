# IA v4 as built (sixth order, 2026-11-23)

Sixteen captures of the production build, from `frontend/e2e-shots/qa3.ts` (pass 6, Chromium, JPEG quality 60, fixture data from the offline
demo build; no database and no network). The proposal's images are in the folder above; the prototype they came from was deleted when
production replaced it.

| File | What it shows |
|---|---|
| `landing-hero-start-1440.jpg` | The marketing bar (How it works, Demo, Verify, Docs, Log in, Open the demo) over the hero. The tape carries its printed label, "One demo order, Jan 28, 2024, synthetic trader, real prices" (the order's own date, read from the fixture). The secondary button reads "How it works". |
| `landing-hero-start-390.jpg` | The same on a phone: wordmark, Open the demo, Menu. |
| `site-menu-390.jpg` | The phone menu sheet: the four items, the account actions pinned at the bottom. |
| `demo-1440.jpg` | `/demo`: three printed slips (name, line, orders, fills, period, total bps from the API, the synthetic line). |
| `how-it-works-1440.jpg` | `/how-it-works`: the three printed objects (the tape, the receipt, the stamp), moved off the landing. |
| `app-home-1440.jpg` | App Home: the sidebar of nine nouns with the pen underline and its bottom group, the page header (provenance chip, account, period, venue, actions), "Ask FillScore" with four recorded questions, then the key figures. |
| `app-home-ask-1440.jpg` | A recorded answer printed as a slip: "Recorded answer, not live", the scope line, the language-model heading over the model's text, the credit line. |
| `app-home-ask-degraded-390.jpg` | A degraded recorded answer at 390 px: the one-line note, "Model calls: 2 · answer not used", no model name, no model heading. |
| `app-home-320.jpg` | Home at 320 px: the Ask chips one per row, the four-word bottom bar whole. |
| `app-more-sheet-390.jpg` | The More sheet: the six other nouns with a one-line gloss each, then the account group and the versions. |
| `app-overview-1440.jpg` | The overview inside the frame, unchanged apart from the header (the "sample data" line now prints once, in the header). |
| `app-orders-320.jpg` | The Orders ledger at 320 px: placed time and cost, the symbol under the time. |
| `app-orders-receipt-1440.jpg` | The order receipt (a dialog on a desktop; a drawer on a phone). |
| `app-fills-1440.jpg` | Fills with its tabs Ledger and Patterns. |
| `app-check-390.jpg` | The broker-file check, open signed out: the banner says the check itself needs a signed-in account. |
| `carbon-home-1440.jpg` | Home with a recorded answer in the Carbon copy theme. |

## Checks behind them (2026-11-23)

- `qa3.ts`: 110 states (36 marketing and app states; apps also at 320; Carbon copy for Home, Overview, the Orders receipt and Council):
  horizontal overflow 0, text overlaps 0, axe serious or critical 0, landing CLS 0 at 1440 and 390 (limit 0.05). The same set with
  reduced motion (`QA_REDUCED=1`) captured the finished frames.
- `keys4.ts` (keyboard only): all nine sidebar nouns reached by Tab with a focus outline; ⌘K opens, goes to a section, Escape closes;
  Enter opens the order receipt from a row and Escape returns focus to the row; a recorded chip works with Enter; the phone's More and
  Menu sheets open with Enter, close with Escape and return focus to their buttons.
- `break4.ts` (break-ui): Home, Orders, Fills and Check with long values, no orders and one order at 390, 320 and 720 px (about 200% zoom):
  48 combinations, no overflow, overlap or axe problem.
- `ask-print.ts`: chip order (answers that passed first, a degraded one last); the paper and the first line of the slip start in the same
  frame; nothing animates under reduced motion.

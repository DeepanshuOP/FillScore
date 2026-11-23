# IA v4 polish (seventh order, 2026-11-23)

Eight captures of the production build after the polish and the review fixes, from `frontend/e2e-shots/qa3.ts` (pass 8, Chromium, JPEG quality 60, fixture data
from the offline demo build; no database and no network). The sample-file result in `app-check-sample-1440.jpg` comes from a 3-fill mock of the server's answer;
the real 24-fill result is described in `docs/research/LOG.md` §AM.

| File | What it shows |
|---|---|
| `landing-hero-start-390.jpg` | The hero's phone receipt: "FEES (PUBLISHED RATE)" (A1). Nothing repeats the synthetic line under the buttons: the tape's label and the receipt print it (A3). |
| `app-orders-receipt-1440.jpg` | The order receipt: the fee line reads "Fees (published rate)" and the unfilled line "Unfilled orders (modelled)" (A1). |
| `app-fills-1440.jpg` | Fills (A2): heading "Fills", "607 fills on Binance Spot", the sentence that says which measures are not computed and why, time under "TIME (UTC)" as `YYYY-MM-DD HH:MM:SS`, full symbols, and no slippage, score or grade column and no average-score tile. |
| `carbon-fills-1440.jpg` | The same page in Carbon copy; the theme control reads "Theme: Carbon copy" (A4). |
| `app-check-sample-1440.jpg` | "Try the sample file" (A5) on the broker-file check, signed out: the result is labelled "Sample file: synthetic fills, real prices"; the banner says checking your own file needs an account and the sample does not. |
| `app-overview-1440.jpg` | The page header at 1440 px: Method, Copy share link and Download report carry their text (A4); the sidebar foot reads "Theme: Paper". |
| `app-overview-390.jpg` | The same header on a phone: icons only, each named by an aria-label with a tooltip, targets of at least 44 px (A4). |
| `app-home-ask-1440.jpg` | A recorded Ask answer written by the typed-claims path (B4): the line "The model chose which measured values to state; code wrote the sentence and placed the figures", no language-model heading, the credit "Claims chosen by <model>". |

## Checks behind them (2026-11-23)

- `qa3.ts` pass 8: 117 states (marketing and app pages at 1440 and 390, app pages also at 320, Home, Overview, Orders receipt, Council and Fills also in Carbon copy,
  the sample file signed out and in demo mode): horizontal overflow 0, text overlaps 0, axe serious or critical 0, landing CLS 0 at 1440 and 390 (limit 0.05).
- `keys4.ts` (keyboard only): 29 of 29, including the header actions (text label at 1440, focus outline, Enter opens the Method sheet and Escape returns focus), the theme
  switch (Space toggles, `aria-checked` follows), icon-only actions with tooltips and 44 px targets at 390, and "Try the sample file" reached by Tab and run with Enter.
- `break4.ts` (break-ui): Home, Orders, Fills and Check with long values, no rows and one row at 390, 320 and 720 px: all OK.
- `ask-print.ts`: 13 of 13 (chip order, the claims line, no language-model heading over code's sentence, paper and first line start together, nothing animates under reduced motion).

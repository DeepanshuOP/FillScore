# Demo script and video plan

Two cuts from one recording: a 90-second cut for the top of the README and social posts, and a 3-minute walk-through for interviews. Record
on the live demo accounts (nothing private on screen). Every sentence below is a statement the product supports today; the limits scene is
part of the video, not an apology.

## Before recording (checklist)

- The live site shows the three rebuilt demos (`demo-moderate` is the one used below) and v2.3.0. Open `/dashboard?userId=demo-moderate` once so the API is awake (the free instance sleeps).
- `GET /api/evidence/public-key` answers with fingerprint `ba11aa53c4961be4`.
- Save one signed pack from the demo account first (the address is in the 1:00 row), to use on the verify page.
- Browser: a clean profile, zoom 110%, no bookmarks bar, no personal tabs. Dark system theme to match the app.
- Do not show `.env` files, the Render dashboard, or any key.

## The 90-second cut

| Time | On screen | Say (plain, past tense, no advice) |
|---|---|---|
| 0:00 | The dashboard header for `demo-moderate`: grade and the dollar breakdown | "This is a sample account. Its trading behaviour is synthetic; every fill price comes from real public Binance prints." |
| 0:12 | The v2 panel: execution cost, fees, unfilled orders, in dollars and basis points | "FillScore measured what each order cost against the market at the moment it arrived: the spread paid, how far the price moved with it, and what unfilled orders cost." |
| 0:30 | The cost-vs-expected line, then the replay of one order with its sources | "Market orders cost this much against the modelled cost of an order that size in that hour, with an interval, or the page says insufficient data. Each figure in the replay names the stored field and the public data file it came from." |
| 0:50 | The integrity hash line of the v2 panel | "The score has a version and a hash that FillScore can recompute from the stored inputs." (The "verified" badge works for real accounts only: a demo account is not verifiable, so do not click it on a demo.) |
| 1:00 | Save the pack from the API address in a browser tab, `<API host>/api/evidence/pack?kind=scorecard&userId=demo-moderate` (there is no download button yet; M8 designs one); open `/verify`; choose the file; paste the fingerprint | "The pack is signed. This page checks it in the browser; the file is not uploaded. With the published fingerprint it says valid." |
| 1:20 | Edit one number in the pack file, check again: "not valid", file named | "Change one byte and the check names the file." |
| 1:30 | End card: "Audits the past. Never predicts, signals or advises. Open source." | (silence or one line) |

## The 3-minute walk-through (adds these scenes)

1. **What it refuses to do (0:20).** Open a v1-only view on a rebuilt demo: "not computed for this data". Say: "Where a value was not measured, the page says so. It never shows a zero."
2. **The measurement (0:30).** Open `/methodology`. "The method page is generated from the code that scores accounts."
3. **The exceptions queue (0:25).** "Orders that met a stated rule, each with a one-line finding built from stored numbers."
4. **Ask your execution (0:20).** Only on a real account (a demo account runs no model); skip it until a real account exists, or show the tool answers described in the README.
5. **The limits scene (0:25), always last.** Read from the README's "What it does not do": no real user scored yet, cost model fitted on January 2024, the Kraken reading not yet checked against a real file, funding costs and DEX audit not built, zkTLS not ready.

## Optional scenes, only after they have been tried

- The MCP scorecard in a client that supports MCP Apps (not yet tried in a real client).
- The broker-file check with a real Kraken export (none exists yet).
- A real account's first score (the validation harness `ml-service/scripts/validate_real_account.py`). This is the strongest scene once it exists.

## Format notes

Screen capture at 1080p, cursor visible, no music with lyrics, captions burned in (people watch muted), the page URL visible in the first
frame. Put the 90-second cut at the top of the README as a link, not a large file. A recording of a real account must be blurred or made from a test account.

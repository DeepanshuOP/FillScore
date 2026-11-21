# Design v3 "Tape & Receipt": production screens for review

Deepanshu chose direction 1 on 2026-11-20 with four fixes; every production screen is converted (local commits, not
pushed; design v2 stays live until he pushes). The rulebook is `DESIGN.md` at the repository root.

Captured by `frontend/e2e-shots/qa3.ts` from a local production build, headless Chromium, viewport only, JPEG quality
60. **Design v3 fixes, 2026-11-21:** 12 of the 14 images were recaptured in the fixes' final pass (`fix-2`): the two
overviews, the two receipts, both hero end frames, rankings, Council (now the specialist notes), verify, onboarding
refusal and both Carbon copy images. `landing-hero-start-1440.jpg` and `landing-story-end-1440.jpg` are unchanged. Every API call is answered from fixtures cut from the offline demo build
(demo-moderate, January 2024: synthetic trader, real prices); no database, no network.

| Image | What it shows |
|---|---|
| `landing-hero-start-1440.jpg` | Fix 1, frame 0: the headline bottom-left at editorial scale, the tape of the 38 real prints full-bleed and already feeding, the call to action |
| `landing-hero-end-1440.jpg` | The end of the pinned story: the tape at rest on the order, spread bracket, impact bracket, two fee circles, each amount in pen-ink tied to its mark by a leader |
| `landing-hero-end-390.jpg` | The same on a phone: squarish pen loops round the whole fill tiles, clear of every printed line (A6), the fee note's leader ending on the second loop; spread, impact and fees printed under the tape with "synthetic trader, real prices" |
| `landing-story-end-1440.jpg` | Fix 2: the order's $0.25 in pen-ink at display scale, "10.0 bps; fees were 99.99% of it" double-underlined |
| `overview-1440.jpg`, `overview-390.jpg` | The period total as the image (graphite cents), the headline sentence, measured and published-rate fees, the rubber-stamp grade with the frozen v1 line (inside the margin on a phone, A10), the month tape with each order's dollar cost from the server (B1) |
| `orders-receipt-1440.jpg`, `orders-receipt-390.jpg` | The thermal receipt from the real replay API: printing from the slot on a desktop, a Vaul drawer with a torn top on a phone; no chart, "Fills only; the public prints are in the source file." (B3); sentences in sentence case (A5); the ledger behind it lists all 245 orders (A1); NOT SIGNED on a demo |
| `rankings-1440.jpg` | Rankings as a tape, no empty band or doubled rule under the tabs (A4): rank 1 first, pen brackets for the 90% intervals, "too few to tell" below |
| `council-1440.jpg` | The Council's specialist notes (A7): printed paper at natural height, each with its recorded finding verbatim and its cited values as ledger lines (audit field, value, unit) |
| `verify-checked-1440.jpg` | /verify after a check, with the pill "Choose another pack file" button (A9): manifest lines ticked OK, signature, the VALID stamp (fixture pack signed with a throwaway test key, `app/lib/__fixtures__`) |
| `onboarding-refusal-1440.jpg` | A refused key as a returned receipt, in plain words ("Turned on: ... Needed: Reading only."), the last correction matching the form (A8) |
| `overview-carbon-1440.jpg`, `receipt-carbon-1440.jpg` | Fix 3: Carbon copy, warm charcoal with the same orange (contrast-tested) |

Checks: no horizontal overflow, no overlapping text and axe 0 serious or critical on all 22 captured states (the only
overlap the script reports on the story end is a heading's line reveal mid-play); landing CLS 0 at 1440 and 390.
Not covered here: the settings, trades, analytics, methodology, share, auth, 404 and error captures are in
`.work/qa3/pass-3/` and `.work/look/` (local only). Motion was judged in headless Chromium, not on a real phone, Safari
or Firefox.

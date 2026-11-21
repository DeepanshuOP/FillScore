# Design v3.1 "Quiet audit": screens for review

Order of 2026-11-21 (second): design v3 "Tape & Receipt" stays; v3.1 removes the overload (too much text, too many
small captions at once) on the landing page, the overview and the receipt-opening flow. Rules: `DESIGN.md` section 11;
plan and the keep / shorten / note / delete decision for every text block: `docs/design/v31-plan.md`; research:
`docs/design/REFERENCES-v31.md`. Local commits only, not pushed.

Captured by `frontend/e2e-shots/qa3.ts` (pass `v31-2`) from a local production build, headless Chromium, viewport only,
JPEG quality 60. Every API call is answered from fixtures cut from the offline demo build (demo-moderate, January 2024:
synthetic trader, real prices); no database, no network.

## Visible words (`frontend/e2e-shots/words.ts`, whole screen, finished frame)

| Screen | 1440 before | 1440 after | 390 before | 390 after | Type sizes 1440, before to after |
|---|---|---|---|---|---|
| Landing page | 381 | 180 (−53%) | 358 | 179 (−50%) | 18 to 19 |
| Overview | 378 | 107 (−72%) | 377 | 107 (−72%) | 15 to 10 |
| Receipt | 113 | 52 (−54%) | 113 | 52 (−54%) | 8 to 7 |

A word is a token with a letter; figures are counted apart. Explanations moved behind pen margin notes and printed
folds; nothing that guards an invariant was hidden (the synthetic line, ValueState words and reasons, NOT SIGNED, "not
independently measured", NOT COMPUTED). The landing page's type-size count did not fall: the three printed objects and
the giant figures each keep their own printed scale.

## Images

| Image | What it shows |
|---|---|
| `landing-hero-start-1440.jpg` | The hero, unchanged in structure: the headline, the feeding tape (print sides are now tape ticks), a one-sentence lede with a pen mark holding the proof line, and "SYNTHETIC TRADER, REAL PRICES" printed under the buttons |
| `landing-reads-1440.jpg`, `landing-reads-mid-1440.jpg` | The new pinned horizontal chapter: three printed objects (the tape, the receipt, the stamp), each with a masked line title and one sentence, a "1 / 3" counter and one provenance line; start and half-way |
| `landing-demos-1440.jpg` | The demo receipts with no lede and no captions under them; each still says SYNTHETIC TRADER, REAL PRICES |
| `landing-check-1440.jpg` | "Check it yourself": one short sentence with a note, one link, the envelope |
| `overview-1440.jpg` | Chapter 01, the total: the slim sample-data line (the banner is gone), the giant figure, one sentence; the bps behind a note |
| `overview-ch3-1440.jpg` | Chapter 03, where it went: the torn strip from the server's shares, fees at the published rate hatched with "not independently measured" printed, the "Lines" fold (the term table and the All / Market / Limit switch inside); chapter 04 below |
| `overview-ch4-1440.jpg` | Chapter 04, the month: the tape with the pen circle on the largest order ($3.31); chapter 05: the ruler with one sentence, the outcomes as a tally |
| `overview-390.jpg`, `overview-ch3-390.jpg` | The same on a phone: rail labels above the chapters; the tape is printed wider and drags |
| `receipt-from-tape-1440.jpg` | The receipt opened from the tape's circled bar (it grew out of the bar with GSAP Flip): an unfilled limit order, the footnotes folded into NOTES (4), NOT SIGNED |
| `receipt-from-tape-390.jpg` | The same on a phone, after dragging the tape: a Vaul drawer |
| `overview-carbon-1440.jpg`, `receipt-carbon-1440.jpg` | Carbon copy |

## Checks behind these images

- qa3 `v31-2`: 48 states (1440 and 390, Carbon copy at 1440): no overflow, axe 0 serious or critical; one overlap
  reported at 390 on the landing "check" state, the closing heading still rising in its line mask when captured (the
  same state with reduced motion is clean); landing CLS 0 at 1440 and 390.
- Reduced motion (`QA_REDUCED=1`, files `-rm` in `.work/qa3/`): landing, overview chapters and both receipts show the
  finished frame, all clean.
- Keyboard (`e2e-shots/keys31.ts`): 11 of 11 (tape by arrow keys, End, Enter opens the receipt plainly, Escape returns
  focus; a note opens on keyboard focus and closes on Escape without reopening; folds and NOTES by Enter).
- Break-ui (`e2e-shots/break31.ts`): an 8-figure total with a price improvement larger than the costs, one order, no
  orders; at 1440, 390, 320 and 200% zoom: 60 of 60 clean after one fix (a 2 px overflow of the phone stamp at 320).
- Not covered: Safari, Firefox and real phones; touch drag was exercised with a mouse in Chromium, not a finger.

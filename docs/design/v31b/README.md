# Design v3.1, part B: the other screens, fixes F1 to F3

Order of 2026-11-22 (second). Rules: `DESIGN.md` section 11 (including "Part B"). Report: `docs/milestones/M8.md`,
section "Design v3.1 complete". Local commits only, not pushed.

Captured by `frontend/e2e-shots/qa3.ts` (pass `b1`), `look.ts` (Carbon copy) and `break31.ts` from a local production
build, headless Chromium, viewport only, JPEG quality 60. Every API call is answered from fixtures cut from the offline demo
build (demo-moderate, January 2024: synthetic trader, real prices); no database, no network.

| Image | What it shows |
|---|---|
| `f3-hero-before-1440.jpg`, `f3-hero-after-1440.jpg` | F3: the hero at 1440 x 900. Empty paper between the top bar and the tape 247 px before, 110 after; between the tape and the headline 172 before, 109 after. The band under the call to action grew (the content is held inside the first 700 px; the box stays 100svh, CLS 0) |
| `f1-where-it-went-1440.jpg` | F1: the strip has three parts that add up to the total (fees $41.98 hatched and dashed, unfilled orders $10.63, filled orders' execution -$0.53 below the line); the sentence names all three |
| `f2-tape-circle-1440.jpg` | F2: the pen circle on the largest order reads "$3.31, unfilled: market moved away" |
| `orders-1440.jpg`, `orders-390.jpg`, `orders-carbon-1440.jpg` | Orders: the receipt open over the ledger (1440); the ledger on a phone; the ledger in Carbon copy. Seven default columns; the pen note holds how to read it |
| `rankings-1440.jpg` | Rankings: one short caption, the method in a note |
| `council-1440.jpg`, `council-390.jpg`, `council-carbon-1440.jpg` | Council: the cited values sit in a closed fold "CITED FROM THE AUDIT (n)"; the audit fields (paths) are in the note beside it |
| `verify-1440.jpg`, `verify-390.jpg`, `verify-carbon-1440.jpg` | Verify: a checked pack; the long text about keys and the offline check moved into two notes |
| `onboarding-refusal-1440.jpg` | Onboarding: the refused key's receipt, complete and readable (unchanged) |
| `settings-1440.jpg` | Settings: the API-key section says "read-only" in its title and one line; the full text is in the note |

## Visible words (`frontend/e2e-shots/words.ts`, `WORDS_B=1`, whole screen root, finished frame)

See the table in `docs/milestones/M8.md`.

## Checks behind these images

- qa3 `b1`: 48 states at 1440 and 390 (Carbon copy at 1440): no overflow, landing CLS 0 at both widths. Two reports, both
  explained in M8.md (an axe target-size on a margin mark that sits under the sticky bar at the chapter-2 scroll position;
  the known transient overlap of the landing "check" heading at 390, clean with reduced motion).
- Reduced motion (`QA_REDUCED=1`): Orders, Council, Verify, Onboarding refusal and the landing "check" state clean.
- Keyboard (`keys31.ts`): 20 of 20 (the 11 earlier ones plus Orders, Council, Verify, Onboarding).
- Break-ui (`break31.ts`): see M8.md.
- Not covered: Safari, Firefox and real phones.

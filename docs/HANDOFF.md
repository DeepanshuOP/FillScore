# FillScore — Handoff

Short current-state file. A new session reads `docs/agent/MASTER_BRIEF.md`, then `docs/PROGRESS.md`, then this file. **Overwrite "Now" and "Next" at the end of every milestone.** Older history lives in `docs/research/LOG.md`, the ADRs and `docs/milestones/`. Keep this file under about 60 lines.

## What FillScore is
An open-source, independent execution auditor for crypto traders. It **grades past execution** against real public market data and never predicts, signals or advises. LLMs may label, argue and explain, but never originate a number.

## Where things are
- **Live:** frontend `fill-score-kappa.vercel.app` (Vercel); API `fillscore-api` and ML `fillscore-ml` (Render, Frankfurt, auto-deploy after CI passes); MongoDB Atlas database `fillscore`.
- **Code map:** `ARCHITECTURE.md`. **Agent rules:** `CLAUDE.md`. **Roadmap:** `docs/ROADMAP.md` (the only one).
- **Research record:** `docs/research/` (LOG, EXPERIMENTS, decisions, RELATED_WORK, AUDIT_2026-11, MARKET_2026-11).
- **Design and plan for the current work:** `docs/superpowers/specs/2026-11-07-measurement-v2-design.md` and `docs/superpowers/plans/`.

## How work happens
- The work follows the milestones in `docs/agent/MASTER_BRIEF.md`. Progress and the next action are in `docs/PROGRESS.md`.
- The agent commits locally at the end of each milestone, with all suites green. Deepanshu pushes.
- The agent asks Deepanshu before any Atlas write, `--apply`, push, history rewrite, paid service, new credential, or change to the guard hook or settings. Requests are listed in `docs/PROGRESS.md` under "Waiting for Deepanshu".

## Now
- **Two scores.** v1 (rule-based, frozen, locked demo grades) and v2 (measured, M1). v2 measures each Binance fill against real public prints (`ml-service/measure/`), measures order shortfall and the account's real fee rates, and scores under the committed version `ml-service/scoring_v2/versions/v2.3.0.json` (the v2.2.0 calibration unchanged: spread on taker events and 90 days from v2.1.0, ADR-0012; hour cost floors, ADR-0013; the shortfall decomposition, ADR-0014; v2.0.0 to v2.2.0 stay reproducible), with an integrity hash and a verify route. Report: `docs/milestones/M1.md`.
- **Measurement in production:** `ML_SERVICE_URL` and `ML_SERVICE_TOKEN_SECRET` are set (Deepanshu, 2026-11-13); `main` was pushed through the M2 build and the smoke test passed.
- **Demo data:** the three Binance demos in Atlas were replaced on 2026-11-14 by Deepanshu's `--apply` with the rebuilt data (real January 2024 prints; trades 721/607/385, orders 311/245/144; `ml-service/demo_v2/out/`). They are graded under **v2.3.0** (implementation-shortfall decomposition, ADR-0014: execution cost, fees, unfilled orders, equal weights; timing is information only): aggressive 94.35 A, moderate 93.41 A, disciplined 93.68 A (v2.2.0: 90.28, 90.48, 90.06; v1 locked: C, B, A). The score does not separate the three synthetic profiles. The dashboard for rebuilt demos says "not computed for this data" for v1-only views, takes its header figures from the current fills and orders, and leads the v2 panel with the dollar cost breakdown. demo-bybit, demo-okx and demo-multi were removed on 2026-11-13 (Atlas data kept; demo-bybit returns in M6).
- **Demo Council:** all three demos were re-recorded on 2026-11-19 (evening UTC) on prompt 1.7.0 under claim rules 1.3.0 and the fixed placeholder renderer (3 live runs, each accepted, 9 of 9 calls; LOG §AB). Before that: claim rules 1.1.0 (demo-aggressive re-recorded 2026-11-17). A demo run is served only when its packet hashes equal the current demo data's (trades now load in `executedAt`, `_id` order, so the hashes are stable) and its text states no cause.
- **Quick and Deep (M3 §3-§4):** the dashboard's Council panel offers Quick (one model call, default) and Deep (the 9-call Council, opt-in). Budget units: Deep 9, Quick 1. The API default without a `mode` is Deep. `GET /ml/agents/council/budget` reports what is left.
- **Cost vs expected (M3 §2):** `ml-service/expected_cost/` (square-root model, calibration `versions/ec1.0.0.json`, ADR-0015). Shown beside the v2 letter for the demos (stored beside the grade). Since 2026-11-18 real accounts get it too: the measurement job reads the hour before each MARKET order from Binance public 1-minute klines (`measure/data/klines.py`, LOG §U); with fewer than 20 usable market orders it says "insufficient data".
- **Golden set v3 is recorded (2026-11-19).** The 18 ablation recordings are committed exactly as recorded (none re-rolled); `golden/v3/MANIFEST.json` says `recorded: true` and names the three runs that state a cause. Claim rules are **1.2.0** (causal phrasings and number-free judgements); the demo Council runs of `demo-aggressive` and `demo-disciplined` fail them and are not served until re-recorded (PROGRESS items 25 and 26).
- **The design lab** (`/design-lab`, 404 in production): tokens for directions A (light) and B (dark), the component set, `app/lib/motion.ts`, the hero prototype. Read `docs/design/lab/README.md`; the screenshots are in that folder.
- **No real user trade has been scored yet.** `ml-service/scripts/validate_real_account.py --account <id>` is the one-command check for the first real trades.
- **Milestone state:** see `docs/PROGRESS.md`.

## Next
**2026-11-20 (latest): Design v3 proposal ready: Deepanshu picks a direction.** Two working prototypes in the dev-only lab (`/design-lab/v3`): direction 1 "Tape & Receipt" (paper, ink, fill-orange pen; recommended) and direction 2 "Grid & Highlighter" (twelve-column sheet on warm black, lime highlighter). Images and the case: `docs/design/v3-proposal/README.md`; research: `docs/design/REFERENCES.md`. Production screens unchanged; design v2 stays live. After the choice: convert production screens and rewrite DESIGN.md from the built direction.

**Older: 2026-11-20: M8 2b part 1 ready for Deepanshu's review (screenshots in `docs/design/2b-1/`); part 2 next: landing with hero, trades, analytics, methodology, verify, check, share** (PROGRESS, "Orders of 2026-11-20"; direction A and IBM Plex Sans are chosen and in production; the dashboard, settings, shell and account pages are rebuilt; the three demo Council runs were re-recorded under rules 1.3.0). The older line that follows is superseded: ~~M8 lab ready: Deepanshu picks A or B and the fonts~~ (`docs/design/lab/README.md`; PROGRESS "Orders of 2026-11-19, second batch"). Also waiting: items 25 to 28 (renderer fix for `evidence_cited`, demo re-record, the recorded demo-moderate flag label, the GSAP licence read) and the push. Older text follows.

**2026-11-19 update: M8 proposal ready for Deepanshu** (`docs/design/M8_PROPOSAL.md`; the orders of 2026-11-19, items 1-11, are recorded in `docs/PROGRESS.md`; Node is 26 now; stored exchange keys are version 2 envelopes; CI has an audit gate; the ablation runs 4-6 are verified but not flipped, waiting item 23). Older text follows.

**M8: stop for Deepanshu** (design and UI is collaborative; not started). M0 to M7 and M9 are done; the final report is `docs/FINAL_REPORT.md`. Done since the last push (local commits, not pushed): cost vs expected for real accounts, the `/verify` page, personal API keys, the broker-file check, scheduled re-sync and stale-data line, CCXT shadow mode, the metrics package, the MCP App, a DP mechanism, Stripe (off), the security review fixes, launch drafts. Waiting for Deepanshu: item 10 (both ablation days; then `golden/v3` flip and the first `evidence_cited` numbers), 16 (funding costs), 17 (live CCXT run), 19 (EVM DEX audit), 20 to 22 (secret lengths, Node runtime, pre-launch steps), and the push. Do not touch `ml-service/evals/recordings/` or `golden/v3` until he reports both days done.

## Known issues
- The bar-based spread estimators (Corwin–Schultz, Abdi–Ranaldo) read volatility, not spread, on liquid pairs. Measurement v2 replaces them with aggressor-side prints (ADR-0008).
- The eval measure `evidence_cited` fails on every recorded run (0 of 18 on golden v3; the renderer was fixed on 2026-11-20 and the recordings stay as recorded, so runs made after the fix are the first that can pass). The cause was in the measure: the required key `alpha.median_opportunity_bps_unfilled` cannot be rendered by `agents/render.py` (it formats only a `_bps` suffix), so no run could state it (LOG §Z; PROGRESS item 25).
- Git history contains old, rotated credentials (public repository). Decision 2026-11-12: no purge; the CI job `secrets` (gitleaks) fails on any new finding (R6-G13 closed).

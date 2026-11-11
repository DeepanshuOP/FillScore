# FillScore — Progress

This file is the resume point for the work in `docs/agent/MASTER_BRIEF.md`. A new session reads the brief, then this file, then `docs/HANDOFF.md`, and continues from "Next concrete action".

## Current milestone

**M2. Real demos** — starting. M1 is done (report `docs/milestones/M1.md`).

**Plan written:** `docs/superpowers/plans/2026-11-11-m2-real-demos.md`. The venue archives are verified (`docs/research/LOG.md` §J): Bybit and OKX both publish daily spot trade files whose `side` is the aggressor. OKX days are UTC+8. Neither publishes a checksum.

**Next concrete action (M2), in order:**
1. `ml-service/demo_v2/prng.py` (exact mulberry32 port; test literals from node) and `decisions.py` (same PRNG call sequence as `generateSyntheticTrades.ts`). Prove the port: the regenerated decisions equal every (executedAt, symbol, side, orderType, quantity) in `backend/src/data/synthetic/*-trades.json`.
2. `simulate.py` with the hand cases of plan §3 (tape T), then `tapes.py` (Bybit and OKX loaders, plus 2-minute committed fixtures with `SOURCE.md`).
3. `build.py` → `ml-service/demo_v2/out/` plus the manifest; offline v2 grades (Python) and v1 grades (`backend/src/scripts/gradeDemoFiles.ts`, writes nothing); the old vs new grade table.
4. Cite the Bybit and OKX regular spot fee rates (`docs-researcher`) before using them.
5. `seedDemoV2.ts` (dry run by default) and the re-lock patch under `.work/proposed/`; both go to "Waiting for Deepanshu".
6. Whale pre-fill study (new offline script; never `whale/enrich.py`), and the ablation re-record script (dry run) for Deepanshu.

## M1 (done, 2026-11-11)

Plan: `docs/superpowers/plans/2026-11-11-m1-measurement-and-scoring-v2.md` (it builds on `docs/superpowers/plans/2026-11-09-phase-4r1a.md`). Report: `docs/milestones/M1.md`.

**Done in M1 so far (Part A complete, Tasks 1–6; 89 tests in `ml-service/tests/measure/`, all green; ml suite 949 passed, 1 skipped):** metric registry; real 2-minute fixtures with `SOURCE.md`; data layer (`measure/data/`: window type, data.binance.vision loader with mandatory checksum, REST window with paging and gap check, Parquet cache, price step); benchmarks (`measure/benchmarks.py`); fill metrics with the runtime identity (`measure/metrics.py`); `measure/enrich_fill.py` (`FillInput`, `measure_fill`), checked on real BTCUSDT and BNBUSDT slices; the generated method page `docs/methodology/measurement-v1.0.0.md` (`ml-service/scripts/gen_methodology.py`, with a drift test). Red phases seen: `ImportError: cannot import name 'MEASURE_VERSION'`, `ModuleNotFoundError: No module named 'measure.data'`, `No module named 'measure.metrics'`, `No module named 'measure.enrich_fill'`, `AssertionError: missing .../measurement-v1.0.0.md`. Two defects found by the tests and fixed in code: the price step kept float noise at 12 decimals (now 8, the exchange precision), and the header-row skip dropped a data row. The flaky router test passed 30 of 30 runs and in the full suite; no fix was needed. Commits: `0aa0603` (Tasks 1–4), then the Tasks 5–6 commit. Research notes: `docs/research/LOG.md` §G.

**Part B done (Tasks 7–10, Binance only):** `measure/orders.py` (order shortfall, including orders that never filled), `measure/fees.py` (Commission FAQ formula, the FAQ example reproduced), `measure/service.py` (the job; trade rows are the outbox), `POST /internal/measure` (service token `typ: measure`), backend `Order`/`FeeSnapshot`/`OrderMeasurement` models, `services/orders/binanceOrders.ts` (allOrders + commission in the history sync), `services/measureTrigger.ts` (called after each sync), field registry rows for the new collections. Decisions: ADR-0011. Research: `docs/research/LOG.md` §H. TDD note: `binanceOrders.ts` and `measure/service.py` were written before their tests (no red phase seen); the C2 component tests were written first but not run red. Every other module showed its red phase.

**Part C done:** Scoring v2 (`ml-service/scoring_v2/`), calibrated version `v2.0.0` from 20 real daily files, ADR-0010. **Part D done:** `/internal/score-v2` and `/internal/verify-v2`; backend `GET /api/audit/v2` and `GET /api/audit/verify`; the dashboard shows v1 (rule-based) and v2 (measured) side by side; `/methodology` generated from the code; the validation harness `ml-service/scripts/validate_real_account.py`. Review: 3 medium and 4 low findings, all fixed with tests (listed in the M1 report). Not built: Bybit and OKX orders (OKX order-history facts unconfirmed; Bybit keeps only filled orders older than 7 days); their fills carry an `unmeasuredReason`.

## Milestone status

| Milestone | Status | Report | Commit |
|---|---|---|---|
| M0 Orientation, research and hygiene | done | `docs/milestones/M0.md` | `ff681be` |
| M1 Measurement v2 and Scoring v2 | done (real-account check open until real trades exist) | `docs/milestones/M1.md` | `0aa0603`, `5d43067`, `6ab568e`, `46e08f3`, `20d0e17` |
| M2 Real demos | in progress (planning) | | |
| M3 Cost against expectation, AI layer quality | not started | | |
| M4 Explain and act | not started | | |
| M5 Trust and reach | not started | | |
| M6 Breadth | not started | | |
| M7 Differentiators | not started | | |
| M8 Design and UI | stop for Deepanshu before starting | | |
| M9 Launch readiness | not started | | |

## Suite results

**End of M1 (2026-11-11):** ml-service 1115 passed, 1 skipped; offline evals 0 gated violations; ablation --check exit 0; guard 214 passed; roadmap IDs OK; backend 93 files, 742 passed, tsc 0; frontend 39 files, 263 passed, tsc 0, lint 0 errors (89 warnings), build exit 0; e2e 16 passed. `dump_golden_packets --check v2` was not run: it needs a local mongod, and no packet code changed.

Baseline at commit e43c493, and the same at the end of M0 (2026-11-11). M0 added no code.

| Suite | Command | Result |
|---|---|---|
| ml-service tests | `pytest -p no:cacheprovider` (env in `.claude/rules/ml-service.md`) | 860 passed, 1 skipped |
| Offline evals | `python evals/run_offline.py` | 0 gated violations |
| Ablation check | `python evals/ablation.py --check` | exit 0 |
| Guard hook | `bash .claude/hooks/test_guard.sh` | 214 passed, 0 failed |
| Roadmap IDs | `bash scripts/check_roadmap_ids.sh` | OK |
| Backend | `npm test -- --no-file-parallelism`, `npx tsc --noEmit` | 90 files, 709 passed; tsc exit 0 |
| Frontend | `npx vitest run`, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build` | 37 files, 252 passed; tsc exit 0; lint 0 errors, 89 warnings; build exit 0 |
| e2e | `npm run test:e2e` | 14 passed |

The M0 ml-service run used `--ignore=tests/measure`, because that folder holds the first, still red, Milestone 1 test and is not part of the M0 commit.

## Done

- **M0** (2026-11-11): baseline; Dependabot alerts #265 and #270 fixed in the frontend; market research `docs/research/MARKET_2026-11.md`; roadmap §3a; instruction cleanup; M1 plan; reviewer findings fixed. Report: `docs/milestones/M0.md`. Commit: `ff681be`.

## Waiting for Deepanshu

Nothing here blocks the current work.

1. **Old credentials in public git history (decision).** The repository is public (`gh repo view` reports PUBLIC), and `ARCHITECTURE.md` says the history holds credentials from before they moved to environment variables, and that they were rotated.
   - Please confirm that every credential that was ever committed is rotated (MongoDB URI, JWT secrets, OAuth client secrets, exchange or LLM keys).
   - Then decide whether to purge the history (roadmap item R6-G13). A purge is a history rewrite and a force push, so only you can run it. If you want it, I can prepare the exact `git filter-repo` steps as a file under `.work/proposed/`.
   - Unblocks: closing R6-G13 before launch (M9 security review).
2. **Leftover graphify files (information).** `.claude/settings.json.graphify-bak` and `.agents/rules/graphify.md` refer to a `graphify-out/` folder that does not exist. Delete them if graphify is no longer used. I do not edit settings files.
3. **Pushing.** Local commits are not pushed. A push deploys through CI, so it is yours: `git push origin main` when you have reviewed the commits.
4. **Set `ML_SERVICE_URL` on the backend service (Render), before or with the push of M1.** Value: the ml-service's base URL (for example `https://fillscore-ml.onrender.com`). Without it the backend skips measurement after a sync (it logs nothing and fails nothing). No new secret is needed: the service token is signed with the existing `JWT_ACCESS_SECRET`. Unblocks: measurement v2 in production (ADR-0011).

## Decisions since the last report

- Dependabot #270: the minimatch override is scoped to `@typescript-eslint/typescript-estree`, not global. A global override would force eslint's minimatch 3 copies to version 11, which is not needed (3.1.5 is outside the alert's range) and risks breaking lint.
- Dependabot #265: the `shadcn` dev dependency is removed; `components.json` stays, so `npx shadcn` still works on demand.
- Roadmap additions and changes from the market research: `docs/ROADMAP.md` §3a. A replay of a user's past fills on another venue's tape is not built, because it reads as routing advice.
- Scoring versions and calibration tables will be JSON files in the repo, not MongoDB documents (M1 plan §2). To be recorded as ADR-0010 when built.
- DuckDB is not added for now. pandas and pyarrow, which are already installed, cover the as-of lookups M1 needs. Revisit if the calibration script is too slow.

## Known problems

- The guard blocks shell redirection into the repo, including redirection to a path held in a shell variable. Pipe command output to `tail` instead of writing log files from the shell.
- The eval measure `evidence_cited` fails on all 18 recorded runs (measured, not gated). Finding the cause is part of M3.
- No real-user trade has been scored. The M1 exit criterion "at least one real account scored under v2" stays open until Deepanshu has real trades; M1 builds the one-command validation harness for it.

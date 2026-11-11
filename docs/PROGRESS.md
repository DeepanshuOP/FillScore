# FillScore — Progress

This file is the resume point for the work in `docs/agent/MASTER_BRIEF.md`. A new session reads the brief, then this file, then `docs/HANDOFF.md`, and continues from "Next concrete action".

## Current milestone

**M1. Measurement v2 and Scoring v2** — in progress. Plan: `docs/superpowers/plans/2026-11-11-m1-measurement-and-scoring-v2.md` (it builds on `docs/superpowers/plans/2026-11-09-phase-4r1a.md`).

**Done in M1 so far (Part A complete, Tasks 1–6; 89 tests in `ml-service/tests/measure/`, all green; ml suite 949 passed, 1 skipped):** metric registry; real 2-minute fixtures with `SOURCE.md`; data layer (`measure/data/`: window type, data.binance.vision loader with mandatory checksum, REST window with paging and gap check, Parquet cache, price step); benchmarks (`measure/benchmarks.py`); fill metrics with the runtime identity (`measure/metrics.py`); `measure/enrich_fill.py` (`FillInput`, `measure_fill`), checked on real BTCUSDT and BNBUSDT slices; the generated method page `docs/methodology/measurement-v1.0.0.md` (`ml-service/scripts/gen_methodology.py`, with a drift test). Red phases seen: `ImportError: cannot import name 'MEASURE_VERSION'`, `ModuleNotFoundError: No module named 'measure.data'`, `No module named 'measure.metrics'`, `No module named 'measure.enrich_fill'`, `AssertionError: missing .../measurement-v1.0.0.md`. Two defects found by the tests and fixed in code: the price step kept float noise at 12 decimals (now 8, the exchange precision), and the header-row skip dropped a data row. The flaky router test passed 30 of 30 runs and in the full suite; no fix was needed. Commits: `0aa0603` (Tasks 1–4), then the Tasks 5–6 commit. Research notes: `docs/research/LOG.md` §G.

**Next concrete action:**
1. Part B, Task 9 first (pure ml, no external facts needed): `ml-service/measure/orders.py`, `order_is(...)`, with the hand case from the 4R-1a plan (intended 200.00; execution 2.0; spread 0.75; impact/timing 1.25; opportunity 2.5; fees 7.5; total 12.0 bps).
2. Then Tasks 7–8 (backend orders and fee snapshots). Get the cited exchange facts first (`docs-researcher`: Binance `allOrders` and `account/commission`, and the Bybit and OKX equivalents).
3. Then Task 10 (persistence, `/internal/measure`, the job with an outbox) and Task 11; then Part C (Scoring v2) and Part D, as in the M1 plan. One `reviewer` pass runs on the whole M1 diff before the milestone commit.

## Milestone status

| Milestone | Status | Report | Commit |
|---|---|---|---|
| M0 Orientation, research and hygiene | done | `docs/milestones/M0.md` | `ff681be` |
| M1 Measurement v2 and Scoring v2 | in progress (Part A done; Part B next) | | |
| M2 Real demos | not started | | |
| M3 Cost against expectation, AI layer quality | not started | | |
| M4 Explain and act | not started | | |
| M5 Trust and reach | not started | | |
| M6 Breadth | not started | | |
| M7 Differentiators | not started | | |
| M8 Design and UI | stop for Deepanshu before starting | | |
| M9 Launch readiness | not started | | |

## Suite results

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

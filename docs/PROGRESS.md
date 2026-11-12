# FillScore — Progress

This file is the resume point for the work in `docs/agent/MASTER_BRIEF.md`. A new session reads the brief, then this file, then `docs/HANDOFF.md`, and continues from "Next concrete action".

## Current milestone

**M2. Real demos** — resumes now, on Scoring **v2.1.0**. M1 and its correction pass M1.1 are done.

**M1.1 (done 2026-11-12, report `docs/milestones/M1.md` §"M1.1 corrections", ADR-0012, LOG §K):** the spread baseline is measured on taker events (the v2.0.0 bias came from multi-level orders counted print by print; quote age is second-order, 5 s cap kept); user spread is scored per event; calibration v2.1.0 over 90 days (360 files, streamed, raw files deleted; day summaries stay in `ml-service/.cache/market/summaries`, local only); `ML_SERVICE_TOKEN_SECRET` (fail closed); CI secret scan (gitleaks); R6-G13 closed. Grade the M2 demos with `SCORING_V2_VERSION` (v2.1.0), and remember that its spread unit is the taker event: a simulated fill keeps its real print's time, so fills taken from one public event share a millisecond and are scored together, and fills at later prints are separate events, each measured against the mid before its own millisecond.

**Plan written:** `docs/superpowers/plans/2026-11-11-m2-real-demos.md`. The venue archives are verified (`docs/research/LOG.md` §J): Bybit and OKX both publish daily spot trade files whose `side` is the aggressor. OKX days are UTC+8. Neither publishes a checksum.

**Done in M2 so far (commit `af3b737`, plan commit `a3d85da`):**
- `ml-service/demo_v2/prng.py`: an exact mulberry32 port, matching node values.
- `decisions.py`: a line-by-line port of the current `generateSyntheticTrades.ts`, with the same PRNG call order. It gives 313 / 248 / 145 decisions.
- `simulate.py`: taker orders walk prints; maker orders fill only when a print trades through the limit; a 30 min TTL. All 9 hand cases of plan §3 pass.
- Finding: the committed `backend/src/data/synthetic/*.json` files come from an older generator and cannot be reproduced (`test_committed_old_files_come_from_an_older_generator`). A read-only Atlas count check is listed below.

**Next concrete action (M2), in order:**
1. (done) prng and decisions. (done) simulate.
2. (done, uncommitted) `ml-service/demo_v2/tapes.py` with `tests/demo_v2/test_tapes.py` (5 passed): Bybit loader tested on the committed real fixture `tests/fixtures/market/bybit-BTCUSDT-2024-01-15_1400-1402.csv.gz` (329 rows; full-file SHA-256 `ad4c8b873f3c1823bbac3d9311a9c2fec5eaa7f50fce87cc3b8d0314825140ee`, ours); OKX loader tested on in-memory files (UTC+8 boundary, scientific notation). **Still to do:** add the Bybit row to `tests/fixtures/market/SOURCE.md`; cut a real OKX fixture. On 2026-11-12 www.okx.com was unreachable from this machine (connect timeout, then DNS failure); retry, and if it stays down, decide whether demo-okx can be rebuilt (otherwise remove it, plan D3).
2b. (done, uncommitted) `measure_account(..., data_source="synthetic-demo")` and `score_account_v2(..., data_source="synthetic-demo")`: the offline demo build reuses the production job and scorer on an in-memory database; only `demo-*` accounts may use it, and the default (`real-user`) is unchanged. Tests in `test_service.py` and `test_score.py`.
   Fee citations (docs-researcher, 2026-11-12): Bybit VIP 0 spot 0.1000% maker / 0.1000% taker, https://www.bybit.com/en/help-center/article/Trading-Fee-Structure ("last updated 2026-11-05"); not confirmed for January 2024. OKX: not confirmed from any official page (okx.com unreachable; search snippets only say 0.08% / 0.10%). Record both in LOG; with okx.com unreachable and no citable fee, demo-okx is likely removed (plan D3) — decide in step 3.
   January 2024 Binance tapes (124 files) are being prefetched into `ml-service/.cache/market/zips` (checksum-verified).
3a. (done) `demo_v2/build.py`, `scripts/build_demo_v2.py`, output `ml-service/demo_v2/out/` (three Binance demos, manifest with 119 tape checksums, offline v2 grades). Results and the timing finding: LOG §L. v2.1.0: aggressive 78.26 B, moderate 76.36 B, disciplined 73.06 C (v1 locked: C / B / A). Decisions for Deepanshu: items 7 and 8 below.
3b. (next) v1 grades of the new files: `backend/src/scripts/gradeDemoFiles.ts` (reads `ml-service/demo_v2/out/*/trades.json`, runs the frozen v1 engine in-process with the seed's enrichment, writes nothing; the seed's enrichment uses random noise, so check whether it is seeded and report it). Then the old vs new table in the M2 report.
3. (original wording) `build.py` → `ml-service/demo_v2/out/` plus the manifest; offline v2 grades (Python) and v1 grades (`backend/src/scripts/gradeDemoFiles.ts`, writes nothing); the old vs new grade table.
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
| M1 Measurement v2 and Scoring v2 | done (real-account check open until real trades exist); M1.1 corrections done | `docs/milestones/M1.md` | `0aa0603`, `5d43067`, `6ab568e`, `46e08f3`, `20d0e17`; M1.1: see "Done" |
| M2 Real demos | in progress (planning) | | |
| M3 Cost against expectation, AI layer quality | not started | | |
| M4 Explain and act | not started | | |
| M5 Trust and reach | not started | | |
| M6 Breadth | not started | | |
| M7 Differentiators | not started | | |
| M8 Design and UI | stop for Deepanshu before starting | | |
| M9 Launch readiness | not started | | |

## Suite results

**End of M1.1 (2026-11-12):** ml-service 1149 passed, 1 skipped; backend 93 files, 750 passed, tsc 0; frontend 39 files, 263 passed, tsc 0, lint 0 errors (89 warnings), build exit 0; e2e 16 passed; guard 214 passed; roadmap IDs OK; run_offline 0 violations; ablation --check exit 0; gitleaks full history: no leaks.

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

- **M1.1** (2026-11-12): correction pass after the architect review (taker-event spread baseline, calibration v2.1.0 over 90 days, `ML_SERVICE_TOKEN_SECRET`, gitleaks CI job, R6-G13 closed). Report: `docs/milestones/M1.md` §"M1.1 corrections". Commit: `ca223a0`.
- **M0** (2026-11-11): baseline; Dependabot alerts #265 and #270 fixed in the frontend; market research `docs/research/MARKET_2026-11.md`; roadmap §3a; instruction cleanup; M1 plan; reviewer findings fixed. Report: `docs/milestones/M0.md`. Commit: `ff681be`.

## Waiting for Deepanshu

Nothing here blocks the current work.

1. ~~Old credentials in public git history (decision).~~ **Done 2026-11-12.** Deepanshu confirmed every committed credential is rotated and decided against a purge (clones and forks keep the history anyway). R6-G13 is closed by the CI secret scan (job `secrets`, gitleaks 8.30.1 over the full history; the six rotated Atlas URIs of commit `1bd5be8a` are listed in `.gitleaksignore`).
7. **Decision: the timing component (25% of v2) mostly measures volatility.** On the rebuilt demos it reverses the order of the profiles: v2.1.0 gives aggressive 78.3 B, moderate 76.4 B, disciplined 73.1 C (v1: C / B / A), because the disciplined profile trades 08:00-15:00 UTC, which includes the three most volatile hours. The hour profile is median quoted half-spread + median absolute 1-minute move, and the move is about 1,000 times larger than the half-spread on BTC (LOG §L). Options: (a) keep it as approved (spec D5) and explain it on the methodology page; (b) in a new version, build the hour profile from the median effective half-spread of taker events per hour (a cost, not a volatility); (c) lower its weight. My recommendation is (b), as v2.2.0, before the demo grades are re-locked. Nothing changes until you choose. Unblocks: the M2 re-lock.
8. **Decision: demo-okx and demo-multi.** www.okx.com was unreachable from this machine on 2026-11-12 (connect timeouts, then DNS failure), and no official OKX fee page could be read, so they cannot be rebuilt from real OKX prints now. Per the plan (rebuild where a venue archive exists, otherwise remove), I propose to remove demo-okx and demo-multi from the demo set (both are already hidden). demo-bybit can be rebuilt from Bybit's archive, but its v2 score would read "not measured" until the measurement job measures Bybit fills; I propose to remove it as well for now and add it back with Bybit measurement in M6 (CCXT breadth). Say if you prefer otherwise.
6. **Set `ML_SERVICE_TOKEN_SECRET` on both Render services, before or with the push of M1.1.** The backend → ml-service token now has its own secret (no longer `JWT_ACCESS_SECRET`). Steps: generate a value, e.g. `openssl rand -hex 32` (64 characters); in the Render dashboard open `fillscore-api` → Environment → add `ML_SERVICE_TOKEN_SECRET` with that value; then `fillscore-ml` → Environment → add the same key with the same value; save both (each redeploys). It must be at least 32 characters and differ from `JWT_ACCESS_SECRET`. Without it both sides fail closed: the ml-service answers 503 on `/internal/*`, the backend skips measurement and `/api/audit/verify` answers 503; everything else works. For local runs, add it to `backend/.env` (the ml-service reads it from there). Unblocks: measurement v2 and score verification in production (together with item 4).
2. **(Done: both files are gone, commit `8a8159a`.)** Leftover graphify files (information). `.claude/settings.json.graphify-bak` and `.agents/rules/graphify.md` refer to a `graphify-out/` folder that does not exist. Delete them if graphify is no longer used. I do not edit settings files.
3. **Pushing.** Local commits are not pushed. A push deploys through CI, so it is yours: `git push origin main` when you have reviewed the commits.
5. **(Answered 2026-11-12: Atlas holds demo-aggressive 313, demo-moderate 248, demo-disciplined 145 trades, the same counts as the current generator and its Python port. So Atlas was seeded by the current generator; the committed JSON files are older and unused by the seed. The M2 old-vs-new table compares against the current generator.)** Original question: which demo trades are in Atlas? (a read-only check, information for M2). The committed `backend/src/data/synthetic/*-trades.json` cannot be reproduced by the current generator: their ids have another shape, and the counts are 174 / 113 / 64. The current generator (ported exactly to `ml-service/demo_v2/decisions.py`) gives 313 / 248 / 145 decisions for aggressive / moderate / disciplined. Running the TS generator to compare was blocked by the guard, which is correct, so I did not run it. To settle which version is seeded, please run a read-only count: `mongosh "$MONGODB_URI" --quiet --eval 'for (const u of ["demo-aggressive","demo-moderate","demo-disciplined"]) print(u, db.trades.countDocuments({userId: u}))'`. M2 builds on the current generator either way; this only decides how the old-vs-new table is labelled.
4. **Set `ML_SERVICE_URL` on the backend service (Render), before or with the push of M1.** Value: the ml-service's base URL (for example `https://fillscore-ml.onrender.com`). Without it the backend skips measurement after a sync (it logs nothing and fails nothing). Since M1.1 the service token also needs `ML_SERVICE_TOKEN_SECRET` (item 6). Unblocks: measurement v2 in production (ADR-0011).

## Decisions since the last report

- Dependabot #270: the minimatch override is scoped to `@typescript-eslint/typescript-estree`, not global. A global override would force eslint's minimatch 3 copies to version 11, which is not needed (3.1.5 is outside the alert's range) and risks breaking lint.
- Dependabot #265: the `shadcn` dev dependency is removed; `components.json` stays, so `npx shadcn` still works on demand.
- Roadmap additions and changes from the market research: `docs/ROADMAP.md` §3a. A replay of a user's past fills on another venue's tape is not built, because it reads as routing advice.
- Scoring versions and calibration tables will be JSON files in the repo, not MongoDB documents (M1 plan §2). To be recorded as ADR-0010 when built.
- DuckDB is not added for now. pandas and pyarrow, which are already installed, cover the as-of lookups M1 needs. Revisit if the calibration script is too slow.

## Known problems

- `ml-service/scoring_v2/versions/v2.1.0.json` records the `codeHash` of the code at calibration time. M2 added the behaviour-neutral `data_source` keyword to `scoring_v2/score.py`, so the current code hash differs. Nothing checks this at runtime. When the next version is calibrated it records the then-current hash.

- The guard blocks running `backend/src/scripts/generateSyntheticTrades.ts` (it is a demo-dataset script). This is deliberate and was respected. The Python port is proven by the PRNG values and by the rule tests instead.
- Uncommitted at handoff: none apart from this file. Latest suite lines: ml 1130 passed, 1 skipped (after `af3b737`); backend 742 passed, tsc 0; frontend 263 passed, tsc 0, lint 0 errors, build 0; e2e 16 passed (end of M1, `20d0e17`).

- The guard blocks shell redirection into the repo, including redirection to a path held in a shell variable. Pipe command output to `tail` instead of writing log files from the shell.
- The eval measure `evidence_cited` fails on all 18 recorded runs (measured, not gated). Finding the cause is part of M3.
- No real-user trade has been scored. The M1 exit criterion "at least one real account scored under v2" stays open until Deepanshu has real trades; M1 builds the one-command validation harness for it.

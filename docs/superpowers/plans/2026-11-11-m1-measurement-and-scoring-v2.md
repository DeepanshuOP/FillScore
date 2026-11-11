# M1 plan: measurement v2 and Scoring v2

- **Date:** 2026-11-11
- **Spec:** `docs/superpowers/specs/2026-11-07-measurement-v2-design.md` §3, §5, §6, §8, §9.
- **Builds on:** `docs/superpowers/plans/2026-11-09-phase-4r1a.md` (measurement layer, Tasks 1–11). That plan stays the reference for Parts A and B below. This file records what changes in it, and adds Part C (Scoring v2) and Part D (API and UI), which had no plan.
- **Outcome for a user:** every fill gets a measured effective spread, realized spread and price impact against a mid built from real aggressor-side prints; every order gets an implementation shortfall with opportunity cost; the account gets a "v2 (measured)" score with confidence intervals, an integrity hash that anyone can re-check, and a methodology page generated from the code. The v1 score stays, labelled "v1 (rule-based)".

## 1. Facts verified before planning (2026-11-11)

Three daily files were downloaded from data.binance.vision and their SHA-256 matched the published `.CHECKSUM` files.

| File | SHA-256 (zip) | Rows | First row |
|---|---|---|---|
| `BTCUSDT-aggTrades-2024-01-15.zip` | `4b4ee84e3dec847499fd4bd9d3ea34aa5fff6ff9db825da4c8507b1107718a2b` | 1,364,603 | `2830286912,41732.35000000,0.00099000,3373358675,3373358675,1705276800002,True,True` |
| `BNBUSDT-aggTrades-2024-01-15.zip` | `dde821f1a59567413acbe5188bfc4d319322a81e8875dedea67420d098a1c348` | 269,432 | `518063335,299.40000000,5.29800000,702627956,702627956,1705276800202,True,True` |
| `BTCUSDT-aggTrades-2025-03-04.zip` | `65f296c975b16118774c230e4485e82d7ba5718886d513aab1b23953ad2ae279` | 4,091,509 | `3466673469,86221.16000000,0.00066000,4645665031,4645665038,1741046400006223,False,True` |

Source URL pattern: `https://data.binance.vision/data/spot/daily/aggTrades/<SYMBOL>/<SYMBOL>-aggTrades-<YYYY-MM-DD>.zip`.

- The CSV has no header and 8 columns: aggregate trade id, price, quantity, first trade id, last trade id, timestamp, is-buyer-maker, best-match.
- The 2024 files use millisecond timestamps (13 digits). The 2025 file uses microseconds (16 digits). A loader must detect the unit per file.
- `is_buyer_maker = True` means the buyer was the resting side, so the seller was the aggressor. A buyer-initiated print has `is_buyer_maker = False`.

Exchange REST facts (order history, commission endpoint, aggTrades weight) are fetched from the official docs by the `docs-researcher` subagent when Parts A and B reach them, and cited in the code and in `docs/research/LOG.md`.

## 2. Changes to the 4R-1a plan

1. **One brief, not two.** Parts i and ii run in this milestone, in order. The agent commits (the old plan said Deepanshu commits).
2. **Timestamps.** `AggTrade.ts_ms` is an integer in milliseconds. Microsecond files are divided by 1000 with floor. Ordering inside one millisecond uses `agg_id`. The benchmark rule stays `ts_ms < t_ms` (strict), so a print in the same millisecond as the fill is never used, even if it came first. Reason: a user fill time from `myTrades` has millisecond precision, so prints in the same millisecond cannot be ordered against it.
3. **Horizon mids** use the same strict rule at `t + h`.
4. **ScoringVersion and calibration tables live in the repo, not in MongoDB:** `ml-service/scoring_v2/versions/<id>.json`. Reasons: a version is then reviewable in a diff, reproducible from git, readable by every tier, and it needs no Atlas write. Spec §5.1 said Mongo; ADR-0010 will record this when Part C is built (it is not written yet).
5. **The plan's hand values were re-derived** before use (fixture W and the order case). They hold:
   - mid at t=2500 is (100.02 + 100.00)/2 = 100.01; effective half-spread of a buy at 100.02 is 0.01/100.01 × 1e4 = 0.99990001 bps;
   - mid at t+15 s is (100.05 + 100.03)/2 = 100.04; realized = (100.02 − 100.04)/100.01 × 1e4 = −1.99980002; impact = (100.04 − 100.01)/100.01 × 1e4 = 2.99970003; sum = 0.99990001;
   - order case: intended notional 2.0 × 100.00 = 200.00; execution = (0.02×1.0 + 0.04×0.5)/200 × 1e4 = 2.0; spread part = (0.01×1.0 + 0.01×0.5)/200 × 1e4 = 0.75; impact/timing = 1.25; opportunity = (100.10 − 100.00) × 0.5/200 × 1e4 = 2.5; fees = 0.15/200 × 1e4 = 7.5; total = 12.0.
6. **Demo accounts are not measured by the runtime job** (unchanged). M2 rebuilds them.
7. **A real-account validation harness** is added (Part D), so that validating v2 on Deepanshu's first real trades is one command.

## Part A — data, benchmarks, fill metrics (4R-1a Tasks 1–6)

Unchanged apart from §2. Files under `ml-service/measure/` and `ml-service/tests/measure/`; real 2-minute fixtures under `ml-service/tests/fixtures/market/` with `SOURCE.md`.

## Part B — orders, fee snapshots, order-level shortfall, persistence, job (4R-1a Tasks 7–11)

Unchanged apart from §2. New persisted fields go into `shared/fieldRegistry.json` first.

## Part C — Scoring v2

**Files:** `ml-service/scoring_v2/{__init__,anchors,components,aggregate,bootstrap,integrity,version}.py`, `ml-service/scoring_v2/versions/v2.0.0.json`, `ml-service/scripts/calibrate_v2.py`, `ml-service/tests/scoring_v2/test_*.py`.

### C1. Anchor mapping
`score_from_anchors(x, a10, a50, a90, a99) -> float`. Piecewise-linear through (a10, 100), (a50, 75), (a90, 40), (a99, 0). Below a10 it is 100; above a99 it is 0. Anchors must be strictly increasing, otherwise `ValueError`. A version whose anchors are not strictly increasing for a symbol marks that component "insufficient data" for the symbol.

Hand tests with anchors (−2, 0, 4, 10):
- x = −3 → 100 (below a10).
- x = −1 → halfway between −2 and 0, so 100 − 0.5 × 25 = 87.5.
- x = 2 → halfway between 0 and 4, so 75 − 0.5 × 35 = 57.5.
- x = 7 → halfway between 4 and 10, so 40 − 0.5 × 40 = 20.
- x = 12 → 0.

### C2. Components
| Component | Weight | Unit scored | Input | Mapping |
|---|---|---|---|---|
| Slippage | 0.35 | order | `impactTimingBps` (execution net of the spread part) | anchors from the market baseline: signed mid drift over the same duration bucket and symbol |
| Fees | 0.25 | fill | fee paid in bps vs the account's best available rate | 100 at or below the best rate; linear to 0 at 2× the best rate; if the best rate is 0, the zero anchor is the published taker rate |
| Timing | 0.25 | fill | the UTC hour's index in the symbol's hour profile | `100 × (1 − rank)`, where rank = (number of hours with a strictly lower index)/23 |
| Spread | 0.15 | fill | effective half-spread paid, bps | anchors from public prints of the same symbol and notional bucket; at or below half a tick → 100 |

Hand tests:
- **Fees, best rate 10 bps:** paid 7.5 → 100; paid 10 → 100; paid 15 → 100 × (20 − 15)/10 = 50; paid 20 → 0; paid 25 → 0.
- **Fees, best rate 0, published taker 10 bps:** paid 0 → 100; paid 5 → 50; paid 10 → 0.
- **Timing, hour indexes 1…24 for hours 0…23:** hour 0 → 100; hour 23 → 0; hour 11 has 11 hours below it, so 100 × (1 − 11/23) = 52.17391304.
- **Timing with ties, indexes [1, 1, 2, …]:** both tied hours have 0 hours strictly below, so both score 100.
- **Spread at the floor:** tick 0.01, mid 100.00 → half a tick is 0.5 bps; paid 0.5 → 100 whatever the anchors are.

The hour index is the median quoted half-spread proxy (bps) plus the median absolute 1-minute return (bps) in that hour, over the calibration window (spec decision D5).

### C3. Aggregation and the minimum sample
- Each component's account score is the notional-weighted mean of its unit scores. Units with no measurement (for example no fresh mid) are left out and counted in `unmeasured`.
- Composite = 0.35·slippage + 0.25·fees + 0.25·timing + 0.15·spread. Grade bands as v1: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, F below.
- **Letter grade only when at least 20 fills are measured in every component.** Otherwise the result has `grade: null`, `band: [low, high]` from the bootstrap interval, and `reason: "fewer than 20 measured fills"`. A component with zero measured units is `null` with "insufficient data", and the composite is then `null` too. Nothing is imputed.

Hand test: two fills, notionals 100 and 300, spread scores 100 and 60 → (100×100 + 300×60)/400 = 70. Composite of components (80, 50, 60, 70) → 28 + 12.5 + 15 + 10.5 = 66.0 → band C when the sample is large enough.

### C4. Bootstrap intervals
`bootstrap_ci(units, statistic, draws=1000, seed=20261107) -> (low, high)`. Units are orders; all fills of a drawn order come with it. Percentile interval at 2.5% and 97.5%, `numpy.random.default_rng(seed)`.

Tests: the same input gives the same interval twice; identical units give a zero-width interval equal to the point value; the interval contains the point estimate on a fixed 40-order fixture; one order gives `None` (no interval from one unit). A period delta whose interval contains 0 is labelled "not distinguishable from noise".

### C5. ScoringVersion and the integrity hash
- `ScoringVersion {id, weights, bands, anchors{symbol→component→bucket→[a10,a50,a90,a99]}, hourProfiles{symbol→[24]}, feeTable, calibrationWindow{start,end,days[]}, calibrationRefs[{file, sha256}], measureVersion, codeHash}` stored as canonical JSON in the repo. A committed version file is never edited; a test pins the SHA-256 of each committed version file.
- `integrity_hash = sha256(canonical_json({scoringVersion: id, versionFileSha256, trades: sorted[{tradeId, metricHash}], marketDataSha256: sorted unique[...]}))`, where `metricHash` is the SHA-256 of the canonical JSON of that trade's stored measurement. Canonical JSON: sorted keys, no spaces, floats via `repr`, UTF-8.
- Tests: the hash equals `hashlib.sha256` of the literal canonical string written out in the test; reordering the input trades does not change it; changing one metric value, one market-data checksum or the version id changes it.

### C6. Calibration script
`scripts/calibrate_v2.py --symbols … --start … --end … --out <path>` downloads the checksum-verified daily aggTrades files, and computes the anchors and hour profiles. It writes only to `--out` (default under the cache directory) and prints the table; committing the result as a version file is a separate, reviewed step. It never writes to MongoDB. The calibration window and any day sampling are stated in the version file and on the methodology page. Tests run it on the committed 2-minute fixtures.

## Part D — API, UI and the validation harness

- **ml-service:** `POST /internal/score-v2 {accountId}` and `POST /internal/verify-v2 {accountId}`, behind the same service authentication as `/internal/measure`. `verify` recomputes the hash from stored measurements and the version file and returns `{match, storedHash, recomputedHash, scoringVersion}`.
- **backend:** `GET /api/audit/v2` (stored v2 result for the account) and `GET /api/audit/verify` (calls the ml-service; rate limited). Both rows go into the `ARCHITECTURE.md` route table (test-enforced). Account isolation tests for both.
- **frontend:** the dashboard shows the two scores side by side with their labels, "v1 (rule-based)" and "v2 (measured)"; below the minimum sample it shows the band and the reason, never a letter; a `/methodology` page rendered from a JSON file generated from the metric registry and the version file, with a test that fails when the generated file is stale. Copy passes the existing advice and claim tests; e2e covers the version label and the minimum-sample band.
- **Validation harness:** `ml-service/scripts/validate_real_account.py --account <id>` (read-only, dry-run only): measures the account's fills, scores them under v2, checks every runtime identity, compares each fill's effective spread with the tick floor, and prints a report. It closes the "at least one real account scored under v2" exit criterion when Deepanshu has real trades. Until then that criterion stays open and is stated as open.

## Edge cases a real user would hit
- A fill in a quiet market with no print in the 5 s before it: the mid is `None`, the fill is "unmeasured", and the count is shown.
- A fee paid in BNB with the discount: the fee is converted with `feeUsd`; the best available rate comes from the commission snapshot.
- A zero-fee promotion pair: the fee anchor switches to the published taker rate.
- An order that is still open: opportunity cost uses creation + 1 h as the end, and is labelled so.
- Fills with no order record (history older than the order endpoint returns): `basis: "first_fill"`, opportunity `None`.
- A symbol outside the calibrated set: components that need anchors are "insufficient data"; fees still score.
- Fewer than 20 fills: a band, no letter.
- A sync that inserts trades and then dies: the outbox job exists in the same transaction and is retried.

## Verification
All suites from the master brief, plus: the identities hold on the real fixtures; `gradeInvariance.test.ts` green (v1 untouched); a `reviewer` subagent on the diff; research notes appended to `docs/research/LOG.md`; `docs/milestones/M1.md`.

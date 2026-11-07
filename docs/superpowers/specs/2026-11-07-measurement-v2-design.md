# Design spec: accurate measurement and Scoring v2 (Phases 4R-0 → 4R-2)

- **Status:** Draft for review
- **Date:** 2026-11-07
- **Author:** architect chat, approved direction by Deepanshu
- **Inputs:**
  - `docs/research/AUDIT_2026-11.md` (the audit);
  - `ROADMAP.md`;
  - Roadmap v5 (Project);
  - the references in §12.

## 1. Problem
The audit (58 features) found that FillScore's claim, "graded against real market data", mostly does not hold today:
- **4a broke the scorer's input.** The backfill overwrote `spreadBps`, the field the scorer reads.
- **Several on-screen numbers are not what their labels say:**
  - the dashboard cards, the "cost you $X" figure and Venue Alpha;
  - the fee component, which only checks maker vs taker;
  - the hard-coded "STABLE" regime in every prompt.
- **The core inputs are weak:**
  - arrival price = 1-minute open;
  - the spread input = 1-minute high–low × 0.15;
  - the "good hours" are picked by hand.
- **The demo trades are not real-market fills:** limit slippage is forced to 0, and three accounts have random prices.
- **No real trade has ever been scored.**

**Goal:** every number FillScore shows is either measured from real data with a stated method, or explicitly labelled as rule-based or simulated. Versioning means no published grade changes silently.

## 2. Decisions recorded (Deepanshu, 2026-11-07)
| # | Decision |
|---|---|
| D1 | Accept the audit's disclosed guard workaround. Fix the guard so it blocks **running** protected scripts, not reading them. Read-only access to the generator, the seed and `whale/*.py` is permitted in writing. |
| D2 | **Scoring v1 is frozen** for today's demo grades, labelled "v1 (rule-based)". **Scoring v2 ("measured")** applies to real users and to the rebuilt demos. Both stay reproducible. |
| D3 | demo-bybit / demo-okx / demo-multi are hidden in 4R-0. In 4R-2 they are rebuilt from each venue's public trade data if that is verified to exist; otherwise they are removed. |
| D4 | There is one roadmap, `docs/ROADMAP.md`, in the repo. The Project copy is refreshed at milestones. |
| D5 | v2 timing component = the trade hour's percentile in a data-derived, versioned hour profile per symbol. **Minimum sample: 20 fills** before a letter grade is shown. (Refinement: the hour index is *spread + volatility* in bps, not their product, so it stays in interpretable units.) |

## 3. Architecture principles (adopted from established tools)
1. **Three separate layers: market data → benchmarks → metrics → aggregation.**
   - tcapy merges tick data with trades/orders, computes benchmarks (mid, arrival, TWAP/VWAP during the order), then metrics (slippage, market impact), then statistics.
   - We copy that separation. Benchmarks never know about scores; metrics never fetch data.
2. **Metric registry, which also generates the methodology page.**
   - Each metric is a pure function registered with `{id, version, unit, inputs, formula_doc, tests}`.
   - The `/methodology` page and the API field docs are generated from the registry (docs-as-code), so they cannot drift. This is the same lesson as `ARCHITECTURE.md` generation.
3. **Decompositions are checked by their own identity on every call.**
   - The `slippage` library checks implementation shortfall against its direct formula on every call.
   - We do the same: effective = realized + impact, and IS = execution + opportunity + fees. Both are asserted in code at runtime and with property tests.
4. **Use the measured aggressor side; never infer it.**
   - Trade-signing errors bias effective-spread estimates up by as much as 17% (Peterson & Sirri 2003), and the benchmark quote should be the one prevailing at order submission.
   - Binance aggTrades carry `isBuyerMaker`, so the aggressor side is *measured*. This is a real accuracy advantage over most equity TCA, which must infer it with Lee–Ready.
5. **As-of joins in DuckDB.** The mid at time t comes from an ASOF join of fills to the market data (the standard pattern, e.g. QuestDB's order-level IS recipe). DuckDB supports `ASOF JOIN` over Parquet natively.
6. **Rule 605 vocabulary.**
   - Effective spread = 2·D·(price − mid).
   - Realized spread measured at 1 s, 15 s, 1 min and 5 min after execution.
   - Effective-over-quoted (E/Q).
   - Percentage-based versions.
7. **Expanded implementation shortfall (Perold 1988; Wagner).**
   - IS = delay + execution + opportunity + fees.
   - **Delay** needs a decision time, so we report it as *not measurable*.
   - **Opportunity cost** *is* measurable, because exchange order history gives the ordered vs executed quantity. This makes the old "lost fills" idea real, without simulation.
8. **SaaS job discipline.**
   - Jobs are idempotent, because workers retry.
   - Per-tenant job rate limits stop one customer starving others.
   - Failed jobs go to a dead-letter queue with alerting.
   - The transactional-outbox pattern prevents lost events.
   - We apply this on MongoDB: no Redis until it's needed.
9. **Lineage on every number.** Each computed metric records its market-data source files and their SHA-256 checksums, so a third party can recompute it (this is the base for D1 integrity and D2 signed packs in v5).
10. **Field ownership registry.** Every persisted Trade/Audit field has one declared owner, type and version. Writers and backfills must use the registry. **This prevents the `spreadBps` class of bug.**

## 4. Phase 4R-0: stop the bleeding (one Sonnet brief, no grade changes)
Acceptance criteria:
1. **`spreadBps` collision.**
   - The 4a output moves to `spreadEstimates {cs, ar, n_pairs, halfSpreadBps, version}`; readers switch to it.
   - `spreadBps` is a number again in the schema, the types and a new **field registry** (`shared/fieldRegistry.json`, read by the TS and Python tests).
   - **Tests:**
     - a registry-conformance test (Mongoose schema and Python writers);
     - `scoreTrade` and `executeAuditPipeline` run on a fixture shaped like a backfilled trade;
     - the backfill test asserts it never writes a field it does not own.
   - **Migration script** (dry-run by default) that moves the dict to `spreadEstimates`.
   - **Restoring the demo `spreadBps`:**
     - (a) look for a backup;
     - (b) otherwise recompute with the original `estimateSpreadBps` from the cached 1-min klines;
     - (c) prove that the six stored v1 audits reproduce **hash-identically** from the restored data. If they don't, stop and report; do not write.
   - Deepanshu runs any `--apply`.
2. **Dashboard cards** show the engine's notional-weighted component means, returned by `computeAuditSummary`. SPREAD shows spread.
3. **Copy, per audit §2.10:**
   - the fee component is labelled "liquidity provision";
   - "cost you $X" becomes the fees actually paid;
   - remove the unsourced "retail average" and the 30-day extrapolation;
   - Venue Alpha becomes "average slippage by venue (unmatched)";
   - remove the coach's flat timing $ figure.
   - Copy tests are added to the existing claim/advice test suite.
4. **Council:**
   - remove the regime from the prompt context and the schema default, and collapse to one priority rule;
   - wire the 4a markouts into `liquidity_packet` reversion;
   - regenerate the golden packets and re-run the offline eval (`run_offline.py`, `ablation.py --check`).
5. **Hide demo-bybit/okx/multi** from the UI, the demo picker, the share and public routes and the sitemap. The data stays.
6. **Guard:**
   - blocks *execution* of the seed, generator, `whale/enrich.py`, `regen_fills.py` and backfill/migration scripts with `--apply`, and any printing of `.env`;
   - allows reading (`cat`, `grep`, `wc`, the Read tool) of those files;
   - the test table is extended with read-allowed and execute-blocked cases.
7. **`docs/ROADMAP.md`:**
   - v5's tracks and phases, plus every still-valid item and ID from `ROADMAP.md` (R5/R6/T/AC IDs are kept as anchors), plus the audit's corrections and this spec's phases;
   - the old `ROADMAP.md` becomes a one-line pointer;
   - HANDOFF is updated.
8. Docs: ADR-0009 becomes Accepted; LOG entries are added.

## 5. Measurement layer v2 (4R-1a: data, benchmarks, metrics, no scoring yet)
**Location:** the Python ml-service owns all v2 measurement and scoring, so the quant code lives in one language. The TS engine keeps v1, frozen. The backend serves stored results.

### 5.1 Market data
- **Real users:** Binance public REST `aggTrades` windows (−5 min … +5 min around each order), via the existing request-weight accounting. Cached as Parquet `exchange=/symbol=/date=` with a short TTL. Raw data can always be re-fetched, so the cache is disposable (the hosting disk is ephemeral).
- **Calibration and demos:** data.binance.vision daily `aggTrades` and `1s` klines, checksum-verified, processed offline by a script Deepanshu runs. Only the small derived tables (hour profiles, anchor distributions) are stored, in Mongo, versioned.
- **Price step per symbol and day:** the smallest positive gap between distinct printed prices that day, cross-checked against `exchangeInfo` `PRICE_FILTER.tickSize` (current value). A disagreement is logged.

### 5.2 Benchmarks (pure functions, in the registry)
- **Prices used:** prints strictly before t (`T < t`, so the user's own fill never contaminates the benchmark).
  - `ask_proxy(t)` = the last buyer-initiated print price (`isBuyerMaker = false`);
  - `bid_proxy(t)` = the last seller-initiated print price.
  - Each must be ≤ 5 s old.
- **The mid:**
  - `mid(t) = (ask_proxy + bid_proxy)/2` when both are fresh and `ask ≥ bid`;
  - otherwise `mid(t)` = the last print, with `mid_quality = 'last_trade'`;
  - otherwise null (excluded, never imputed).
- **Quoted spread proxy:** `max(ask − bid, tick)`.
- **Arrival:** `mid(order creation time)` when the order is known (§5.4); otherwise `mid(first fill)`, flagged `arrival_basis = 'first_fill'`.
- **Interval VWAP** over the order's life, plus TWAP. Labelled as including the user's own prints, which can't be separated out, so they're immaterial for retail sizes and flagged above 1% participation.

### 5.3 Metrics
Signs: `D = +1` for buys, −1 for sells; bps are relative to `mid(t)`.
- **Effective half-spread:** `D·(fill − mid_t)/mid_t·1e4`. Negative means price improvement, or a maker earning the spread.
- **E/Q** = effective / quoted.
- **Realized half-spread at h ∈ {1, 15, 60, 300} s:** `D·(fill − mid_{t+h})/mid_t·1e4`.
- **Price impact at h:** `D·(mid_{t+h} − mid_t)/mid_t·1e4`.
- **Identity, asserted at runtime:** `effective = realized_h + impact_h` (within 1e-9).
- **Markouts:** the existing 1/5/30/60/300 s markouts are kept, and their base switches to `mid`.
- **Order-level IS (bps of intended notional):**
  - `execution = D·(VWAP_fills − arrival)/arrival·filled_qty`;
  - `opportunity = D·(mid(end) − arrival)/arrival·(ordered_qty − filled_qty)`, where `end` = the cancel/expire time, or creation + 1 h for still-open orders;
  - `fees`;
  - `delay = null` (not measurable).
  - **Execution splits into** the spread part (the fill-weighted effective half-spread) and impact/timing (the rest).
  - **Identity asserted:** `IS = execution + opportunity + fees`.
- **Fees:** fee paid in bps = `feeUsd/notional·1e4`, compared with the account's best available rate from the commission snapshot (A3), or the published table labelled "assumed".
- **Lineage:** every metric record carries `marketDataRefs[{source, dataset, symbol, date|window, sha256}]` and `metricsVersion`.

### 5.4 Orders and fee rates (A3, A4 from v5)
- **Fetch order history read-only:**
  - Binance: `allOrders`.
  - Bybit: order history.
  - OKX: orders history.
  - All via `docs-researcher` with citations, inside the existing weight budgets.
- **Group fills by `orderId`.** True `orderType`, creation time, ordered qty, status, and **resting time** (placed → first fill; this replaces the "latency" idea, per ADR-0007).
- **The `isMaker → orderType` inference becomes a `liquidity` field.**
- **Commission snapshot per account and symbol per sync** (`/api/v3/account/commission`), with `effectiveRate(side, liquidity, paidInDiscountAsset)` and hand-computed tests, including the BNB-discount case.

## 6. Scoring v2 (4R-1b)
| Component | Weight | v2 input | Score mapping |
|---|---|---|---|
| Slippage | 35 | Order IS execution part **net of** the spread part (impact/timing), in bps | Piecewise-linear on the **market baseline**: the distribution of mid drift over the same duration and symbol, from the calibration window. Anchors p10→100, p50→75, p90→40, p99→0 |
| Fees | 25 | Fee bps paid vs the best available rate | 100 at or below the best rate, falling linearly to 0 at 2× the best rate. If the best rate is 0 (a zero-fee promotion), the 0 anchor is the published taker rate instead |
| Timing | 25 | The trade hour's index in a per-symbol hour profile: median quoted half-spread proxy + median absolute 1-min return, over a fixed calibration window | `100·(1 − percentile rank of the hour among 24)` |
| Spread | 15 | Effective half-spread paid | Piecewise-linear on the market distribution of effective half-spreads for public prints **of the same symbol and notional bucket** in the calibration window (same anchors). The half-tick floor scores 100 |

- **Thresholds come from data, not taste.**
  - Anchors and profiles are computed offline from a frozen calibration window, initially the 90 days before the version's release date.
  - They are stored in `ScoringVersion` and shown on `/methodology`.
  - The market distributions double as the honest **"market baseline, not peers"** comparison (v5 D4).
- **Statistics:**
  - **Minimum sample:** fewer than 20 fills shows a band, not a letter.
  - **Bootstrap 95% intervals** on every component: resampled by order, 1,000 draws, fixed seed.
  - **Period deltas** carry an interval, plus "not distinguishable from noise" when it crosses 0.
- **Versioning:**
  - `ScoringVersion {id: 'v2.0.0', weights, anchors, hourProfiles, calibrationWindow, metricsVersion, codeHash}`.
  - `audit.integrityHash = sha256(scoringVersion.id + sorted trade ids + per-trade metric hashes + marketDataRefs checksums)`.
  - `/api/audit/verify` recomputes and compares.
  - The UI shows "v1 (rule-based)" or "v2 (measured)", with a link to the methodology.

## 7. Demo rebuild on real prints (4R-2)
- **The generator becomes deterministic** (fixed seed) and draws every fill from real aggTrades:
  - **taker** fills walk prints on the correct aggressor side, starting at t;
  - **maker** fills use the first real opposite-side print that reaches the limit price after placement, with orders recorded so resting time and opportunity cost exist.
- **The three Binance demos are regenerated over the same Jan-2024 window with the same behaviour profiles,** scored under v2 and **re-locked**, with the new grades documented in LOG and the roadmap. Their v1 audits stay stored and reproducible.
- **Rolling demos:**
  - **Bybit:** verify `public.bybit.com` spot trade archives (fields, aggressor side, coverage).
  - **OKX:** verify a public historical trade download.
  - Rebuild over a fixed (not rolling) window; otherwise remove (D3).
- **The whale study is re-run on the new fills,** with "adverse" restricted to bursts before the fill. The result goes to EXPERIMENTS.md, whichever way it comes out.

## 8. Platform improvements in scope
- **Jobs on Mongo** (the existing lease-based sync, extended):
  - idempotency keys (a hash of the job inputs);
  - `maxAttempts` with exponential backoff, then `status: 'dead'` plus a Sentry alert;
  - per-account concurrency of 1 and a global concurrency cap;
  - job types `sync`, `enrich_v2`, `audit_build`, `council`.
- **Outbox:** when trades are inserted, the `enrich_v2` job is created in the **same Mongo transaction** (Atlas replica set), so enrichment can't be lost.
- **`audit_build` is a deterministic, versioned pure function:** (trades + metrics + ScoringVersion) → an append-only `AuditHistory` row plus the current audit projection. Replay and verify fall out of this.

## 9. Testing strategy
- **Hand-computed fixtures** for every metric. Test values are ground truth.
- **Property tests (Hypothesis):** the two identities; the sign symmetry between buy and sell; the mid is never derived from prints at or after t.
- **A committed real-data fixture:** one small slice (about 2 minutes) of real BTCUSDT and BNBUSDT aggTrades with its checksum, used for end-to-end metric tests offline.
- **Registry conformance** (TS + Python); guard tests; offline eval gates unchanged; e2e for the version label and the minimum-sample band.

## 10. Out of scope (unchanged deferrals)
- OBI and spoofing (ADR-0006).
- True latency (ADR-0007).
- Peer benchmarks before there are ≥10 opted-in users.
- The cost-vs-expected model (4b-2): it starts **after** 4R-1/4R-2, on real fills.

## 11. Risks
| Risk | Mitigation |
|---|---|
| Ephemeral disk on the free host | Disposable cache; raw data re-fetchable with checksums; only derived tables persisted |
| REST weight limits during sync | Existing weight accountant; ±5 min windows; batching per symbol-day |
| Calibration window not representative | Versioned; documented; re-calibration = a new minor version, never a silent change |
| Real users at n<20 | Band, not letter (D5); the onboarding copy says so |
| Re-locked demo grades confuse earlier docs | LOG/ROADMAP record the old (v1) and new (v2) grades side by side |

## 12. References
- tcapy (Cuemacro, Apache-2.0): https://github.com/cuemacro/tcapy
- slippage (IS self-checks, Almgren–Chriss): https://pypi.org/project/slippage-tca/
- Peterson & Sirri (2003), trade-direction errors and effective spreads: https://faculty.babson.edu/wp-content/uploads/2024/01/biases-JFM-may-2003.pdf
- Holden & Jacobsen (2014), effective/realized spread and price impact measurement: https://host.kelley.iu.edu/cholden/Holden%20and%20Jacobsen%20(2014)%20Internet%20Appendix.pdf
- Rule 605 amendments (2024): https://www.law.cornell.edu/cfr/text/17/242.605 ; https://www.sec.gov/file/fact-sheet-26 ; https://schwab.com/legal/sec-605
- Perold/Wagner expanded IS: https://rdrr.io/github/braverock/blotter/f/AlgoTCA/AlgoTCA.Rmd
- Order-level IS with ASOF joins: https://questdb.com/docs/cookbook/sql/finance/implementation-shortfall-order.md
- DuckDB Hive partitioning: https://duckdb.org/docs/stable/data/partitioning/hive_partitioning
- tardis-dev normalized trade/book schemas (reference only; paid data on Hold): https://docs.tardis.dev/faq/data
- Multi-tenant SaaS reference patterns (idempotent jobs, per-tenant limits, DLQ): https://tnxn.pages.dev/resources/whitepapers/multi-tenant-saas-architecture-reference ; transactional outbox: https://github.com/anthonykewl20/efncore
- Bybit public data repository: https://pypi.org/project/bybit-history/0.1.1/

# M2 plan: real demos

- **Date:** 2026-11-11
- **Spec:** `docs/superpowers/specs/2026-11-07-measurement-v2-design.md` §7. **Roadmap:** 4R-2.
- **Outcome for a user:** every demo fill is a real public print, or a real limit price that real prints traded through. Orders are recorded, so the demos show order shortfall, resting time and the cost of orders that never filled. The demos get v2 scores. Their v1 audits stay stored, and the old and new grades are published side by side.

## 1. Facts verified before planning (2026-11-11; `docs/research/LOG.md` §J)
- **Binance:** data.binance.vision daily aggTrades with published SHA-256 (M1). January 2024 files use ms timestamps.
- **Bybit:** `public.bybit.com/spot/<S>/<S>_<day>.csv.gz`, with columns `id,timestamp,price,volume,side`. Ids restart in each file. There is no published checksum.
- **OKX:** `www.okx.com/cdn/okex/traderecords/trades/daily/<YYYYMMDD>/<INST>-trades-<day>.zip`. Each file covers a UTC+8 day. Sizes can be in scientific notation. There is no published checksum.
- **`side` is the aggressor on both venues,** tested on the data: 86–91% of prints are consistent, against 96–98% for Binance's documented flag.
- **The locked v1 grades are constants** in `frontend/app/utils/demoProfiles.ts`, checked by `gradeInvariance.test.ts`. The stored v1 audits are in Atlas.

## 2. Design
- **New package `ml-service/demo_v2/`:**
  - `prng.py`: an exact port of mulberry32 from `backend/src/scripts/generateSyntheticTrades.ts`.
  - `profiles.py`: the three Binance profiles, unchanged, plus the venue profiles below.
  - `decisions.py`: the order decisions from the January 2024 1-minute klines, with the **same PRNG call sequence** as the TS generator, so the decisions (time, symbol, side, size, market or limit) are identical to the old demos. That isolates the change to the fills.
  - `tapes.py`: venue loaders into `AggTradeWindow` (Bybit: `is_buyer_maker = side == "sell"`, ids made unique as day index × 10⁹ + id; OKX: two files per UTC day).
  - `simulate.py`: fills and orders.
  - `build.py`: writes `ml-service/demo_v2/out/<demo>/{trades,orders,fee_snapshots}.json` plus `manifest.json` (tape URLs, SHA-256, seed, code hash).
- **Taker (market) order:** it walks the prints on its own aggressor side with `ts ≥ t`, one fill per print, `qty = min(remaining, print qty)`, each fill at that print's price and time. The fills are those real prints.
- **Maker (limit) order:**
  - The limit price is the same-side proxy at `t`: for a buy, the last seller-initiated print strictly before `t` (the bid). The order rests.
  - It fills only when an opposite-aggressor print **trades through** the limit after `t` (for a buy, a seller-initiated print with price < limit), at the limit price, with `qty = min(remaining, print qty)`.
  - Touching the limit is not enough, because queue position is unknown. This is a conservative rule, and it is stated on the demo page.
  - Time to live is 30 minutes; then the order is cancelled, partly filled or unfilled.
- **Fees:**
  - Binance regular tier 0.1% (cited, M1).
  - Bybit and OKX use the old seed's rates: 0.1%, and OKX maker 0.08%. Both need a citation before use; a `docs-researcher` call fetches them.
  - Fee snapshots for the demos carry those same rates, with `source: 'published-schedule'`. They are labelled as published rates, never as an account's own.
- **Venue demos (fixed window, January 2024, seed 42):**
  - demo-bybit: 50 trades, BTCUSDT and ETHUSDT alternating, every other one maker.
  - demo-okx: 50 trades, the same pattern on BTC-USDT and ETH-USDT.
  - demo-multi: 30 trades per venue, with the old maker ratios (0.5 / 0.6 / 0.4).
  - Times are drawn by the seeded PRNG inside the window.
- **Measurement of demo fills:** `measure_account` gains per-venue sources. Production keeps Binance only; the demo build passes Bybit and OKX tapes. Demo accounts remain excluded from the runtime job; the demo build calls the pure functions directly.
- **Grades:**
  - v2 is computed offline in Python (mongomock and the committed version file).
  - v1 is computed offline by a new backend script `backend/src/scripts/gradeDemoFiles.ts`. It uses the frozen engine in-process, with the same enrichment as `seedDatabase.ts`, reads the JSON files and writes nothing.
  - The table "old v1 (locked) · new v1 · new v2" goes into the LOG, the roadmap and the M2 report.
- **Atlas and the lock: Deepanshu.**
  - `backend/src/scripts/seedDemoV2.ts`, a dry run by default. `--apply` replaces only `demo-*` trades and orders, and is written so that nothing outside `demo-*` can be touched.
  - Re-locking changes `demoProfiles.ts` and `gradeInvariance.test.ts`. That is prepared as a patch under `.work/proposed/` and listed in "Waiting for Deepanshu". The old v1 audits stay stored (frozen audits).
- **Whale study re-run:** a new offline script, `ml-service/scripts/whale_prefill_study.py`. It finds whale bursts in the public tapes around the new demo fills and counts "adverse" only for bursts **before** the fill. The result goes to `docs/research/EXPERIMENTS.md` whichever way it comes out. `whale/enrich.py` is never run.
- **Ablation re-record:** `ml-service/scripts/rerecord_ablation_v2.sh`, dry run by default. It lists the runs, the budget and the verification steps; Deepanshu runs it.

## 3. Tests with hand values
**Tape T** (ts ms, price, qty, aggressor): (1000, 100.00, 1.0, sell) · (2000, 100.02, 0.5, buy) · (2500, 100.03, 0.4, buy) · (3000, 99.99, 2.0, sell) · (4000, 100.04, 1.0, buy) · (6000, 99.98, 1.0, sell).
- **Taker buy 1.0 at t = 1500:** fills (100.02, 0.5, 2000), (100.03, 0.4, 2500), (100.04, 0.1, 4000); average price (50.01 + 40.012 + 10.004)/1.0 = 100.026; order FILLED, `updatedAt` = 4000.
- **Taker sell 2.5 at t = 2600:** fills (99.99, 2.0, 3000), (99.98, 0.5, 6000).
- **Maker buy 1.5 at t = 1500:** limit 100.00 (the sell print at 1000). The first sell print below 100.00 after t is 99.99 at 3000 (qty 2.0), so the fill is 1.5 at 100.00, ts 3000. FILLED; resting time 1500 ms.
- **Maker sell 1.0 at t = 2600:** limit 100.03 (the buy print at 2500). The first buy print above 100.03 after t is 100.04 at 4000, so the fill is 1.0 at 100.03.
- **Maker buy 1.0 at t = 4500 with TTL 1000:** limit 99.99 (the sell print at 3000). No sell print below 99.99 before 5500 (the 99.98 print at 6000 is after the TTL), so the order is CANCELED with executedQty 0 and `updatedAt` 5500.
- **Touch is not a fill:** a maker buy with limit 99.99 and a sell print at exactly 99.99 does not fill.
- **PRNG port:** the Python mulberry32(42) first five outputs equal the TS values (computed with node in the test setup and written into the test as literals).
- **Decisions port:** the decisions regenerated in Python match every (`executedAt`, `symbol`, `side`, `orderType`, `quantity`) in the committed `backend/src/data/synthetic/*-trades.json` exactly.
- **Loaders:** the first Bybit and OKX rows of committed 2-minute fixtures (cut like the Binance ones, with `SOURCE.md`) map to the right side; OKX's UTC+8 boundary is handled (the window for a UTC day uses two files).

## 4. Edge cases
- A taker order larger than the visible prints for 5 minutes: it is filled as far as the prints allow, and the rest is left unfilled (status CANCELED, the unfilled part recorded). No fill is invented.
- A maker order placed when no same-side print exists in the 5 s before `t`: there is no limit price, so the decision is skipped and counted in the manifest.
- A day missing from a venue archive: the decisions on that day are skipped and counted; nothing is borrowed from another day.

## 5. Verification
All suites from the master brief. The PRNG and decision ports are proven against the committed old files. The manifest checksums are checked. A `reviewer` pass covers the M2 diff. `docs/milestones/M2.md` closes the milestone.

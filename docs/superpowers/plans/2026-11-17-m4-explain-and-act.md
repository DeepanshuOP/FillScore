# M4 plan: explain and act (past tense, deterministic, source-linked)

- **Date:** 2026-11-17. **Brief:** `docs/agent/MASTER_BRIEF.md` M4. **Roadmap:** §3a, phase 4c (A6, A8, E1, E2, C3) plus the venue comparison and the integrity badge.
- **Outcome for a user:** a short queue of the orders worth a second look, each with a one-line finding built from measured numbers; a replay of any order whose every figure points to the stored measurement and the public data file it came from; rankings that say "too few to tell" instead of ranking noise; a "verified" badge that comes from the integrity check.
- **Invariants:** I1 (findings are past tense: "cost", "coincided with"; never "should"), I2 (every number comes from stored measurements and tested code; no LLM writes a number or a sentence here), I8 (correlation only), no fabricated data (a missing value is "insufficient data", never 0). Demo accounts are read-only: their review state cannot be changed.
- **M8 note:** the screens are minimal and use today's styles. M8 redesigns them with Deepanshu.

## 1. Order replay and cost decomposition (A6, E2)
- `GET /api/audit/orders/:orderId/replay?symbol=` returns, from `orders`, `trades` and `order_measurements` only:
  - the order (type, side, quantity, status, resting time) and its fills (price, size, time, fee);
  - the decomposition of the order-level shortfall in bps and USD (execution = spread + impact and timing; unfilled-order cost; fees; total) exactly as stored;
  - `expectedCost` when present;
  - for each figure a `source`: `{kind: 'order-measurement', field}` and, for the market data, each `marketDataRefs` entry with its public file URL and SHA-256 (data.binance.vision daily file or the REST window). A figure whose source is missing says so.
- Pure builder `services/orderReplay.ts` (tested with hand-computed bps to USD: bps x intended notional / 10,000).
- The fee-schedule gap (A12) is not built here: it needs the published fee table per fill, which the measurement does not store. Noted in the report.

## 2. Exception queue with review states (E1) and grounded one-line findings (C3)
- Deterministic rules over the stored order measurements, each with its own threshold stated in the response (never hidden):
  1. **Above its expected interval:** a market order whose execution cost is above `expectedCost.highBps`.
  2. **Unfilled with a cost:** an order that never filled and whose opportunity cost exceeds the account's own 90th percentile of order total cost (minimum sample 20 orders).
  3. **High total cost:** total shortfall above the account's own 90th percentile (minimum 20 orders).
  The queue lists at most 20, ordered by USD cost, and says how many orders were checked and how many were skipped for lack of measurement.
- Each item carries a one-line finding built from a fixed template that places the stored numbers (no LLM): "This market order cost 12.3 bps in execution; taker events of the same size and hour cost 4.1 bps (90% interval 2.0 to 6.2 bps)."
- Review state `open | reviewed | dismissed` per account and order, in a new collection `exception_reviews` (registry rows). `PATCH /api/audit/exceptions/:orderId` sets it; refused 403 for demo accounts, 401 without a token, account isolation by the token. The queue shows dismissed items only on request.

## 3. Noise-aware rankings (A8)
- Pure function `rankWithNoise(groups)`: each group has `n` and a median with a seeded bootstrap interval; groups with `n < 20` are "too few to tell"; two groups whose intervals overlap are marked "not distinguishable". Used for symbols and hours of the day.
- `GET /api/audit/rankings?by=symbol|hour` over order measurements (execution cost bps).

## 4. Matched venue comparison (A8 constrained)
- Only the user's own past fills, matched by symbol and notional bucket, across venues; any bucket with fewer than 20 fills on either venue is "too few to tell". With one venue the answer is "insufficient data: one venue". No replay on another venue's tape (it would read as routing advice).

## 5. Integrity badge
- The v2 panel shows "Verified" only after `/api/audit/verify` returned `match: true` in this session; otherwise "Not checked". Demo grades: "Offline build, hash recorded" (no verify route for demos).

## Tests (hand-computed first, then green)
Replay USD arithmetic; each exception rule at its boundary (the 20-order minimum, equal to the 90th percentile is not an exception); the finding template (numbers placed, no advice or causal words via `findAdviceTerms` and `findConnectiveTerms`); review-state authorisation (own account only, demo refused, unknown state refused); ranking: `n = 19` too few, overlapping intervals not distinguishable, disjoint intervals ranked; venue match buckets.

## Order of work
§1 replay, §2 queue and findings (with reviews), §3 rankings, §4 venue comparison (pure function and route), §5 badge, minimal UI for each, then the M4 reviewer pass and report.

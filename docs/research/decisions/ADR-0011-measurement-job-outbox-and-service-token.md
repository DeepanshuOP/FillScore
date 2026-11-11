# ADR-0011: The measurement job uses the trade rows as its outbox and a short-lived service token

- **Status:** accepted
- **Date:** 2026-11-11
- **Phase:** M1 Part B (4R-1a Tasks 7–10)

## Context
- Measurement v2 (`ml-service/measure/`) must run on every new real-user fill after a sync. The 4R-1a plan asked for a `measure_v2` job document created in the same Mongo transaction as the trade insert (an outbox), with attempts, backoff and a `dead` state.
- Trades are inserted one by one with an idempotent upsert (`BinanceHistorySync.ingestRaw`). Wrapping each insert and a job write in a transaction adds a dual write that can still drift (for example, a job for trades another sync already measured).
- The ml-service has no service-to-service credential today. It accepts only user access tokens (HS256, `typ: "access"`) signed on `JWT_ACCESS_SECRET`, which both services already hold. A new credential needs Deepanshu's approval.
- Orders are fetched by the backend, but order shortfall is computed in Python. The field registry gives every persisted field exactly one owner.

## Decision
1. **The trade rows are the outbox.** A real-user trade whose `measurement.version` is not the current `MEASURE_VERSION` is pending. `measure_account` (`ml-service/measure/service.py`) measures pending fills in batches of 500. A fill whose market data fails stays pending. A fill that can never be measured in this version (another venue) gets a record with an `unmeasuredReason`, so it is not retried. Re-runs are idempotent with no transaction, and a crash at any point loses nothing.
2. **The trigger** (`backend/src/services/measureTrigger.ts`) runs after each sync job. It repeats the call while trades stay pending and progress is made, retries failures with backoff of 30, 60, 120 and 240 s, and after 5 failed attempts reports to Sentry and stops (`dead`). The next sync picks the pending trades up again.
3. **Service token.** The backend signs `{typ: "measure", accountId, iat, exp ≤ iat + 120 s}` with HS256 on `JWT_ACCESS_SECRET`. The ml-service accepts it only on `POST /internal/measure`, refuses tokens that live longer than 300 s, and refuses a body whose account differs from the token's. `get_account_id` accepts only `typ: "access"`, so a measure token is never a user token, and a user token is never a measure token. The ml-service URL comes from `ML_SERVICE_URL`; without it the trigger is skipped.
4. **Order shortfall has its own collection,** `order_measurements`, owned by the ml-service. The backend owns `orders` and `fee_snapshots` and only reads `order_measurements`.
5. **Fee snapshots are stored raw;** the Commission FAQ formula lives once, in `ml-service/measure/fees.py`. A failed commission fetch stores nothing. No "assumed" rate is ever stored (the plan's `source: 'assumed'` is dropped as fabricated data).
6. **Trade gets no `liquidity` field:** `isMaker` from `myTrades` already records it.

## Alternatives considered
- **A job collection written in a transaction with each trade:** more moving parts, needs a replica set in every test, and does not remove the need for an idempotent worker.
- **A new shared secret for service calls:** cleaner separation, but a new credential needs approval and a Render change. It can replace the measure token later without changing the job.
- **Whole-day data.binance.vision files at runtime:** one busy day is millions of rows, too large for the free-tier service memory. The runtime uses REST windows of at most 30 minutes; whole-day files stay for calibration scripts.

## Consequences
- Deepanshu must set `ML_SERVICE_URL` on the backend service on Render before measurement runs in production (listed in `docs/PROGRESS.md`).
- An order whose status changes after it was measured (an open order later cancelled) is measured again only when one of its fills is newly measured. Open orders are measured only after creation + 1 h, and labelled so.
- The commission snapshot is the rate when fetched, not necessarily the rate when an older trade happened. The fee component says so.

# Real-account validation: what the harness prints

Script: `ml-service/scripts/validate_real_account.py`. It is read-only: the account's trades, orders and commission
snapshots are copied into an in-memory database, where the fills are measured against public Binance prints and the account
is scored. Nothing is written to Atlas. It loads the service env files itself (never source them in a shell) and prints
variable names only.

Run, from `ml-service/`, after the account has synced in the app (so its trades, orders and commission snapshots are stored):

    .venv/bin/python scripts/validate_real_account.py --account <accountId>

It needs the network for public data only: Binance aggregate trades around each fill (no key) and 1-minute klines for the hour
before each market order (no key). Exit code 0 when no identity failure occurred and the integrity check matched.

## The planned shape: about 30 small spot trades

24 market orders on BTCUSDT and ETHUSDT, 6 limit orders of which 3 are cancelled unfilled, "Use BNB to pay fees" off.
The report below is the **exact text printed for a fixture of that shape** (`ml-service/tests/scoring_v2/test_validate_real_account_shape.py`).
The market in that fixture is synthetic and the numbers are hand-computed from it; **a real account will print other numbers in
the same layout**. The run on the owner's real account has not happened yet.

```
account: real-acct-1  (data source: {'real-user': 27})
fills measured: 27 of 27
not measured: none
identity failures: 0
taker fills below the tick floor (better than the opposite proxy): 0
orders measured: 30; orders with a total: 30
scoring version: v2.3.0
  execution              87.50  (27 measured, 0 not)
  unfilled               97.52  (30 measured, 0 not)
  fees                  100.00  (27 measured, 0 not)
grade: A (95.01), 95% range [93.90353444127639, 95.83333333333331]

== Order outcomes (from the exchange's order records)
orders: 30
  LIMIT     6: 3 filled, 0 partly filled, 3 ended with nothing filled, 0 still open
  MARKET   24: 24 filled, 0 partly filled, 0 ended with nothing filled, 0 still open

== Cost against expectation (market orders)
24 market orders: paid 0.012 bps ($0.01); the model expected 0.023 bps ($0.02) for orders of this size in the same hours.
  difference -0.011 bps, 90% interval -0.011 to -0.011 bps; calibration ec1.0.0
  not used: 0 without an expected cost, 6 not priced by the model (limit orders, or beyond its calibrated range), 0 partly filled

== Cost of orders that did not fill completely
3 orders ended below a full fill with a measured cost: $0.03 in total, median 0.238 bps of the intended notional (0 more not measured).

== Fees against the account's rates
27 fills compared: paid $11.82; the account's stated rates give $11.82; difference +0.0000 USD.
  paid above the stated rate (beyond 1%): 0; below: 0; fees paid in BNB: 0; fills without a snapshot: 0

integrity check: matched (2edddf57bf7676b7…)
```

## How to read each part

- **Score and components.** Scoring v2.3.0 (measured). A letter needs at least 20 measured fills; below that the report says "no letter grade" with the reason. A component without enough data says "insufficient data".
- **Order outcomes.** From the exchange's own order records: filled, partly filled, ended with nothing filled (cancelled, expired, rejected), still open.
- **Cost against expectation.** Needs at least 20 usable market orders. With fewer, the report prints "insufficient data: N market orders had a usable expected cost; at least 20 are needed (the account has M market orders)" and why the others were not used. Limit orders are never priced by this model. The expectation is a model calibrated on January 2024 public data (version printed) and the interval is a seeded bootstrap; both are a past-tense comparison, never advice. With exactly 24 market orders the 20 minimum is met only if at least 20 of them have a market-data hour; a market-data failure for more than 4 would print "insufficient data".
- **Cost of orders that did not fill completely.** For each order that ended below a full fill: the price move from the order's arrival to its end, applied to the unfilled quantity (Perold's opportunity cost, `ml-service/measure/orders.py`). An order whose end mid could not be read is counted as not measured.
- **Fees against the account's rates.** Each fill's paid fee against notional x the effective rate from the account's commission snapshot (maker or taker, buyer or seller; the BNB discount only if the fee was paid in BNB). The 1% band absorbs the exchange's rounding. A fill without a snapshot is not compared. With "Use BNB" off, the BNB count should read 0.

## Limits of this check

- It has been run on a synthetic fixture and on unit cases, not on a real account.
- The kline path (public API, weight 2 per hour) stops at the first 418 or 429 and then prints the cost lines as "insufficient data" with the reason.
- Fees paid in the base asset (a Binance spot buy pays the fee in the bought asset) are valued by the stored `feeUsd`; if `feeUsd` is missing the fill is not compared.

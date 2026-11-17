# ADR-0015: Expected cost per order, calibrated on public taker events

Status: built 2026-11-17 (M3 §2). Deepanshu approves.

## Context

The letter of scoring v2.3.0 compresses near the top on liquid pairs (94.35, 93.41, 93.68 for three very different synthetic
profiles; ADR-0014). The measure that separates accounts is the cost of an order against what a comparable order costs in the
same market. The M3 plan asks for that benchmark, with an interval, or "insufficient data".

## Decision

**Model.** For a market order of notional N and quantity Q, in a symbol with hour volatility sigma (bps) and hour volume V:

    expected cost (bps) = s/2 + Y * sigma * sqrt(Q / V)

- The square-root form follows Toth et al. 2011, Eq. (1) in section 1, and Donier and Bonart 2015, Eq. (1) in section 1 (both read
  in full on 2026-11-17; LOG §Q). Those equations give the average impact of a metaorder with the *daily* volatility and the
  *daily* volume, with a multiplier "of order unity". Almgren et al. 2005 could not be read (HTTP 403) and is cited for nothing.
- **Our adaptation, stated plainly.** We use the volatility and volume of the *hour before* the order, and the cost of one order
  against the mid-price before it (half-spread included), so the fitted multiplier is ours (Y between 0.0965 and 0.397 per symbol)
  and is not comparable with the 0.9 that Donier and Bonart report. The exponent is fixed at 1/2 and not fitted.
- s/2 is the median effective half-spread of the fit-day taker events under 1,000 quote units, per symbol.
- Y is fitted by least squares through the origin on all fit-day events (numpy).
- **Interval.** Split conformal on absolute residuals, per symbol and size bucket (under 1k, 1k-10k, 10k-100k, over 100k), 90%,
  from calibration days that the fit never saw. A bucket with fewer than 200 calibration events gets no interval.
- **No residual model yet, and the plan's test for one was not run.** The plan adds a gradient-boosted residual only if it
  lowers the held-out error of the plain model by at least 10%. That needs a pinned scikit-learn (a free, BSD-3 dev dependency;
  none is installed). We did not install it or run the comparison in this step, so Model 1 stands alone and the question is open
  (PROGRESS). Held-out coverage of the plain model is inside 89-95% in every bucket (LOG §Q), so the interval is valid as it is;
  a residual model could only make it narrower. If it does, it is a new calibration version.
- **Applies to market orders only.** The model is calibrated on taker events, so a resting order says "outside the model".
  An order whose size against the hour's volume is outside the calibrated range gets "insufficient data": no extrapolation.

**Data and split.** January 2024 daily aggTrades of BTCUSDT, ETHUSDT, BNBUSDT and SOLUSDT (124 checksum-verified files, the same
files as the M2 build). Days go to fit (the 1st and 2nd day of every four), calibration (the 3rd) or test (the 4th) by a fixed rule
(`expected_cost.calibrate.split_days`). Each day's events are thinned by a deterministic stride to at most 50,000.

**Stored form.** `ml-service/expected_cost/versions/ec1.0.0.json` (calibration, day lists, source file checksums, code hash).
Each order measurement carries `expectedCost` with the version and the SHA-256 of that file. A committed version is never edited.

**Where it is computed.** `measure_account(..., expected_cost=hook)`: the job stores the hook's result in the order measurement.
The offline demo build passes a hook that reads the hour before the order from the cached tapes. The runtime passes none, because
it has no source for the hour before an order yet (the REST window of the job is at most 30 minutes). Real accounts therefore
read "insufficient data" until that source exists (an open item in PROGRESS).

**Why `MEASURE_VERSION` stays 1.0.0 (the plan said 1.1.0).** `_order_plan` skips an order whose fills are not at the current
`MEASURE_VERSION`, so a bump would re-measure every stored fill of every account through the REST source. `expectedCost` is a
separate calculation over the stored measurement, and has its own version (`ec1.0.0`).

**Not part of the score or its hash.** The v2.3.0 grades do not change. `expectedCost` is left out of the integrity hash input
(`scoring_v2/score.py`), because the score never reads it: writing it first changed the three demo hashes while the composites
stayed equal, which a test now forbids.

**Account line.** "Cost vs expected": the notional-weighted execution cost of the account's market orders, the same weighting of
their expected cost, the difference, and a seeded bootstrap interval over orders (2,000 resamples, seed 20240101; 90%). Fewer than
20 usable market orders: "insufficient data". It is stored beside the grade (`costVsExpected`), not inside `result`.

## Consequences and limits (all measured or stated, none hidden)

- One month of one year (January 2024). The demo data come from the same month; an account trading in another regime needs a new
  calibration version.
- The held-out days are interleaved with the fit days (every fourth day), so they are not a later period; coverage on a later
  period is not measured.
- Events in the first hour of a UTC day have no hour context (days are read one at a time) and are dropped from calibration.
- A taker *event* (one millisecond, one side) is smaller than many orders, which walk several prints. The benchmark is "events
  of the same size", not "orders of the same size".
- The 90% interval is wide against the cost scale on the tightest pair (BTCUSDT: 0.39 bps in the smallest bucket, against a
  half-spread of 0.001 bps). It is the honest width of single-event cost noise.
- The demo orders are simulated (real prints, synthetic decisions). Their cost vs expected checks the pipeline; it says nothing
  about a trader.

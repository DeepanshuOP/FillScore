# DRAFT blog 1 of 3 (pillar: Measured). For Deepanshu to edit and publish. Written in the first person for you; change anything.

# The fee on the screen is not the price you paid

When you buy crypto in an app, the fee table says one number. The price you actually got can be very different. Two independent studies in 2026 measured this on European platforms, and the gap was large. Both are small, so read the numbers as examples, not as a verdict.

- Frankfurt School Blockchain Center, with intas.tech (news item of 17 March 2026): 432 buy-then-sell round trips on nine regulated providers, January and February 2026. The lowest average total round-trip cost was 0.53% (Bitvavo). The highest was 6.45% (Coinbase).
- TUM School of Management (a two-page research brief, April 2026): 50 round trips of EUR 100 on six platforms, plus 924 order-book snapshots. The mean round-trip cost ran from -0.58% to -7.49%. The "hidden spread" (the real cost minus the cost the published fee schedule predicts) was 0.08 percentage points on Bitvavo and 4.51 on Coinbase. The authors say the samples are small (six round trips on four of the platforms), the EUR 100 size makes fixed fees look large, and the study was done in cooperation with one of the platforms it ranks.

These are retail apps, and they are not the same as an exchange's order book. That is the point: you cannot see the cost in the fee table.

## What I built

FillScore measures what your own past orders cost, from public data, and says plainly when it cannot. It does not tell you what to do next. It is open source, and you connect a key that can only read.

For Binance the spread can be **measured**, not guessed. Binance publishes every trade with a flag that says who the aggressor was. From the trades just before your fill, FillScore builds the mid price, and then:

- **Effective half-spread** = side × (your price − mid) ÷ mid × 10,000, in basis points. A buy at 100.02 with a mid of 100.01 paid 0.9999 bps.
- **Realized half-spread and price impact** at fixed horizons, so the cost can be split into what stayed a cost and how far the price moved with you. (The price moved *with* your trade; the data do not show that your trade moved it.)
- **Implementation shortfall** of the whole order, including the part that never filled, following Perold (1988). If an order was never filled, its cost is the opportunity, not zero. If something cannot be known, FillScore says "insufficient data" instead of filling in a number.
- **Your real fee rate**, from the commission rates your account actually has.

Every number carries lineage: the public data file it came from and its SHA-256, so anyone can fetch the same data and check.

## Two things the first version got wrong

I want to be open about what I found when I tested my own work.

1. **The timing score mostly measured volatility.** My first measured "timing" component ranked the three demo traders in the reverse order of their discipline, because a volatile hour looks expensive. I rebuilt it from the median cost of a taker event per hour (ADR-0013). Then I found that the hour barely changes the cost of a trade at all, so timing is now reported but not scored (v2.3.0).
2. **The score does not tell my three synthetic traders apart.** Under v2.3.0 they all grade A, from 93.4 to 94.3 out of 100 (`ml-service/demo_v2/out/grades_v2.json`: 94.35, 93.68 and 93.41). The demo traders are synthetic, and I did not tune the score to separate them (ADR-0014).

## Try it and check it

The formulas are published as a dependency-free Python package, `fillscore-metrics`, generated from the service's own code, so the published formulas cannot drift from the scoring. The method page of the app is generated from the same code.

*Limits to state in the post:* no real user has been scored yet; the cost-vs-expected model is fitted on one month (January 2024); the Kraken file reading has not met a real file.

## Sources for every claim above

| Claim | Source in the repository |
|---|---|
| Frankfurt and TUM figures and their limits | `docs/research/MARKET_2026-11.md` §4 (the main session re-checked both sources on 2026-11-11) |
| Effective half-spread formula and the 0.9999 bps example | `packages/fillscore-metrics/fillscore_metrics/metrics.py` (docstring) and `tests/test_examples.py` |
| Implementation shortfall, opportunity cost, "insufficient data" | `ml-service/measure/orders.py`; `docs/methodology/measurement-v1.0.0.md` |
| Aggressor flag in Binance data | `ml-service/measure/data/aggtrades.py` (docstring; checked on real files, `docs/research/LOG.md` §F) |
| Timing finding | `docs/research/decisions/ADR-0013-timing-from-event-cost.md`, `docs/research/LOG.md` §N |
| Demo grades 93 to 94 and no separation | `docs/research/decisions/ADR-0014-shortfall-decomposition.md`, `docs/PROGRESS.md` |
| Package cannot drift | `ml-service/tests/test_metrics_package.py` |

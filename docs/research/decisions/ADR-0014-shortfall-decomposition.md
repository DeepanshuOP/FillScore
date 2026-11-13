# ADR-0014: Scoring v2.3.0, the implementation-shortfall decomposition

Status: accepted by the architect review of 2026-11-14 (built 2026-11-14; Deepanshu approves).
Supersedes the component set of v2.0.0 to v2.2.0 for new scores. Those versions stay reproducible.

## Context

After the seed (item 9) the live demo page showed two problems that the score itself had.

1. v2.2.0 gives timing a constant 100 on the three demos. No hour of the day costs more than one price step above the
   cheapest hours (ADR-0013), so a quarter of the weight separated nobody.
2. The score left out the largest measured cost on the page. On demo-moderate the unfilled orders had a median cost of
   about 50 bps, and the order panel listed it, but no component scored it.

The page also named the components differently from the cost panel next to it ("slippage 77" beside "execution 0.0 bps").

## Decision

The scored components are the terms of the order-level implementation shortfall (Perold 1988; `measure/orders.py`):

| Component | Unit | Mapping | Weight |
|---|---|---|---|
| Execution cost (spread paid + impact and timing) | order | mean of the order's spread score and its impact score, both on the market anchors of v2.2.0 (10th, 50th, 90th, 99th percentile of public taker events, and of the signed mid drift of random-side entries by duration, scoring 100, 75, 40, 0) | 1/3 |
| Fees | fill | fee paid against the account's best available rate: 100 at or below it, linear to 0 at twice it (unchanged) | 1/3 |
| Unfilled orders | order | `fill_ratio x 100 + (1 - fill_ratio) x S`; S places the signed mid drift per unit of unfilled quantity among the drifts of random-side entries over the order's duration (the impact anchors) | 1/3 |

Timing is reported as information, never scored: "No material difference between hours." when every fill's hour is
within the one-price-step floor of the cheapest hours (ADR-0013 floors, kept in the version file), else the count of fills
above the floor and their mean excess in bps.

v2.3.0 recalibrates nothing. `scripts/build_scoring_v230.py` copies the v2.2.0 calibration (same 90 days, same anchors,
profiles and floors; `test_v230_keeps_the_v220_calibration_and_decomposes_the_shortfall` pins it). Version file SHA-256
`2a4d6b1ad79a2b7d22aecfe7cae7b0d894db2865a54b4dfae2f8d77cea0f4fa3`. The panel leads with the cost of all orders in dollars and in
bps of intended notional (`GET /api/audit/orders-summary`, `totals`), beside the letter, and the component names are the
names of those cost lines.

## Why these mappings (data)

Measured totals over all orders of the three seeded demos (`ml-service/demo_v2/out`, bps of intended notional):

| Demo | Orders | Unfilled | Execution | Unfilled-order cost | Fees | Total |
|---|---|---|---|---|---|---|
| demo-aggressive | 311 | 2 | -0.004 bps ($-0.02) | 0.230 bps ($1.41) | 9.953 bps ($60.97) | 10.179 bps ($62.36) |
| demo-moderate | 245 | 11 | -0.119 bps ($-0.53) | 2.394 bps ($10.63) | 9.452 bps ($41.98) | 11.726 bps ($52.08) |
| demo-disciplined | 144 | 6 | -0.095 bps ($-0.17) | 1.660 bps ($3.02) | 9.656 bps ($17.55) | 11.221 bps ($20.39) |

- **Execution.** Spread and impact are two measured parts of one cost (`executionBps = spreadBps + impactTimingBps`, checked at
  runtime). Both already have data-derived anchors on the same four-point ladder, so their mean stays on that ladder. A single
  combined anchor would need a new calibration over the raw tapes, which the 90-day calibration discarded after streaming;
  it is not built. The demos' execution cost is a few thousandths of a bp (BTC trades at the tick), so the spread part scores
  100 and the impact part scores near 67 at the duration of these orders.
- **Fees.** The only term measured against the account's own alternative, not the market. On the demos every fill pays the
  published 0.1000% rate on both sides, so the component is 100 for every fill and is marked "not independently measured".
- **Unfilled orders.** The opportunity cost needs a baseline. A non-fill is **selected on an adverse move**: a passive order stays
  unfilled when the price runs away. In the seeded demos 0 of 18, 0 of 28 and 0 of 12 orders with an unfilled part moved in the
  trader's favour (`opportunityBps` below zero), so the unconditional drift anchors are exceeded by selection and the unfilled share
  scores low for every trader. The rule is documented as such on the methodology page: it describes how large the move was, not
  how likely a non-fill is. It is a bounded term: the filled share of every order scores 100, and the component is weighted by
  intended notional, so 11 unfilled orders in 245 move it by about 3.5 points.
- **Timing.** The hour-to-hour range sits inside the day-to-day noise (ADR-0013). A constant 100 on 25% of the weight raised
  every grade without separating anyone; reporting it as information keeps the finding and drops the weight.

## Weights and sensitivity

The three terms are scored against three different yardsticks (market baseline, the account's own best rate, a market
drift). No term is more important by judgment, so the weights are equal. Other weightings, on the same component scores
(execution 83.4 / 83.7 / 83.5, fees 100 / 100 / 100, unfilled 99.7 / 96.5 / 97.5 for aggressive / moderate / disciplined):

| Weights (execution, fees, unfilled) | aggressive | moderate | disciplined |
|---|---|---|---|
| 1/3, 1/3, 1/3 (used) | 94.35 A | 93.41 A | 93.68 A |
| 0.50, 0.25, 0.25 | 91.61 A | 90.97 A | 91.14 A |
| 0.25, 0.50, 0.25 | 95.76 A | 95.05 A | 95.26 A |
| 0.25, 0.25, 0.50 | 95.68 A | 94.19 A | 94.64 A |
| 0.40, 0.40, 0.20 | 93.29 A | 92.78 A | 92.91 A |
| 0.60, 0.00, 0.40 (fees not scored) | 89.90 B | 88.82 B | 89.11 B |

Five of six variants give three A's; the order of the three demos is the same in all six. Nothing was tuned toward an expected order.

## Result

Demo grades, v2.3.0 (v2.2.0 in brackets): aggressive 94.35 A (90.28 A), moderate 93.41 A (90.48 A), disciplined 93.68 A (90.06 A).
The v1 grades stay as published (C, B, A). The new score **does not separate the three demo profiles, and ranks the aggressive
profile first by 0.7 points**. This is a property of the demo data and of the fee schedule used to build it: the demo traders'
behaviour is synthetic; their fills walk real prints, where BTC trades at the tick, and maker and taker fees are equal (0.1% / 0.1%), so
neither taking nor making costs more. Grades will separate on real accounts where fee tiers and spreads differ; no real account has been scored yet.

## Consequences

- v2.0.0 to v2.2.0: code paths, version files and tests are kept (`test_version.py` pins every file; `test_older_versions_still_score_as_before`).
- `SCORING_V2_VERSION = "v2.3.0"`; stored real-user scores under older versions verify under their own version id.
- The component key for the unfilled term is `unfilled`: the word "opportunity" is on the advice-term list of the copy tests.
- Open: a combined execution anchor (needs a new calibration run), and an unfilled-order baseline conditioned on non-fill (needs a
  passive-order simulation on the tapes). Both would be a new version.

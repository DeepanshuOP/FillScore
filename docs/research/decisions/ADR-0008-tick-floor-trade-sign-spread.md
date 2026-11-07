# ADR-0008: Spread from aggTrades trade signs with a tick floor; CS/AR as cross-check only

- **Status:** proposed
- **Date:** 2026-11-07
- **Phase:** audit 2026-11 → 4c accuracy

## Context
The 2026-11 audit (`.work/audit_queries/q3_spread_threeway.py`) measured the full spread on four real days. Method: take adjacent aggTrades with opposite aggressor flags (`isBuyerMaker` flips) within 100 ms; spread = buyer-initiated price − seller-initiated price.

| Pair, day | Heuristic ×0.15 | CS | AR | Trade-sign (median = p90) | Tick |
|---|---|---|---|---|---|
| BTCUSDT 2024-01-07 | 0.576 | 0.697 | 1.218 | 0.0023 | 0.0023 |
| ETHUSDT 2024-01-07 | 0.619 | 0.806 | 1.521 | 0.0446 | 0.0446 |
| BNBUSDT 2024-01-15 | 1.880 | 3.665 | 3.358 | 3.1596 | 3.1596 |
| SOLUSDT 2024-01-15 | 2.181 | 3.781 | 4.385 | 1.0492 | 1.0492 |

All values are bps. On every day the quoted spread was exactly one tick.

## Decision (proposed)
- **Effective half-spread per fill:** half the median trade-sign spread in a ±5 min window around the fill, from that day's aggTrades. Floor it at half a tick (tick from the data, or exchangeInfo).
- **Fallback when aggTrades is not cached:** the tick size.
- **CS/AR:** keep reporting them as a cross-check; stop using them as the spread input.
- **Cap:** replace `HALF_SPREAD_CAP_BPS = 1.0` with the measured value.

## Alternatives considered
- **CS/AR conservative (ADR-0004):** overstates liquid pairs 18–300×.
- **The 1-min range heuristic:** no basis.
- **Futures bookTicker:** discontinued 2024-03-30, and a different market.

## Consequences
- **Cost:** aggTrades downloads of about 3–12 MB per symbol-day for these pairs (vs 2–3 MB for 1 s klines). Cache per day.
- **Grades:** if applied to the scorer's spread component, this changes the locked demo grades. Needs a ScoringVersion decision.
- **Counterfactual:** spread credits shrink for BTC/ETH and grow for BNB.

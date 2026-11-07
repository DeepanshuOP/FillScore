# ADR-0004: Use the smaller of Corwin–Schultz and Abdi–Ranaldo, floored at 0, capped at 1 bp half-spread

- **Status:** accepted (superseded in part by ADR-0008 if that is accepted)
- **Date:** 2026-11-07 (documented retrospectively by the 2026-11 audit)
- **Phase:** 4a

## Context
- There is no historical quote data for spot (data.binance.vision spot offers only aggTrades, klines and trades).
- The 4a counterfactual needs a spread credit.
- Two bar-based estimators exist:
  - Corwin & Schultz (2012), J. Finance 67(2):719–760;
  - Abdi & Ranaldo (2017), RFS 30(12):4437–4480.
- Both were designed for daily equity bars and are inflated by volatility.

## Decision
- **Inputs:** 1-min bars over ±30 min of the fill, with at least 10 minute-pairs.
- **Combination:** report both estimators; use the **smaller** one (`conservative_spread_bps`); floor negatives at 0.
- **Spread credit:** half of that value, capped at `HALF_SPREAD_CAP_BPS = 1.0` (`ml-service/agents/counterfactual.py`).
- **Code:** `ml-service/agents/metrics/spread_estimators.py`.

## Alternatives considered
- **Either estimator alone:** no cross-check.
- **Raw 1-min range heuristic** (`MarketDataService.estimateSpreadBps`, ×0.15): no theoretical basis.

## Consequences
The 2026-11 audit compared the estimators with a trade-sign spread from real aggTrades on the same days (full spread, bps):

| Symbol | CS | AR | Real (= 1 tick) |
|---|---|---|---|
| BTC | 0.70 | 1.22 | 0.0023 |
| ETH | 0.81 | 1.52 | 0.045 |
| SOL | 3.78 | 4.39 | 1.05 |
| BNB | 3.67 | 3.36 | 3.16 |

- **The estimators overstate liquid pairs by up to ~300×.**
- **The 1 bp cap *understates* BNB** (Jan-2024 tick 0.1, about 3.16 bps).
- **The code floors per pair and then averages.** For Abdi–Ranaldo this differs from the paper's preferred "average then root" estimator and biases the result upward.
- **See ADR-0008** for the proposed replacement.

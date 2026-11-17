# fillscore-metrics

The measurement formulas of [FillScore](../../README.md), as a small Python library with **no dependencies**. FillScore grades *past* execution
of crypto trades against real public market data. This package holds only the arithmetic: it takes prices, sides and quantities you already
have and returns basis points. It fetches no data, predicts nothing and gives no advice.

```python
import fillscore_metrics as fm

fm.effective_half_spread_bps(1, 100.02, 100.01)            # 0.9999 bps: a buy at 100.02 against a mid of 100.01
fm.realized_half_spread_bps(1, 100.02, 100.01, 100.04)     # -1.9998 bps: against the mid 15 s later
fm.price_impact_bps(1, 100.01, 100.04)                     # 2.9997 bps: the mid moved this far with the trade
fm.order_is(1, 2.0, [(100.02, 1.0, None), (100.04, 0.5, None)], 100.0, 100.10, 0.15, "order")["totalBps"]   # 12.0
print(fm.methodology_markdown())                           # the method text, generated from the registered functions
```

## What is in it

| Function | Meaning |
|---|---|
| `effective_half_spread_bps(side, fill, mid)` | Distance of the fill from the mid, signed so that a cost is positive (SEC Rule 605 vocabulary). |
| `realized_half_spread_bps(side, fill, mid, mid_after)` | The part still a cost after the market moved for a horizon. |
| `price_impact_bps(side, mid, mid_after)` | How far the mid moved in the direction of the trade. It coincided with the trade; it does not show cause. |
| `eq_ratio`, `check_decomposition` | Effective over quoted half-spread; the identity effective = realized + impact. |
| `order_is(...)` | Implementation shortfall of one order (Perold 1988): execution (split into spread and impact/timing), unfilled cost, fees. A value that cannot be known is `None`, never zero. |
| `effective_rate(snapshot, side, is_maker, paid_in_discount_asset)` | A Binance account's effective commission rate from its commission snapshot (Binance Commission FAQ). |
| `REGISTRY`, `methodology_markdown()` | Every metric with its unit, inputs and formula text. |

Bad input (a zero or non-finite price, a side other than +1 or -1) raises `ValueError`; nothing is guessed.

## It cannot drift from the product

The Python files here are **generated** from the service's own code (`ml-service/measure/`) by `ml-service/scripts/sync_metrics_package.py`.
The only change is that the measurement version is written into the registry instead of imported. A test in the service fails when the
committed package is not exactly what the script generates, and another runs the package and the service side by side on a grid of inputs
and requires identical results. The package version is the measurement version of FillScore (`__version__`).

## Install and test

```bash
pip install ./packages/fillscore-metrics          # from the FillScore repository
cd packages/fillscore-metrics && python -m pytest tests   # the worked examples from the metric documentation
```

Not published to PyPI: publishing is an outward-facing step for the project owner.

## What it is not

It is not the FillScore score. Scoring (versioned calibration, minimum samples, bootstrap intervals) and the market-data fetching stay in
the FillScore service. A number from this package describes what happened to one fill or one order; it does not say what to do next.

MIT licence.

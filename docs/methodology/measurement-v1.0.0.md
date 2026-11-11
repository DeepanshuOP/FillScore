# Measurement methodology (version 1.0.0)

Generated from the code by `ml-service/scripts/gen_methodology.py`. Do not edit by hand.

## Benchmarks

```text
Benchmarks built from public aggressor-side prints. Pure functions: no I/O, no scoring.

Why prints can stand in for quotes: a buyer-initiated print executed at the best ask of that moment, and a
seller-initiated print at the best bid. The exchange labels the aggressor on every print (`is_buyer_maker`),
so the side is measured, not inferred. Spot order-book history is not published, so these are proxies:

  ask proxy(t) = price of the last buyer-initiated print strictly before t
  bid proxy(t) = price of the last seller-initiated print strictly before t

Rules:
  * Strictly before t (`ts < t`). A fill's own print sits at its own millisecond and must never set its own
    benchmark. Prints inside one millisecond are ordered by aggregate id.
  * Each proxy must be at most `max_age_ms` old (default 5000). A stale proxy is never used.
  * Two-sided mid = (ask + bid)/2 when both are fresh and ask >= bid.
  * Otherwise the last print strictly before t, if fresh: quality "last_trade".
  * Otherwise nothing. A mid is never imputed.

Known limit: when the price moves between the two proxy prints, ask - bid overstates the real spread and the
mid lags by up to half that move. The ages of both proxies are returned so callers can report or filter on them.
```

Horizons for realized spread and price impact: 1 s, 15 s, 60 s, 300 s.

## Metrics

### `fill.effective_half_spread_bps`

- Unit: bps of mid
- Inputs: side, fill price, mid at fill time

D x (fill - mid) / mid x 10,000. The distance from the mid that the fill paid. A taker normally pays about half the quoted spread. A negative value means price improvement, or a maker fill that earned the spread. Example: buy at 100.02 with mid 100.01 gives 0.9999 bps.

### `fill.eq_ratio`

- Unit: ratio
- Inputs: effective half-spread (bps), quoted spread (price units), mid at fill time

Effective half-spread divided by the quoted half-spread, where the quoted half-spread is (quoted spread / 2) / mid x 10,000 and the quoted spread is max(ask proxy - bid proxy, one tick). 1.0 means the fill paid exactly the quoted half-spread; below 1.0 is price improvement. Not available when the quote is not two-sided.

### `fill.price_impact_bps`

- Unit: bps of mid
- Inputs: side, mid at fill time, mid at fill time + h

D x (mid after h - mid at fill) / mid at fill x 10,000. How far the mid moved in the direction of the trade within h seconds. It coincided with the trade; it is not shown to be caused by it. Example: buy, mid 100.01, mid 15 s later 100.04 gives 2.9997 bps.

### `fill.realized_half_spread_bps`

- Unit: bps of mid
- Inputs: side, fill price, mid at fill time, mid at fill time + h

D x (fill - mid after h) / mid at fill x 10,000, for h = 1, 15, 60 and 300 seconds. The part of the effective half-spread that was still a cost after the market had h seconds to move. Example: buy at 100.02, mid 100.01, mid 15 s later 100.04 gives -1.9998 bps.

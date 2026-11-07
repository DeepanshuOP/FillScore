# ADR-0006: No historical OBI or spoofing detection; collector-forward only, never synthetic

- **Status:** proposed
- **Date:** 2026-11-07
- **Phase:** audit 2026-11 (T2.11, T2.14)

## Context
- **Spot (S3 listing, 2026-11-07):** data.binance.vision offers only `aggTrades`, `klines` and `trades`, daily and monthly. No book data. https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix=data/spot/daily/
- **USD-M futures:** daily data adds `bookDepth`, `bookTicker` and `metrics`.
  - BTCUSDT `bookDepth` covers 2023-01-01 → 2026-11-06.
  - `bookTicker` daily ends 2024-03-30.
- **The `bookDepth` format** (verified on `BTCUSDT-bookDepth-2024-01-15.zip`) is `timestamp, percentage, depth, notional`: cumulative depth within ±1…±5% of price, about every 30 s. These are bands, not L2 levels.
- **OBI** (ROADMAP T2.11) is defined over the top 5 levels. **Spoofing** (T2.14) needs L2 at t and t+200 ms.

## Decision
- Defer both.
- If OBI is ever built, it is a spot collector that we run (`@depth20@100ms`), forward only, labelled with its start date. Trades before that date get `obiAtExecution: null`, which excludes the component rather than penalising the trade.
- Never generate a synthetic OBI.
- Never present the futures depth-band imbalance as spot OBI.

## Alternatives considered
- **Futures `bookDepth` ±1% imbalance as a proxy:** about 4,000× coarser than top-of-book on BTC, and a different market from the graded spot fills. Acceptable only as a separately named, futures-labelled context metric.
- **Synthetic OBI:** violates product rule 4.

## Consequences
No OBI or spoofing features before a collector exists. A collector needs always-on infrastructure (ROADMAP §4.2).

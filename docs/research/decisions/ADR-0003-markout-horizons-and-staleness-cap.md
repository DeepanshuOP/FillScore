# ADR-0003: Markout horizons 1/5/30/60/300 s and a 5 s staleness cap on 1 s klines

- **Status:** accepted
- **Date:** 2026-11-07 (documented retrospectively by the 2026-11 audit)
- **Phase:** 4a

## Context
- Post-trade markouts need a price path after each fill.
- data.binance.vision 1 s klines are 5–20× lighter than aggTrades. BTCUSDT runs about 2–3 MB/day vs 6–65 MB/day (REPORT_phase4a §3).
- From 2025-01-01, spot timestamps are in microseconds.

## Decision
- **Formula:** `markout_bps = side_sign × (P(t+h) − fill)/fill × 1e4`. Buy = +1, sell = −1; positive means the price moved in the trader's favour.
- **Horizons:** h ∈ {1, 5, 30, 60, 300} s.
- **P(t+h):** the close of the last 1 s bar that had ended by floor(t+h). No look-ahead.
- **Staleness:** a value is null if that bar ended more than 5 s (`STALENESS_CAP_S`) earlier.
- **Missing values** are excluded, not zeroed.
- **Code:** `ml-service/agents/metrics/markout_packet.py`, mirrored in `backend/src/analytics/markouts.ts`.

## Alternatives considered
- **aggTrades:** sub-second precision, but much heavier; only needed for horizons under 1 s.
- **1-min klines:** too coarse for 1–30 s horizons.

## Consequences
- **Each horizon is shortened** by the sub-second fraction of the fill time (documented in REPORT_phase4a §3).
- **The reference market is Binance spot for every fill,** including Bybit/OKX fills.
- **Audit 2026-11:** markouts on the three rolling-timestamp demo accounts have a median of about +3,500 bps at h = 60. Their fill prices are not real-market prices: 100% sit outside the real 1 s bar, by a median of 3,224–4,184 bps (audit query Q2). How they were generated is UNVERIFIED (see "Evidence withdrawn" in `docs/research/AUDIT_2026-11.md`). The formula is correct; the input is not. **Do not display markouts for trades whose fill price is not real-market-anchored.**

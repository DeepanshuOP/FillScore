"""Square-root impact model of the expected execution cost of an order, in bps.

    expected cost = s/2 + Y * sigma * sqrt(Q / V)

  s/2    median effective half-spread of taker events of a similar size (bps), measured on public prints
  sigma  volatility over the hour before the order (bps)
  Q / V  order quantity over the quantity traded in that hour (dimensionless participation, same units)
  Y      a constant of order one, fitted by least squares through the origin on the part of the realised cost above s/2.

The square-root form is the "square-root law" of market impact: impact grows with the square root of the participation
rate. Sources: Toth, Lemperiere, Deremble, de Lataillade, Kockelkoren, Bouchaud, "Anomalous price impact and the critical
nature of liquidity in financial markets", Phys. Rev. X 1, 021006 (2011), DOI 10.1103/PhysRevX.1.021006; Almgren, Thum,
Hauptmann, Li, "Direct estimation of equity market impact", Risk 18(7), 2005. Both records were verified against OpenAlex on
2026-11-14 (LOG §P); their text was not read in this session, so this module claims only the square-root shape and a fitted
constant, and the exponent is not fitted: it is fixed at 1/2. The exponent that Almgren et al. report for equity temporary
impact has to be read from the paper before any statement about it is published.
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np


def _finite(name: str, v) -> float:
    if not isinstance(v, (int, float, np.floating, np.integer)) or isinstance(v, bool) or not math.isfinite(float(v)):
        raise ValueError(f"{name} must be a finite number, got {v!r}")
    return float(v)


def participation_term(sigma_bps: float, quantity: float, volume: float) -> float:
    """sigma * sqrt(Q / V), bps. The feature the model is linear in."""
    s, q, v = _finite("sigma_bps", sigma_bps), _finite("quantity", quantity), _finite("volume", volume)
    if s < 0 or q < 0:
        raise ValueError("sigma_bps and quantity cannot be negative")
    if v <= 0:
        raise ValueError("volume must be positive")
    return s * math.sqrt(q / v)


def expected_cost_bps(half_spread_bps: float, sigma_bps: float, quantity: float, volume: float, y: float) -> float:
    """s/2 + Y * sigma * sqrt(Q / V)."""
    hs = _finite("half_spread_bps", half_spread_bps)
    if hs < 0:
        raise ValueError("half_spread_bps cannot be negative")
    return hs + _finite("y", y) * participation_term(sigma_bps, quantity, volume)


def fit_y(features: Sequence[float], excess_cost_bps: Sequence[float]) -> float:
    """Least squares through the origin: Y = sum(x r) / sum(x^2), with x the participation term and r the realised cost
    minus s/2. Needs at least two events and a non-zero feature."""
    x, r = np.asarray(features, dtype=float), np.asarray(excess_cost_bps, dtype=float)
    if x.shape != r.shape or x.ndim != 1:
        raise ValueError("features and excess costs must be one-dimensional and of equal length")
    if x.size < 2:
        raise ValueError("at least two events are needed to fit Y")
    if not (np.all(np.isfinite(x)) and np.all(np.isfinite(r))):
        raise ValueError("features and excess costs must be finite")
    denom = float(np.dot(x, x))
    if denom <= 0:
        raise ValueError("all features are zero: Y is not identified")
    return float(np.dot(x, r) / denom)


def in_range(value: float, lo: float, hi: float) -> bool:
    """True when `value` lies within the calibrated range [lo, hi] of a feature (inclusive). Outside it the result is
    "insufficient data", never an extrapolation."""
    v = _finite("value", value)
    if lo > hi:
        raise ValueError("lo cannot exceed hi")
    return lo <= v <= hi

"""Square-root impact model of the expected execution cost of an order, in bps.

    expected cost = s/2 + Y * sigma * sqrt(Q / V)

  s/2    median effective half-spread of taker events of a similar size (bps), measured on public prints
  sigma  volatility over the hour before the order (bps)
  Q / V  order quantity over the quantity traded in that hour (dimensionless participation, same units)
  Y      a constant of order one, fitted by least squares through the origin on the part of the realised cost above s/2.

The square-root form is the "square-root law" of market impact: impact grows with the square root of the participation
rate. Sources, both read in full on 2026-11-17 (LOG §Q):

* Toth, Lemperiere, Deremble, de Lataillade, Kockelkoren, Bouchaud, "Anomalous price impact and the critical nature of
  liquidity in financial markets", Phys. Rev. X 1, 021006 (2011), arXiv:1105.1694v3, DOI 10.1103/PhysRevX.1.021006.
  Section 1 (Introduction), Eq. (1): Delta(Q) = Y sigma sqrt(Q / V). Delta is the average relative price change between
  the first and the last trade of a metaorder of size Q; sigma is the daily volatility and V the daily traded volume,
  "both quantities measured contemporaneously to the trade"; "the numerical constant Y is of order unity". The same
  section says the exponent is "more generally described as a power-law relation Delta(Q) ~ Q^delta, with delta in the
  range 0.4 to 0.7". (Y = 1.59 in the caption of their Fig. 5 belongs to a numerical model with delta = 0.7, not to market
  data, and is not used here.)
* Donier and Bonart, "A million metaorder analysis of market impact on the Bitcoin", arXiv:1412.4503v3 (v3 dated 21 September
  2015; a preprint, no journal record was verified). Section 1, Eq. (1): I(Q) ~ +/- Y sigma (Q / V_D)^delta, with V_D the daily traded volume,
  delta about 1/2. Section 4.1, Eq. (4): <I(Q)> ~ Ytilde Q^delta with delta about 0.5 and Ytilde about 4.5e-2 on Bitcoin/USD
  (MtGox), a Y-ratio of about 0.9. Section 4.3: the daily Y-ratio is close to Gaussian with mean 0.9 and standard
  deviation 0.35, "of order unity ... essentially in the interval [0, 2]".

What this module takes from them: the shape sigma sqrt(Q / V) and that the multiplier is of order one. What it does not
take: the value of Y. The papers measure the impact of a metaorder (first to last price) with daily sigma and V; this model
describes the cost of one order against the arrival mid-price plus half the spread, with the volatility and volume of the
hour before the order. The horizon and the quantity are different, so Y is fitted on our own events (and reported with its
held-out coverage), and the exponent is fixed at 1/2, not fitted. Almgren, Thum, Hauptmann, Li, "Direct estimation of
equity market impact", Risk 18(7), 2005, is NOT cited for any equation: its PDF could not be read (HTTP 403 on 2026-11-17).
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

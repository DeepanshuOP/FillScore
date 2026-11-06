"""Effective-spread estimates from public OHLC bars (no order book). Pure, deterministic. Namespace `spread.*`.

Bars are (high, low, close). Applied here to 1-minute bars (aggregated from Binance 1s klines).

Corwin & Schultz (2012, J. Finance 67(2):719-760), eqs 6, 9, 15, 16 (checked against the NBER draft):
    beta  = sum over the two bars of ln(H/L)^2
    gamma = ln(max(H1,H2) / min(L1,L2))^2
    alpha = (sqrt(2 beta) - sqrt(beta)) / (3 - 2 sqrt 2) - sqrt(gamma / (3 - 2 sqrt 2))
    S     = 2 (e^alpha - 1) / (1 + e^alpha)            (a proportion of price)
  Negative S is set to 0 before averaging (paper section 2.3). The paper's overnight adjustment is omitted:
  crypto trades continuously, so there is no overnight gap between consecutive bars.
Abdi & Ranaldo (2017, RFS 30(12):4437-4480), eqs 4 and 11 (checked against the working paper):
    eta_t = (ln H_t + ln L_t) / 2         c_t = ln C_t
    S_t   = sqrt(max(4 (c_t - eta_t)(c_t - eta_{t+1}), 0))      (two-period corrected, negatives -> 0)

KNOWN BIASES (the estimators were built for daily equity data; neither paper tests intraday crypto bars):
  * Both floor negative estimates at 0, which biases the average UPWARD when the true spread is small.
  * CS is biased DOWNWARD when few trades fall in a bar (observed H-L too narrow) and under-estimates in
    illiquid markets (Abdi-Ranaldo 2017); AR is less sensitive to trade count.
  * Both assume a constant spread and that bar highs are buyer- and lows seller-initiated. Volatility in a
    bar inflates both. They estimate the spread quoted across a bar, not the spread a given order paid.
  * We report both and use the SMALLER downstream (conservative). If either is unavailable the result is
    None and no spread credit is given anywhere.
"""
from __future__ import annotations

import math

K = 3.0 - 2.0 * math.sqrt(2.0)
MIN_PAIRS = 10            # consecutive 1-minute pairs required inside the window, else None
HALF_WINDOW_MIN = 30      # window = +/- 30 minutes around the fill's minute


def corwin_schultz_pair(b1: tuple, b2: tuple) -> float:
    (h1, l1, _), (h2, l2, _) = b1, b2
    beta = math.log(h1 / l1) ** 2 + math.log(h2 / l2) ** 2
    gamma = math.log(max(h1, h2) / min(l1, l2)) ** 2
    alpha = (math.sqrt(2 * beta) - math.sqrt(beta)) / K - math.sqrt(gamma / K)
    s = 2 * (math.exp(alpha) - 1) / (1 + math.exp(alpha))
    return max(s, 0.0)


def abdi_ranaldo_pair(b1: tuple, b2: tuple) -> float:
    (h1, l1, c1), (h2, l2, _) = b1, b2
    eta1 = (math.log(h1) + math.log(l1)) / 2
    eta2 = (math.log(h2) + math.log(l2)) / 2
    c = math.log(c1)
    return math.sqrt(max(4 * (c - eta1) * (c - eta2), 0.0))


def conservative_spread_bps(cs_bps, ar_bps):
    """The smaller of the two; None unless both exist."""
    if cs_bps is None or ar_bps is None:
        return None
    return min(cs_bps, ar_bps)


def estimate_spread_window(bars_1m: dict, centre_s: float, half_window_min: int = HALF_WINDOW_MIN,
                           min_pairs: int = MIN_PAIRS) -> dict:
    """Average the pair estimates over consecutive-minute pairs inside centre +/- half_window_min.
    Zero-range bars and missing minutes break a pair (Abdi-Ranaldo section II). Values in bps of price."""
    c_min = int(centre_s) - int(centre_s) % 60
    lo, hi = c_min - half_window_min * 60, c_min + half_window_min * 60
    cs, ar = [], []
    for m in range(lo, hi, 60):
        b1, b2 = bars_1m.get(m), bars_1m.get(m + 60)
        if b1 is None or b2 is None or b1[0] <= b1[1] or b2[0] <= b2[1]:
            continue
        cs.append(corwin_schultz_pair(b1, b2))
        ar.append(abdi_ranaldo_pair(b1, b2))
    n = len(cs)
    if n < min_pairs:
        return {"cs_bps": None, "ar_bps": None, "n_pairs": n, "conservative_bps": None, "half_spread_bps": None}
    cs_bps, ar_bps = sum(cs) / n * 1e4, sum(ar) / n * 1e4
    cons = conservative_spread_bps(cs_bps, ar_bps)
    return {"cs_bps": cs_bps, "ar_bps": ar_bps, "n_pairs": n, "conservative_bps": cons,
            "half_spread_bps": cons / 2}

"""Post-trade markouts (namespace `markout.*`). Pure, deterministic, no I/O, no LLM.

SIGN CONVENTION (the one place it is defined):
    markout_bps = side_sign * (P(t+h) - fill_price) / fill_price * 1e4,   buy = +1, sell = -1
so POSITIVE means the price moved in the trader's favour after the fill (a buy followed by a rise, a sell
followed by a fall); NEGATIVE means it moved against them (adverse).

Inputs per trade: `side`, `executionPrice`, `isMaker`, `notionalValue` and `postPrices`, a dict keyed by the
horizon in seconds as a string ("1","5","30","60","300") whose values are the price at t+h or None when the
price path had no print inside the staleness cap (never guessed). Horizons with None are excluded.
"""
from __future__ import annotations

HORIZONS_S = (1, 5, 30, 60, 300)


def fill_markout_bps(side: str, fill_price, future_price) -> float | None:
    if future_price is None or fill_price is None or float(fill_price) <= 0:
        return None
    sign = 1.0 if str(side).upper() == "BUY" else -1.0
    return sign * (float(future_price) - float(fill_price)) / float(fill_price) * 1e4


def _percentile(sorted_vals: list[float], p: float) -> float:
    """Linear interpolation, same convention as risk_packet / counterfactual."""
    n = len(sorted_vals)
    idx = (p / 100) * (n - 1)
    lo, hi = int(idx), min(int(idx) + 1, n - 1)
    return sorted_vals[lo] + (idx - lo) * (sorted_vals[hi] - sorted_vals[lo])


def _agg(rows: list[tuple[float, float]]) -> dict:
    """rows = (markout_bps, notional). Empty -> n=0 and None stats."""
    if not rows:
        return {"n": 0, "mean_bps": None, "weighted_mean_bps": None, "median_bps": None,
                "p10_bps": None, "p90_bps": None, "adverse_share": None}
    vals = sorted(m for m, _ in rows)
    wsum = sum(w for _, w in rows)
    return {
        "n": len(rows),
        "mean_bps": sum(vals) / len(vals),
        "weighted_mean_bps": sum(m * w for m, w in rows) / wsum if wsum > 0 else None,
        "median_bps": _percentile(vals, 50),
        "p10_bps": _percentile(vals, 10),
        "p90_bps": _percentile(vals, 90),
        "adverse_share": sum(1 for m in vals if m < 0) / len(vals),
    }


def trade_markouts(trades: list[dict]) -> dict[str, list[tuple[float, float, bool, str]]]:
    """horizon -> [(markout_bps, notional, is_maker, trade_id)] for fills that have that horizon's price."""
    out: dict[str, list] = {str(h): [] for h in HORIZONS_S}
    for t in trades:
        post = t.get("postPrices") or {}
        for h in HORIZONS_S:
            m = fill_markout_bps(t.get("side", "BUY"), t.get("executionPrice"), post.get(str(h)))
            if m is not None:
                out[str(h)].append((m, float(t.get("notionalValue") or 0.0), bool(t.get("isMaker")),
                                    str(t.get("id", ""))))
    return out


def build_markout_summary(trades: list[dict]) -> dict[str, dict]:
    """Per horizon: all-fills aggregate plus `maker` and `taker` sub-aggregates (same keys)."""
    summary = {}
    for h, rows in trade_markouts(trades).items():
        d = _agg([(m, w) for m, w, _, _ in rows])
        d["maker"] = _agg([(m, w) for m, w, mk, _ in rows if mk])
        d["taker"] = _agg([(m, w) for m, w, mk, _ in rows if not mk])
        summary[h] = d
    return summary

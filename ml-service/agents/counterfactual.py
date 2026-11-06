"""Pure counterfactual replays over a user's own past trades. No LLM, no I/O.

effect_usd > 0 means the realized cost would have been that much lower.
Descriptions are past-tense findings about what already happened, never advice.
"""
from __future__ import annotations
import math
from dataclasses import dataclass, field

from agents.metrics.fee_packet import FEE_RATES, DEFAULT_RATES
from agents.metrics.time_utils import utc_hour


@dataclass
class CounterfactualResult:
    effect_usd: float
    effect_bps: float
    n_trades_affected: int
    method: str
    details: dict = field(default_factory=dict)
    affected_ids: list = field(default_factory=list)


class CounterfactualError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def percentile(sorted_vals: list[float], p: float) -> float:
    """Linear interpolation percentile (same as risk_packet._percentile)."""
    if not sorted_vals:
        return 0.0
    n = len(sorted_vals)
    idx = (p / 100) * (n - 1)
    lo, hi = int(idx), min(int(idx) + 1, n - 1)
    frac = idx - lo
    return sorted_vals[lo] + frac * (sorted_vals[hi] - sorted_vals[lo])


def _valid(trades: list[dict]) -> list[dict]:
    return [t for t in trades if float(t.get("notionalValue") or 0.0) > 0]


def _notional(t: dict) -> float:
    return float(t.get("notionalValue") or 0.0)


def _cost_usd(t: dict) -> float:
    slip = float(t.get("arrivalSlippageBps") or 0.0) / 1e4 * _notional(t)
    return slip + float(t.get("feePaid") or 0.0)


def _wbps(ts: list[dict]) -> float:
    return sum(_cost_usd(t) for t in ts) / sum(_notional(t) for t in ts) * 1e4


def _venue(t: dict) -> str:
    return str(t.get("exchange", "")).lower()


def _id(t: dict) -> str:
    return str(t.get("id", ""))


def _result(effect_usd, trades, n, method, details, ids) -> CounterfactualResult:
    total = sum(_notional(t) for t in trades)
    bps = effect_usd / total * 1e4 if total > 0 else 0.0
    return CounterfactualResult(round(effect_usd, 6), round(bps, 6), n, method, details, ids)


# ── spread-aware maker counterfactual: every ASSUMPTION is a named constant ─────────────────────────────
FILL_PROBABILITY_HAIRCUT = 0.5   # ASSUMPTION: a passive order may not fill; only this share of the modelled saving counts
ADVERSE_HORIZON_S = 60           # markout horizon used to price adverse selection
HALF_SPREAD_CAP_BPS = 1.0        # ASSUMPTION: bar-range estimators read high from volatility; credit at most 1 bp per fill
MIN_MAKER_FILLS = 10             # own maker fills (with a markout at the horizon) needed to use them directly


def _markouts_at(trades: list[dict], horizon_s: int, maker: bool) -> list[float]:
    from agents.metrics.markout_packet import trade_markouts
    return [m for m, _, mk, _ in trade_markouts(trades)[str(horizon_s)] if mk is maker]


def adverse_selection_bps(trades: list[dict], horizon_s: int = ADVERSE_HORIZON_S,
                          min_maker_fills: int = MIN_MAKER_FILLS) -> tuple[float | None, str, int]:
    """(bps, basis, n_used). Cost of being picked off, never negative (a favourable markout earns no credit).
      own_maker_fills : >= min_maker_fills own maker fills have a markout at the horizon -> max(0, -mean maker markout).
      own_taker_fills : fallback, conservative proxy from the trader's own taker markouts -> max(0, -mean taker markout).
      None, 'unknown' : no markout data at all; the caller then lets adverse selection cancel the spread credit."""
    mk = _markouts_at(trades, horizon_s, True)
    if len(mk) >= min_maker_fills:
        return max(0.0, -sum(mk) / len(mk)), "own_maker_fills", len(mk)
    tk = _markouts_at(trades, horizon_s, False)
    if tk:
        return max(0.0, -sum(tk) / len(tk)), "own_taker_fills", len(tk)
    return None, "unknown", 0


def maker_instead_of_taker(trades: list[dict], target_ratio: float, *, spread_aware: bool = True,
                           haircut: float = FILL_PROBABILITY_HAIRCUT, horizon_s: int = ADVERSE_HORIZON_S,
                           min_maker_fills: int = MIN_MAKER_FILLS) -> CounterfactualResult:
    """Replay the smallest taker fills as maker fills until the target maker ratio is reached.

    spread_aware=False: the old fee-rate-only model (no haircut), pinned by tests.
    spread_aware=True, per converted fill (notional N):
        net = N*(taker_rate - maker_rate)            fee_component
            + N*half_spread_bps/1e4                  spread_component  (per-fill `halfSpreadBps` = HALF the SMALLER
                                                      of Corwin-Schultz / Abdi-Ranaldo; absent -> 0, no credit)
            - N*adverse_bps/1e4                      adverse_selection_component (trader-level, see adverse_selection_bps;
                                                      basis 'unknown' -> equals the fill's spread credit)
        effect = fill_haircut * sum(net)             may be <= 0, which the materiality gate rejects.
    """
    trades = _valid(trades)
    n = len(trades)
    makers = sum(1 for t in trades if t.get("isMaker"))
    takers = sorted((t for t in trades if not t.get("isMaker")),
                    key=lambda t: (_notional(t), _id(t)))
    k = math.ceil(round(target_ratio * n, 9))
    conv = takers[: min(max(0, k - makers), len(takers))]
    fee_c = 0.0
    for t in conv:
        r = FEE_RATES.get(_venue(t), DEFAULT_RATES)
        fee_c += _notional(t) * (r["taker"] - r["maker"])
    ids = [_id(t) for t in conv]
    if not spread_aware:
        method = (f"Replayed {len(conv)} of {len(takers)} taker fills as maker fills (smallest notional first) "
                  f"to reach a {target_ratio:.0%} maker ratio; fee difference ${fee_c:.2f}.")
        return _result(fee_c, trades, len(conv), method, {"target_ratio": target_ratio}, ids)

    adv_bps, basis, n_used = adverse_selection_bps(trades, horizon_s, min_maker_fills)
    spread_c = adverse_c = 0.0
    for t in conv:
        sp = min(float(t.get("halfSpreadBps") or 0.0), HALF_SPREAD_CAP_BPS) / 1e4 * _notional(t)
        spread_c += sp
        if adv_bps is None:
            adverse_c += sp                                    # unknown: cancels the spread credit
        elif basis == "own_taker_fills":
            adverse_c += max(sp, adv_bps / 1e4 * _notional(t))  # weak proxy: never leaves a net spread credit
        else:
            adverse_c += adv_bps / 1e4 * _notional(t)
    effect = haircut * (fee_c + spread_c - adverse_c)
    method = (f"Replayed {len(conv)} of {len(takers)} taker fills as maker fills (smallest notional first) to reach a "
              f"{target_ratio:.0%} maker ratio: fee difference ${fee_c:.2f}, estimated half-spread ${spread_c:.2f}, "
              f"adverse selection ${adverse_c:.2f} ({basis}), times a {haircut:.0%} fill-probability assumption "
              f"= ${effect:.2f}.")
    details = {"target_ratio": target_ratio, "fee_component": fee_c, "spread_component": spread_c,
               "adverse_selection_component": adverse_c, "fill_haircut": haircut,
               "adverse_basis": basis, "adverse_bps": adv_bps, "adverse_horizon_s": horizon_s,
               "adverse_n_fills": n_used}
    return _result(effect, trades, len(conv), method, details, ids)


def exclude_hours(trades: list[dict], hours: list[int]) -> CounterfactualResult:
    trades = _valid(trades)
    hs = set(hours)
    inn, out = [], []
    for t in trades:
        h = utc_hour(t.get("executedAt"))
        if h is None:
            continue
        (inn if h in hs else out).append(t)
    if not inn:
        raise CounterfactualError("no_trades_in_hours")
    if not out:
        raise CounterfactualError("no_trades_outside_hours")
    vals = sorted(_cost_usd(t) / _notional(t) * 1e4 for t in out)
    m = len(vals)
    median = vals[m // 2] if m % 2 else (vals[m // 2 - 1] + vals[m // 2]) / 2
    actual = sum(_cost_usd(t) for t in inn)
    notional = sum(_notional(t) for t in inn)
    effect = actual - notional * median / 1e4
    method = (f"Trades in UTC hours {sorted(hs)} cost ${actual:.2f} over ${notional:.2f} notional; "
              f"at the median cost of the remaining trades ({median:.2f} bps) they would have cost "
              f"${notional * median / 1e4:.2f}.")
    return _result(effect, trades, len(inn), method,
                   {"hours": hours, "median_out_bps": median}, [_id(t) for t in inn])


def venue_shift(trades: list[dict], from_venue: str, to_venue: str, symbol: str) -> CounterfactualResult:
    trades = _valid(trades)
    fv, tv = from_venue.lower(), to_venue.lower()
    if fv == tv:
        raise CounterfactualError("same_venue")
    sym = [t for t in trades if t.get("symbol") == symbol]
    f = [t for t in sym if _venue(t) == fv]
    to = [t for t in sym if _venue(t) == tv]
    if not f or not to:
        raise CounterfactualError("not_on_both_venues")
    from_bps, to_bps = _wbps(f), _wbps(to)
    shifted = sum(_notional(t) for t in f)
    effect = (from_bps - to_bps) * shifted / 1e4
    method = (f"{symbol} trades on {fv} cost {from_bps:.2f} bps against {to_bps:.2f} bps on {tv}; "
              f"replaying ${shifted:.2f} notional from {fv} at the {tv} rate changes cost by ${effect:.2f}.")
    return _result(effect, trades, len(f), method,
                   {"from_bps": from_bps, "to_bps": to_bps, "shifted_notional_usd": shifted,
                    "from": fv, "to": tv, "symbol": symbol}, [_id(t) for t in f])


def smaller_clips(trades: list[dict], symbol: str, threshold_usd: float) -> CounterfactualResult:
    trades = _valid(trades)
    sym = [t for t in trades if t.get("symbol") == symbol]
    above = [t for t in sym if _notional(t) > threshold_usd]
    below = [t for t in sym if _notional(t) <= threshold_usd]
    if not above:
        raise CounterfactualError("nothing_above_threshold")
    if not below:
        raise CounterfactualError("nothing_below_threshold")
    diff = _wbps(above) - _wbps(below)
    effect = diff * sum(_notional(t) for t in above) / 1e4
    word = "more" if diff >= 0 else "less"
    method = (f"{symbol} trades above ${threshold_usd:.2f} cost {abs(diff):.2f} bps {word} than trades at or "
              f"below it; association, not causation.")
    return _result(effect, trades, len(above), method,
                   {"threshold_usd": threshold_usd, "diff_bps": diff}, [_id(t) for t in above])

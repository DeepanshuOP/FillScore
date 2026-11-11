"""C3: account scores from unit scores, the minimum sample, and grade bands (same bands as v1).

Input: a list of orders, each {"orderId", "notional", "slippage": score|None, "fills": [{"notional", "fees",
"timing", "spread"}]} where every score is in [0, 100] or None (unmeasured). Nothing is imputed:
  * a component's score is the notional-weighted mean of its measured units; unmeasured units are counted;
  * a component with no measured unit is None ("insufficient data"), and the composite is then None;
  * a letter grade needs at least MIN_FILLS measured fills in every component; below that the result is a
    bootstrap band with the reason, never a letter.
"""
from __future__ import annotations

from typing import Iterable

from .bootstrap import bootstrap_ci
from .components import WEIGHTS

MIN_FILLS = 20
BANDS = ((90.0, "A"), (75.0, "B"), (60.0, "C"), (40.0, "D"))
FILL_COMPONENTS = ("fees", "timing", "spread")


def weighted_mean(pairs: Iterable[tuple[float | None, float]]) -> float | None:
    num = den = 0.0
    for score, w in pairs:
        if score is None or w <= 0:
            continue
        num += score * w
        den += w
    return num / den if den > 0 else None


def composite(components: dict[str, float | None]) -> float | None:
    if any(components.get(k) is None for k in WEIGHTS):
        return None
    return sum(WEIGHTS[k] * float(components[k]) for k in WEIGHTS)


def band_letter(score: float) -> str:
    for edge, g in BANDS:
        if score >= edge:
            return g
    return "F"


def _component_scores(orders: list[dict]) -> dict[str, dict]:
    out = {}
    slip_pairs, slip_measured, slip_unmeasured = [], 0, 0
    for o in orders:
        nf = len(o["fills"])
        slip_pairs.append((o.get("slippage"), float(o["notional"])))
        if o.get("slippage") is None:
            slip_unmeasured += nf
        else:
            slip_measured += nf
    out["slippage"] = {"score": weighted_mean(slip_pairs), "measured": slip_measured, "unmeasured": slip_unmeasured}
    for c in FILL_COMPONENTS:
        fills = [f for o in orders for f in o["fills"]]
        measured = sum(1 for f in fills if f.get(c) is not None)
        out[c] = {"score": weighted_mean((f.get(c), float(f["notional"])) for f in fills),
                  "measured": measured, "unmeasured": len(fills) - measured}
    for v in out.values():
        v["reason"] = "insufficient data" if v["score"] is None else None
    return out


def _composite_of(orders: list[dict]) -> float | None:
    return composite({k: v["score"] for k, v in _component_scores(orders).items()})


def score_account(orders: list[dict]) -> dict:
    comps = _component_scores(orders)
    comp = composite({k: v["score"] for k, v in comps.items()})
    band = bootstrap_ci(orders, _composite_of) if comp is not None else None
    enough = all(v["measured"] >= MIN_FILLS for v in comps.values())
    grade, reason = None, None
    if comp is None:
        reason = "insufficient data"
    elif not enough:
        reason = f"fewer than {MIN_FILLS} measured fills"
    else:
        grade = band_letter(comp)
    return {"components": comps, "composite": comp, "grade": grade, "band": list(band) if band else None,
            "reason": reason, "orders": len(orders), "fills": sum(len(o["fills"]) for o in orders)}

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


def composite(components: dict[str, float | None], weights: dict[str, float] | None = None) -> float | None:
    weights = weights or WEIGHTS
    if any(components.get(k) is None for k in weights):
        return None
    return sum(weights[k] * float(components[k]) for k in weights)


# v2.3.0 (ADR-0014): the implementation-shortfall decomposition. Order components carry an order-level score
# (execution, unfilled); fill components a fill-level score (fees). Weights come from the version file.
SHORTFALL_SPEC_UNITS = {"order": ("execution", "unfilled"), "fill": ("fees",)}


def spec_for(version: dict) -> dict | None:
    """The aggregation spec of a ScoringVersion; None for v2.0.0 to v2.2.0 (slippage, fees, timing, spread)."""
    if version.get("decomposition") == "implementation_shortfall":
        return {"weights": version["weights"], **SHORTFALL_SPEC_UNITS}
    return None


def _component_scores_spec(orders: list[dict], spec: dict) -> dict[str, dict]:
    out = {}
    for comp in spec["order"]:
        pairs, measured, unmeasured = [], 0, 0
        for o in orders:
            score = o.get(comp)
            # execution: weight = executed notional, counts in fills; unfilled: weight = intended notional, counts orders
            weight = float(o.get("intended", o["notional"])) if comp == "unfilled" else float(o["notional"])
            units = 1 if comp == "unfilled" else len(o["fills"])
            pairs.append((score, weight))
            if score is None:
                unmeasured += units
            else:
                measured += units
        out[comp] = {"score": weighted_mean(pairs), "measured": measured, "unmeasured": unmeasured}
    for c in spec["fill"]:
        fills = [f for o in orders for f in o["fills"]]
        measured = sum(1 for f in fills if f.get(c) is not None)
        out[c] = {"score": weighted_mean((f.get(c), float(f["notional"])) for f in fills),
                  "measured": measured, "unmeasured": len(fills) - measured}
    for v in out.values():
        v["reason"] = "insufficient data" if v["score"] is None else None
    return out


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


def _composite_of(orders: list[dict], spec: dict | None = None) -> float | None:
    if spec:
        return composite({k: v["score"] for k, v in _component_scores_spec(orders, spec).items()}, spec["weights"])
    return composite({k: v["score"] for k, v in _component_scores(orders).items()})


def score_account(orders: list[dict], spec: dict | None = None) -> dict:
    """`spec` (spec_for(version)) selects the v2.3.0 shortfall components; None keeps the v2.0.0 to v2.2.0 ones."""
    comps = _component_scores_spec(orders, spec) if spec else _component_scores(orders)
    comp = composite({k: v["score"] for k, v in comps.items()}, spec["weights"] if spec else None)
    band = bootstrap_ci(orders, (lambda os_: _composite_of(os_, spec)) if spec else _composite_of) if comp is not None else None
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

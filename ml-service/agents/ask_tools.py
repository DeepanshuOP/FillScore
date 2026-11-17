"""The tools of "Ask your execution" (M5). Deterministic readers over an account's stored measurements: no model, no network.

Each tool fills one namespace of the render context. The renderer (agents.render) formats a value by its key name (`_usd`, `_bps`,
`_count`, `_score`), so every number the agent may say is a placeholder over one of these values, and the grounding check removes any
number it writes in another way. A value that was not measured is absent or a "note": never zero, never a guess.
Names that are not in TOOLS are dropped before anything runs, so a model (or a question that talks the model into it) cannot call
anything else.
"""
from __future__ import annotations

from statistics import median
from typing import Callable

from expected_cost.aggregate import cost_vs_expected

MAX_TOOLS = 3
MAX_COSTLIEST = 5


def _measured(ms: list[dict]) -> list[dict]:
    return [m for m in ms if m.get("shortfall") and not m.get("unmeasuredReason")
            and isinstance(m["shortfall"].get("totalBps"), (int, float)) and (m["shortfall"].get("intendedNotional") or 0) > 0]


def _usd(bps: float, notional: float) -> float:
    return bps * notional / 1e4


def _score(score: dict | None, ms: list[dict]) -> dict:
    if not score:
        return {"note": "insufficient data: no measured score is stored for this account"}
    r = score.get("result") or {}
    out: dict = {"version": score.get("scoringVersion")}
    if r.get("grade") and isinstance(r.get("composite"), (int, float)):
        out["grade"], out["composite_score"] = r["grade"], r["composite"]
        if r.get("band"):
            out["band_low_score"], out["band_high_score"] = r["band"][0], r["band"][1]
    else:
        out["note"] = f"no letter grade: {r.get('reason') or 'insufficient data'}"
    if isinstance(r.get("fills"), int):
        out["fill_count"] = r["fills"]
    if isinstance(r.get("orders"), int):
        out["order_count"] = r["orders"]
    return out


def _costs(score: dict | None, ms: list[dict]) -> dict:
    ok = _measured(ms)
    out: dict = {"measured_order_count": len(ok), "unmeasured_order_count": len(ms) - len(ok)}
    if not ok:
        out["note"] = "insufficient data: no measured orders"
        return out
    out["median_total_bps"] = median(m["shortfall"]["totalBps"] for m in ok)
    exec_ = [m["shortfall"]["executionBps"] for m in ok if isinstance(m["shortfall"].get("executionBps"), (int, float))]
    if exec_:
        out["median_execution_bps"] = median(exec_)
    out["total_cost_usd"] = sum(_usd(m["shortfall"]["totalBps"], m["shortfall"]["intendedNotional"]) for m in ok)
    fees = [(m["shortfall"]["feesBps"], m["shortfall"]["intendedNotional"]) for m in ok if isinstance(m["shortfall"].get("feesBps"), (int, float))]
    if fees:
        out["total_fees_usd"] = sum(_usd(b, n) for b, n in fees)
    return out


def _costliest(score: dict | None, ms: list[dict]) -> dict:
    ok = _measured(ms)
    ranked = sorted(ok, key=lambda m: (-_usd(m["shortfall"]["totalBps"], m["shortfall"]["intendedNotional"]), str(m["orderId"])))[:MAX_COSTLIEST]
    return {"orders": [{"order_id": str(m["orderId"]), "symbol": m.get("symbol"), "total_bps": m["shortfall"]["totalBps"],
                        "cost_usd": _usd(m["shortfall"]["totalBps"], m["shortfall"]["intendedNotional"])} for m in ranked]}


def _expected(score: dict | None, ms: list[dict]) -> dict:
    r = cost_vs_expected(ms)
    if r["insufficient"]:
        return {"note": f"insufficient data: {r['reason']}"}
    out = {"order_count": r["n"], "paid_bps": r["paidBps"], "expected_bps": r["expectedBps"], "excess_bps": r["excessBps"]}
    out["interval_low_bps"], out["interval_high_bps"] = r["lowBps"], r["highBps"]
    return out


# name -> (namespace in the render context, reader, one-line description for the planner)
TOOLS: dict[str, tuple[str, Callable[[dict | None, list[dict]], dict], str]] = {
    "score": ("score", _score, "the measured score: letter, score, range, version, number of fills and orders"),
    "costs": ("costs", _costs, "what the orders cost: median total and execution cost, total cost and fees in USD, how many orders were measured"),
    "costliest": ("costliest", _costliest, "the five orders that cost the most in USD, with order id, symbol, cost in bps and USD"),
    "cost_vs_expected": ("expected", _expected, "market-order cost against the modelled cost of a taker event of the same size, with its interval"),
}


def run_tools(requested: list[str], score: dict | None, ms: list[dict]) -> tuple[list[str], dict[str, dict]]:
    """Run the requested tools: names that are not tools and repeats are dropped, at most MAX_TOOLS run. Returns (names run, context)."""
    used: list[str] = []
    for name in requested:
        if isinstance(name, str) and name in TOOLS and name not in used and len(used) < MAX_TOOLS:
            used.append(name)
    return used, {TOOLS[n][0]: TOOLS[n][1](score, ms) for n in used}


def build_ctx(requested: list[str], score: dict | None, ms: list[dict]) -> dict[str, dict]:
    return run_tools(requested, score, ms)[1]

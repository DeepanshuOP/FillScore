"""Verification gate: replays the user's own trades for each structured recommendation.

Deterministic, no LLM. A recommendation passes only if its parameters are valid, the
counterfactual is computable, and the effect is material. Findings are past-tense audits.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Literal

from agents.counterfactual import (
    CounterfactualError, CounterfactualResult, maker_instead_of_taker, exclude_hours,
    venue_shift, smaller_clips, percentile,
)
from agents.metrics.fee_packet import MAKER_RATIO_TARGETS
from agents.metrics.time_utils import utc_hour

ACTIONS = ("maker_instead_of_taker", "exclude_hours", "venue_shift", "smaller_clips", "none", "general")


@dataclass
class GateItem:
    action_type: str
    params: dict
    rationale_text: str
    status: Literal["passed", "rejected", "observation"]
    reason: str | None = None
    cf: CounterfactualResult | None = None


def materiality_threshold(fees_paid_usd: float) -> float:
    return max(1.0, 0.005 * fees_paid_usd)


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def _notional(t):
    return float(t.get("notionalValue") or 0.0)


def _valid_trades(trades):
    return [t for t in trades if _notional(t) > 0]


def _validate(action, params, trades):
    """Return a callable producing the CounterfactualResult, or None if params invalid."""
    if not isinstance(params, dict):
        return None
    if action == "maker_instead_of_taker":
        if set(params) != {"target_ratio"}:
            return None
        r = params["target_ratio"]
        if isinstance(r, bool) or not isinstance(r, (int, float)) or r not in MAKER_RATIO_TARGETS:
            return None
        return lambda: maker_instead_of_taker(trades, float(r))
    if action == "exclude_hours":
        if set(params) != {"hours"}:
            return None
        hs = params["hours"]
        if not isinstance(hs, list) or not hs or not all(_is_int(h) and 0 <= h <= 23 for h in hs):
            return None
        traded = {utc_hour(t.get("executedAt")) for t in trades}
        if not all(h in traded for h in hs):
            return None
        return lambda: exclude_hours(trades, hs)
    if action == "venue_shift":
        if set(params) != {"from", "to", "symbol"}:
            return None
        if not all(isinstance(params[k], str) for k in params):
            return None
        venues = {str(t.get("exchange", "")).lower() for t in trades}
        if params["from"].lower() not in venues or params["to"].lower() not in venues:
            return None
        if params["symbol"] not in {t.get("symbol") for t in trades}:
            return None
        return lambda: venue_shift(trades, params["from"], params["to"], params["symbol"])
    if action == "smaller_clips":
        if set(params) != {"symbol", "threshold"}:
            return None
        if not isinstance(params["symbol"], str) or params["threshold"] not in ("median_trade_usd", "p90_trade_usd"):
            return None
        vals = sorted(_notional(t) for t in trades if t.get("symbol") == params["symbol"])
        if not vals:
            return None
        thr = percentile(vals, 50 if params["threshold"] == "median_trade_usd" else 90)
        return lambda: smaller_clips(trades, params["symbol"], thr)
    return None


def evaluate(rec, trades: list[dict], symbol: str) -> GateItem:
    if hasattr(rec, "model_dump"):
        rec = rec.model_dump()
    action = rec.get("action_type")
    params = rec.get("params") or {}
    text = rec.get("rationale_text", "")
    if action not in ACTIONS:
        return GateItem(str(action), params, text, "rejected", "invalid_params")
    if action in ("none", "general"):
        return GateItem(action, params, text, "observation")
    trades = _valid_trades(trades)
    run = _validate(action, params, trades)
    if run is None:
        return GateItem(action, params, text, "rejected", "invalid_params")
    try:
        cf = run()
    except CounterfactualError as e:
        return GateItem(action, params, text, "rejected", f"not_computable:{e.code}")
    fees = sum(float(t.get("feePaid") or 0.0) for t in trades)
    if not cf.effect_usd > materiality_threshold(fees):
        return GateItem(action, params, text, "rejected", "immaterial", cf)
    return GateItem(action, params, text, "passed", None, cf)


def _relation(x: GateItem, y: GateItem) -> str | None:
    """How a later passed item `y` relates to an earlier passed item `x` of the same action:
    "duplicate" (same params, or their counterfactuals replay some of the same trades),
    "contradiction" (a venue_shift reversal), or None."""
    if x.action_type != y.action_type:
        return None
    if x.params == y.params:
        return "duplicate"
    if (x.action_type == "venue_shift"
            and x.params.get("symbol") == y.params.get("symbol")
            and str(x.params.get("from")).lower() == str(y.params.get("to")).lower()
            and str(x.params.get("to")).lower() == str(y.params.get("from")).lower()):
        return "contradiction"
    if x.cf is not None and y.cf is not None and set(x.cf.affected_ids) & set(y.cf.affected_ids):
        return "duplicate"
    return None


def _verdicts(items: list[GateItem]) -> dict[int, str]:
    """{index: "duplicate" | "contradiction"} for each passed item to reject, judged on the statuses as given."""
    out: dict[int, str] = {}
    passed = [i for i, it in enumerate(items) if it.status == "passed"]
    for a in range(len(passed)):
        for b in range(a + 1, len(passed)):
            i, j = passed[a], passed[b]
            rel = _relation(items[i], items[j])
            if rel == "duplicate":
                out.setdefault(j, "duplicate")
            elif rel == "contradiction":
                out[i] = out[j] = "contradiction"
    return out


def find_contradictions(items: list[GateItem]) -> set[int]:
    return set(_verdicts(items))


def run_gate(recs, trades: list[dict], symbol: str) -> list[GateItem]:
    return mark_contradictions([evaluate(r, trades, symbol) for r in recs])


def mark_contradictions(items: list[GateItem]) -> list[GateItem]:
    """Reject passed items that duplicate, overlap or contradict an earlier passed sibling (in place)."""
    for idx, reason in _verdicts(items).items():
        items[idx].status = "rejected"
        items[idx].reason = reason
    return items


def summarise(round1: list[GateItem], round2: list[GateItem] | None) -> dict:
    both = list(round1) + list(round2 or [])
    rej = lambda xs: [{"action": i.action_type, "params": i.params, "reason": i.reason}
                      for i in xs if i.status == "rejected"]
    return {
        "proposed": len(round1),
        "passed": sum(1 for i in both if i.status == "passed"),
        "observations": sum(1 for i in both if i.status == "observation"),
        "rejected": rej(round1),
        "re_reasoned": len(round2) if round2 is not None else 0,
        "dropped": rej(round2 or []),
    }

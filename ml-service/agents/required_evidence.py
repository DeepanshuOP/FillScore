"""The one rule for which packet values an audit's synthesis must state (M3; cause in docs/research/LOG.md §M).

`evidence_cited` failed on every recorded run because the golden sets required hand-picked keys that the synthesis
prompt never asked for. From golden set v3 on, the prompt and the evaluation both call `required_keys`, so what is
asked for is exactly what is checked. The rule depends only on deterministic packet values, never on LLM output:
one headline value per specialist area that has data.
"""
from __future__ import annotations

# (area, headline key, the count that says the area has data). An area may list several rows: the first row whose
# count is above zero and whose key is in the packet wins, and the area is named once. Metrics 1.3.0 adds the
# measured rows, used for the packets of a rebuilt demo (no per-trade v1 slippage or VWAP, so those keys are absent).
HEADLINE = (
    ("fee", "total_fee_paid_usd", "trade_count"),
    ("liquidity", "median_slippage_bps", "market_order_count"),
    ("liquidity", "median_spread_paid_bps", "measured_order_count"),
    ("alpha", "pct_beating_vwap", "vwap_trades_count"),
    ("alpha", "median_opportunity_bps_unfilled", "unfilled_order_count"),
    ("risk", "top_symbol_notional_fraction", "total_trades"),
)


def required_keys(packets: dict) -> list[str]:
    """Dotted packet keys the synthesis must state, in the order the areas first appear in HEADLINE."""
    chosen: dict[str, str] = {}
    for area, key, count in HEADLINE:
        if area in chosen:
            continue
        p = packets.get(area) or {}
        n = p.get(count)
        if isinstance(n, (int, float)) and not isinstance(n, bool) and n > 0 and key in p:
            chosen[area] = f"{area}.{key}"
    return [chosen[a] for a in dict.fromkeys(a for a, _, _ in HEADLINE) if a in chosen]


_SPECIALIST = (("fee", "fee_optimizer"), ("liquidity", "liquidity_scout"), ("alpha", "alpha_architect"), ("risk", "risk_auditor"))


def golden_required_evidence(packets: dict) -> dict[str, list[str]]:
    """`required_evidence` of a golden case from golden set v3 on: each specialist must cite its area's headline key,
    the synthesis must cite all of them (the same list the prompt asks for). Derived from packet values only."""
    keys = required_keys(packets)
    out: dict[str, list[str]] = {spec: [k for k in keys if k.startswith(area + ".")] for area, spec in _SPECIALIST}
    out["synthesis"] = keys
    return out


def specialist_line(packets: dict, area: str) -> str:
    """The instruction added to one specialist's prompt: state the area's headline value (empty when the area has no data)."""
    keys = [k for k in required_keys(packets) if k.startswith(area + ".")]
    if not keys:
        return ""
    return "Your explanation must state this value, written only as this placeholder: {{" + keys[0] + "}}."


def prompt_line(packets: dict) -> str:
    """The instruction added to the synthesis prompt; empty when no area has data."""
    keys = required_keys(packets)
    if not keys:
        return ""
    return ("The narrative must state each of these values, written only as these placeholders: "
            + ", ".join("{{" + k + "}}" for k in keys) + ".")

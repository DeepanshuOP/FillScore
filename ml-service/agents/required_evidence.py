"""The one rule for which packet values an audit's synthesis must state (M3; cause in docs/research/LOG.md §M).

`evidence_cited` failed on every recorded run because the golden sets required hand-picked keys that the synthesis
prompt never asked for. From golden set v3 on, the prompt and the evaluation both call `required_keys`, so what is
asked for is exactly what is checked. The rule depends only on deterministic packet values, never on LLM output:
one headline value per specialist area that has data.
"""
from __future__ import annotations

# (area, headline key, the count that says the area has data)
HEADLINE = (
    ("fee", "total_fee_paid_usd", "trade_count"),
    ("liquidity", "median_slippage_bps", "market_order_count"),
    ("alpha", "pct_beating_vwap", "vwap_trades_count"),
    ("risk", "top_symbol_notional_fraction", "total_trades"),
)


def required_keys(packets: dict) -> list[str]:
    """Dotted packet keys the synthesis must state, in the fixed order of HEADLINE."""
    out = []
    for area, key, count in HEADLINE:
        p = packets.get(area) or {}
        n = p.get(count)
        if isinstance(n, (int, float)) and not isinstance(n, bool) and n > 0 and key in p:
            out.append(f"{area}.{key}")
    return out


def prompt_line(packets: dict) -> str:
    """The instruction added to the synthesis prompt; empty when no area has data."""
    keys = required_keys(packets)
    if not keys:
        return ""
    return ("The narrative must state each of these values, written only as these placeholders: "
            + ", ".join("{{" + k + "}}" for k in keys) + ".")

"""The benchmark line on the Council page: a server-computed statement from the alpha packet.

The model's `alphaRating` enum has no defined direction (agents/schemas.py), so the page does not print it as the verdict.
This line comes from the packet's `median_vwap_deviation_bps` (agents/metrics/alpha_packet.py): a positive value means the
market-order fills paid more than (or sold for less than) the 5-minute VWAP, a negative value that they did better.
The word is decided on the figure as printed (one decimal): 0.0 prints as "equal to". No language model is involved.
"""
from __future__ import annotations

from typing import Any


def benchmark_line(alpha: dict | None) -> dict[str, Any] | None:
    """{state, direction, medianBps, fills, statement} from an alpha packet's prompt dict; None without a packet."""
    if alpha is None:
        return None
    fills = int(alpha.get("vwap_trades_count") or 0)
    median = alpha.get("median_vwap_deviation_bps")
    if fills <= 0 or median is None:
        return {"state": "insufficient", "direction": None, "medianBps": None, "fills": fills,
                "statement": "Benchmark comparison: insufficient data (no market-order fill had a 5-minute VWAP)"}
    shown = f"{abs(float(median)):.1f}"
    unit = "fill" if fills == 1 else "fills"
    if shown == "0.0":
        direction = "equal to"
        statement = f"Market-order fills: median equal to the 5-minute VWAP ({fills} {unit})"
    else:
        direction = "worse than" if float(median) > 0 else "better than"
        statement = f"Market-order fills: median {shown} bps {direction} the 5-minute VWAP ({fills} {unit})"
    return {"state": "measured", "direction": direction, "medianBps": median, "fills": fills, "statement": statement}

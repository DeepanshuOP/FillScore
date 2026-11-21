"""The values a specialist's text cites, traced to their audit fields (design v3 fixes A7, 2026-11-21).

A specialist writes numbers only as ``{{ns.key}}`` placeholders, which agents.render fills from the packet; the recorded
run keeps the rendered text and the code-counted ``grounding.per_agent[agent].values_cited``, not the keys. This module
renders every leaf of the specialist's packet namespace exactly as the renderer does (``catalog_entries``) and finds those
strings in the recorded text, in reading order, as whole tokens. A rendering shared by several fields lists all of them.
The trace is ``complete`` only when every numeral in the shown text lies inside a traced value (the grounding
guarantee); otherwise it returns no lines and the dashboard says the values could not be traced. The recorded count is
kept for information only: the claim check can replace an explanation with a fallback sentence after it was counted.

Computed on read, beside the recorded result (never written into it); deterministic; no language model involved.
"""
from __future__ import annotations

from typing import Any

from agents.render import catalog_entries

# (agent, result key, explanation field or None): every specialist's flags are model sentences shown on its card too
# (agents.council.enforce_specialists), and the grounding counts both.
SPECIALISTS: list[tuple[str, str, str | None]] = [
    ("liquidity_scout", "liquidity", "slippageRoot"),
    ("alpha_architect", "alpha", "bestAlternative"),
    ("risk_auditor", "risk", None),
    ("fee_optimizer", "fee", "recommendedAction"),
]


def _unit(rendered: str) -> str:
    if rendered.endswith(" bps"):
        return "bps"
    if rendered.endswith("%"):
        return "%"
    if rendered.startswith("$") or rendered.startswith("-$"):
        return "USD"
    if rendered.replace(",", "").isdigit():
        return "count"
    return ""


def _whole(text: str, start: int, end: int) -> bool:
    """True when text[start:end] is not part of a longer number or word."""
    before = text[start - 1] if start > 0 else " "
    after = text[end] if end < len(text) else " "
    if before.isalnum() or before in "$" or (before in ".," and start >= 2 and text[start - 2].isdigit()):
        return False
    if after.isalnum() or (after in ".," and end + 1 < len(text) and text[end + 1].isdigit()):
        return False
    return True


def trace_agent(texts: list[str], ctx: dict[str, dict], namespace: str, recorded: int | None) -> dict[str, Any]:
    by_value: dict[str, list[str]] = {}
    for path, rendered in catalog_entries(ctx, [namespace]):
        if rendered.strip():
            by_value.setdefault(rendered, []).append(path)
    candidates = sorted(by_value, key=len, reverse=True)
    lines: list[dict[str, Any]] = []
    untraced = False
    for text in texts:
        found: list[tuple[int, int, str]] = []
        taken = [False] * len(text)
        for value in candidates:
            i = text.find(value)
            while i >= 0:
                j = i + len(value)
                if not any(taken[i:j]) and _whole(text, i, j):
                    found.append((i, j, value))
                    for k in range(i, j):
                        taken[k] = True
                i = text.find(value, i + 1)
        for _i, _j, value in sorted(found):
            lines.append({"value": value, "unit": _unit(value), "fields": sorted(by_value[value])})
        # the grounding guarantee: every numeral in the shown text came from the renderer, so each must lie in a traced value
        if any(ch.isdigit() and not taken[k] for k, ch in enumerate(text)):
            untraced = True
    return {"recorded": recorded, "lines": lines if not untraced else [], "complete": not untraced}


def trace_result(result: dict, ctx: dict[str, dict]) -> dict[str, dict[str, Any]]:
    """The trace for each of the four specialists of a Council result (a dict, as `model_dump` gives it)."""
    per_agent = ((result or {}).get("grounding") or {}).get("per_agent") or {}
    out: dict[str, dict[str, Any]] = {}
    for agent, key, field in SPECIALISTS:
        v = (result or {}).get(key) or {}
        texts = ([v.get(field) or ""] if field else []) + [f for f in (v.get("flags") or []) if isinstance(f, str)]
        recorded = (per_agent.get(agent) or {}).get("values_cited")
        out[agent] = trace_agent([t for t in texts if t], ctx, key, recorded if isinstance(recorded, int) else None)
    return out

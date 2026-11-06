"""
Deterministic placeholder renderer.

LLMs refer to numbers only as ``{{ns.key}}`` placeholders; this module fills them from the packet
context. Every numeral in model output that the renderer did not produce is a grounding violation
(see agents.grounding).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-z]+(?:\.[A-Za-z0-9_]+)+)\s*\}\}")
_STRAY_RE = re.compile(r"\{\{[^{}]*\}\}|\{\{|\}\}")

CF_KEYS = {
    "effect_usd", "effect_bps", "n_trades_affected", "threshold_usd", "diff_bps", "from_bps",
    "to_bps", "shifted_notional_usd", "target_ratio", "median_out_bps",
}
CF_DUMMY: dict[str, float] = {k: (0.5 if k == "target_ratio" else 0) for k in CF_KEYS}

_FORBIDDEN_KEYS = {"content_hash", "metrics_version"}
_PERCENT_KEYS = {
    "maker_ratio", "pct_beating_vwap", "pct_negative_slippage", "adverse_rate",
    "top_hour_trade_fraction", "top_symbol_notional_fraction", "target_ratio",
}
_PERCENT_PARENTS = {"adverse_rate_by_symbol", "symbol_notional_shares", "adverse_share"}
_COUNT_KEYS = {"trade_count", "total_trades", "longest_taker_streak"}

_UNIT_BPS = re.compile(r"\s*(?:bps|basis points)\b", re.I)
_UNIT_PCT = re.compile(r"\s*(?:%|percent\b)", re.I)
_UNIT_USD = re.compile(r"\s*(?:USDT|USD|dollars)\b", re.I)


class RenderError(Exception):
    """A path resolved but its value cannot (or must not) be rendered."""


@dataclass
class Violation:
    kind: str   # "numeral" | "unknown_placeholder" | "unrenderable"
    token: str


@dataclass
class RenderResult:
    text: str
    spans: list[tuple[int, int]] = field(default_factory=list)
    n_rendered: int = 0
    problems: list[Violation] = field(default_factory=list)


def _is_int(seg: str) -> bool:
    return seg.isdigit()


def _no_neg_zero(s: str) -> str:
    """3a G0: a value that rounds to zero reads "0.0", never "-0.0"."""
    return s[1:] if s == "-0.0" else s


def format_value(path: list[str], value: Any) -> str:
    named = [s for s in path if not _is_int(s)]
    k = named[-1] if named else ""
    p = path[-2] if len(path) >= 2 else ""
    if k in _FORBIDDEN_KEYS:
        raise RenderError("unrenderable")
    if isinstance(value, (dict, list)):
        raise RenderError("unrenderable")
    if isinstance(value, bool):
        return "yes" if value else "no"
    if isinstance(value, str):
        return value
    if not isinstance(value, (int, float)):
        raise RenderError("unformatted")
    x = float(value)
    is_hour = k.endswith("_hour_utc") or (k == "hours" and _is_int(path[-1]))
    if is_hour and x == -1:
        raise RenderError("unavailable")
    if p == "evidence_counts":
        return f"{int(round(x)):,}"
    if k.endswith("_usd"):
        s = f"{abs(x):,.2f}"
        return f"-${s}" if x < 0 and s != "0.00" else f"${s}"
    if k.endswith("_bps"):
        return f"{_no_neg_zero(f'{x:.1f}')} bps"
    if k in _PERCENT_KEYS or p in _PERCENT_PARENTS:
        return f"{_no_neg_zero(f'{x * 100:.1f}')}%"
    if k.endswith("_count") or k in _COUNT_KEYS or k.startswith("n_"):
        return f"{int(round(x)):,}"
    if is_hour:
        return f"{int(round(x)):02d}:00 UTC"
    if k.endswith("_hhi"):
        return f"{x:.2f}"
    if k.endswith("_score") or p == "symbol_avg_fill_score":
        return f"{x:.1f}"
    raise RenderError("unformatted")


class _Unknown(Exception):
    pass


def _resolve(ctx: dict, path: list[str]) -> Any:
    node: Any = ctx
    for seg in path:
        if isinstance(node, dict):
            if seg not in node:
                raise _Unknown()
            node = node[seg]
        elif isinstance(node, list):
            if not _is_int(seg) or int(seg) >= len(node):
                raise _Unknown()
            node = node[int(seg)]
        else:
            raise _Unknown()
    return node


def render(template: str, ctx: dict[str, dict]) -> RenderResult:
    out = ""
    spans: list[tuple[int, int]] = []
    problems: list[Violation] = []
    n = 0
    cursor = 0
    for m in PLACEHOLDER_RE.finditer(template):
        out += template[cursor:m.start()]
        cursor = m.end()
        raw = m.group(0)
        path = m.group(1).split(".")
        try:
            value = _resolve(ctx, path)
        except _Unknown:
            problems.append(Violation("unknown_placeholder", raw))
            out += raw
            continue
        try:
            s = format_value(path, value)
        except RenderError:
            problems.append(Violation("unrenderable", raw))
            out += raw
            continue
        unit = None
        if s.endswith(" bps"):
            unit = _UNIT_BPS
        elif s.endswith("%"):
            unit = _UNIT_PCT
        elif s.startswith("$") or s.startswith("-$"):
            unit = _UNIT_USD
            if out.endswith("$"):
                out = out[:-1]
        if unit is not None:
            um = unit.match(template, cursor)
            if um:
                cursor = um.end()
        spans.append((len(out), len(out) + len(s)))
        out += s
        n += 1
    out += template[cursor:]
    # leftover braces that are not valid placeholders
    blanked = PLACEHOLDER_RE.sub(lambda m: " " * len(m.group(0)), template)
    for sm in _STRAY_RE.finditer(blanked):
        problems.append(Violation("unknown_placeholder", template[sm.start():sm.end()]))
    return RenderResult(out, spans, n, problems)


def _leaves(node: Any, path: list[str]):
    if isinstance(node, dict):
        for key, v in node.items():
            yield from _leaves(v, path + [str(key)])
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _leaves(v, path + [str(i)])
    else:
        yield path, node


def catalog_entries(ctx: dict[str, dict], namespaces: list[str]) -> list[tuple[str, str]]:
    """Sorted (dotted path, formatted value) for every renderable leaf."""
    entries: list[tuple[str, str]] = []
    for ns in namespaces:
        if ns not in ctx:
            continue
        for path, value in _leaves(ctx[ns], [ns]):
            try:
                entries.append((".".join(path), format_value(path, value)))
            except RenderError:
                continue
    entries.sort(key=lambda e: e[0])
    return entries


def catalog(ctx: dict[str, dict], namespaces: list[str]) -> str:
    return "\n".join(f"{{{{{p}}}}} = {v}" for p, v in catalog_entries(ctx, namespaces))


# Packet "savings" are not placeholders: the only saving a user sees is the recomputed counterfactual.
# The packets (and their hashes) are unchanged; only the model-facing view drops these keys.
_SAVINGS_KEYS = {"savings_at_050_usd", "savings_at_080_usd", "savings_at_050_bps", "savings_at_080_bps"}


def prompt_view(packet_dict: dict) -> dict:
    return {k: v for k, v in packet_dict.items() if k not in _SAVINGS_KEYS}


def enrichment_ctx(trades) -> dict[str, dict]:
    """`markout.*` and `spread.*` placeholder namespaces (4a). Empty unless trades carry `postPrices` /
    `spreadBps` enrichment, so un-enriched accounts keep byte-identical prompts. All values deterministic."""
    from agents.metrics.markout_packet import HORIZONS_S, build_markout_summary
    ctx: dict[str, dict] = {}
    summary = build_markout_summary(trades or [])
    mk: dict = {"adverse_share": {}}
    for h in HORIZONS_S:
        s = summary[str(h)]
        if s["n"] == 0:
            continue
        mk[f"n_fills_h{h}"] = s["n"]
        for stat in ("mean", "weighted_mean", "median", "p10", "p90"):
            mk[f"h{h}_{stat}_bps"] = s[f"{stat}_bps"]
        for side in ("maker", "taker"):
            mk[f"h{h}_{side}_mean_bps"] = s[side]["mean_bps"]
        mk["adverse_share"][f"h{h}"] = s["adverse_share"]
    if mk["adverse_share"]:
        ctx["markout"] = mk
    cs = [t["spreadBps"]["cs"] for t in trades or [] if (t.get("spreadBps") or {}).get("cs") is not None]
    ar = [t["spreadBps"]["ar"] for t in trades or [] if (t.get("spreadBps") or {}).get("ar") is not None]
    hs = [t["halfSpreadBps"] for t in trades or [] if t.get("halfSpreadBps") is not None]
    if cs and ar and hs:
        cs_m, ar_m = sum(cs) / len(cs), sum(ar) / len(ar)
        ctx["spread"] = {"cs_bps": cs_m, "ar_bps": ar_m, "conservative_bps": min(cs_m, ar_m),
                         "half_spread_bps": min(cs_m, ar_m) / 2, "n_fills_priced": len(hs)}   # always conservative / 2
    return ctx


def packet_ctx(fee, risk, liquidity, alpha, trades=None) -> dict[str, dict]:
    return {
        "fee": prompt_view(fee.to_prompt_dict()),
        "risk": risk.to_prompt_dict(),
        "liquidity": liquidity.to_prompt_dict(),
        "alpha": alpha.to_prompt_dict(),
        **(enrichment_ctx(trades) if trades else {}),
    }

"""Structured acceptance of a Council run (1d.6). Pure, deterministic; no LLM, no I/O.

`result` is CouncilResult.model_dump(mode="json"). A recovered 429 is logged, not a failure.
"""
from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field

DEFAULT_SYNTHESIS_HEADLINE = "Analysis incomplete"   # _default_synthesis marker in agents/council.py
VERDICTS = ("liquidity", "alpha", "risk", "fee")
REQUIRED_FIELDS = (("liquidity", "slippageRoot"), ("alpha", "bestAlternative"),
                   ("fee", "recommendedAction"), ("synthesis", "headline"), ("synthesis", "narrative"))


@dataclass
class Acceptance:
    accepted: bool = True
    failures: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    recovered_429: int = 0
    unrecovered_429: int = 0

    def to_dict(self) -> dict:
        return asdict(self)


def _blank(v) -> bool:
    return not (isinstance(v, str) and v.strip())


def _has_effect(f: dict) -> bool:
    e = f.get("effect_usd")
    ok_num = isinstance(e, (int, float)) and not isinstance(e, bool) and math.isfinite(e)
    return bool(ok_num and f.get("method") and f.get("verified") is True)


def accept_run(result: dict) -> Acceptance:
    fails: list[str] = []
    notes: list[str] = []
    syn = result.get("synthesis") or {}
    grounding = result.get("grounding") or {}

    # 1. not degraded
    if result.get("degraded"):
        fails.append("degraded: " + "; ".join(result.get("degraded_reasons") or []))

    # 2. every expected call succeeded
    ok, exp = result.get("n_calls_ok"), result.get("n_calls_expected")
    if ok != exp:
        fails.append(f"n_calls_ok {ok} != n_calls_expected {exp}")

    # 3. no fallback default object
    defaults = [a for a in VERDICTS if "agent_failed" in ((result.get(a) or {}).get("flags") or [])]
    if syn.get("headline") == DEFAULT_SYNTHESIS_HEADLINE:
        defaults.append("synthesis")
    if defaults:
        fails.append("default object used for: " + ", ".join(defaults))
    for fb in grounding.get("fallbacks") or []:
        if fb.get("fallback_text"):
            notes.append(f"fallback text used for {fb.get('agent')}.{fb.get('field')}")

    # 4. redactions leave every required field non-empty
    redactions = grounding.get("redactions") or []
    if redactions:
        empty = [f"{a}.{k}" for a, k in REQUIRED_FIELDS if _blank((result.get(a) or {}).get(k))]
        for k, v in (result.get("debate_transcript") or {}).items():
            if k.endswith("_summary") and _blank(v):
                empty.append(f"debate.{k}")
        if empty:
            fails.append("required fields empty after redaction: " + ", ".join(empty))
        else:
            notes.append(f"{len(redactions)} sentence(s) redacted; required fields intact")

    # 5. every finding has a recomputed effect
    findings = syn.get("findings") or []
    if not findings:
        notes.append("no findings")
    for i, f in enumerate(findings):
        if not _has_effect(f):
            fails.append(f"finding {i} has no recomputed effect")

    # 6. 429 accounting
    n429 = sum(1 for c in result.get("llm_calls") or [] if c.get("outcome") == "http_429")
    acc = Acceptance(accepted=not fails, failures=fails, notes=notes, recovered_429=n429)
    if n429:
        if acc.accepted:
            notes.append(f"{n429} rate-limited attempts, all recovered")
        else:
            acc.unrecovered_429, acc.recovered_429 = n429, 0
            fails.append(f"rate limits contributed: {n429} http_429 attempts in a rejected run")
    return acc


def string_sweep(text: str) -> dict[str, int]:
    """Secondary report only, never a gate."""
    return {"failed:": text.count("failed:"), "Max retries": text.count("Max retries"),
            "_default_": text.count("_default_"), "429": text.count("429"),
            "rate limit": text.lower().count("rate limit")}

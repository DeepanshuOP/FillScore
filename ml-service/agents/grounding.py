"""
Blocking grounding for the Agent Council.

LLM text may only carry numbers through ``{{ns.key}}`` placeholders (agents.render). Any numeral
the renderer did not produce is a violation: one regeneration with feedback, then sentence
redaction. No raw LLM numeral is ever persisted (Redaction carries no text).
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Callable

from agents import debug_sink
from agents.render import (
    Violation, catalog_entries, render,
)

__all__ = [
    "Numeral", "Violation", "Check", "Redaction", "GroundingFailed", "GroundingLedger",
    "GLOSSARY", "extract_numerals", "check", "split_sentences", "redact", "suggest_placeholder",
    "feedback", "finalize", "grounded_complete",
]


@dataclass
class Numeral:
    text: str
    start: int
    end: int


@dataclass
class Check:
    rendered: str
    violations: list[Violation]
    n_rendered: int


@dataclass
class Redaction:
    agent: str
    field: str
    sentence_index: int
    n_tokens: int
    kinds: list[str]


class GroundingFailed(Exception):
    def __init__(self, agent: str, field: str):
        super().__init__(f"grounding failed for {agent}.{field}")
        self.agent = agent
        self.field = field


# ── numeral extraction ──
_NUM = r"(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|\.\d+)"
_SIGNED = rf"[-−+]?\$?{_NUM}"
_SUFFIX = r"(?:%|\s?bps|bn|mins?|hrs?|st|nd|rd|th|x|k|m|h|s)"
# A letter before the digits does not hide them (`p95`, `top5`, `v2`); `_` and `.` still do
# (`savings_at_050_usd`, decimals). Letters glued after the digits belong to the token (`30d`, `3days`).
_NUMERAL_RE = re.compile(
    r"(?<![0-9_.])(?:"
    r"(?P<allow>24h|24-hour)(?![A-Za-z0-9_])"
    r"|(?P<num>"
    rf"[-−+]?\$?(?:\d{{1,2}}:\d{{2}}|{_NUM}(?:\s*(?:-|–|—|to)\s*{_SIGNED})?{_SUFFIX}?[A-Za-z]*)"
    r")(?![A-Za-z0-9_])"
    r")",
    re.I,
)
_WORDS = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen "
          "fifteen sixteen seventeen eighteen nineteen twenty").split()
_BIG_WORDS = "thirty forty fifty sixty seventy eighty ninety hundred thousand million billion dozen".split()
_WORD_RE = re.compile(r"\b(?:" + "|".join(_WORDS + _BIG_WORDS) + r")\b", re.I)


# Methodology names whose digits/number words are definitional, not data. Closed list; phrase -> the
# packet metric ("namespace.field") the name refers to. Matched case-insensitively, word-bounded.
GLOSSARY: dict[str, str] = {
    "5-minute VWAP": "alpha.avg_vwap_deviation_bps",
    "five-minute VWAP": "alpha.avg_vwap_deviation_bps",
    "30s reversion": "liquidity.reversion_30s_avg_bps",
    "30-second reversion": "liquidity.reversion_30s_avg_bps",
    "60s reversion": "liquidity.reversion_60s_avg_bps",
    "60-second reversion": "liquidity.reversion_60s_avg_bps",
    "30s and 60s reversion": "liquidity.reversion_30s_avg_bps",
    "30s/60s reversion": "liquidity.reversion_30s_avg_bps",
    "top 5 worst trades": "liquidity.worst5_slippage_bps",
    "five worst trades": "liquidity.worst5_slippage_bps",
    "p90 slippage": "liquidity.p90_slippage_bps",
    "p90 trade size": "risk.p90_trade_usd",
}
_GLOSSARY_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?:" + "|".join(re.escape(p) for p in sorted(GLOSSARY, key=len, reverse=True))
    + r")(?![A-Za-z0-9_])", re.I)


def extract_numerals(text: str) -> list[Numeral]:
    found: list[Numeral] = []
    for m in _NUMERAL_RE.finditer(text):
        if m.group("num") is not None:
            found.append(Numeral(m.group("num"), m.start("num"), m.end("num")))
    for m in _WORD_RE.finditer(text):
        found.append(Numeral(m.group(0), m.start(), m.end()))
    gloss = [m.span() for m in _GLOSSARY_RE.finditer(text)]
    found = [n for n in found if not any(a <= n.start and n.end <= b for a, b in gloss)]
    found.sort(key=lambda n: n.start)
    return found


# ── check / sentences / redaction ──
def _digits_covered(text: str, n: Numeral, spans: list[tuple[int, int]]) -> bool:
    digit_pos = [i for i in range(n.start, n.end) if text[i].isdigit()]
    return bool(digit_pos) and all(any(s <= i < e for s, e in spans) for i in digit_pos)


def check(template: str, ctx: dict[str, dict]) -> Check:
    r = render(template, ctx)
    violations = list(r.problems)
    for _s, e in r.spans:   # a letter or digit glued to a rendered value changes what the reader sees
        glued = re.match(r"[A-Za-z0-9]+", r.text[e:])
        if glued:
            violations.append(Violation("numeral", r.text[_s:e] + glued.group(0)))
    for n in extract_numerals(r.text):
        if any(s <= n.start and n.end <= e for s, e in r.spans) or _digits_covered(r.text, n, r.spans):
            continue
        violations.append(Violation("numeral", n.text))
    return Check(r.text, violations, r.n_rendered)


def split_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    return re.split(r"(?<=[.!?])\s+", text)


def redact(template: str, ctx: dict[str, dict], agent: str, field_name: str) -> tuple[str, list[Redaction]]:
    kept: list[str] = []
    reds: list[Redaction] = []
    for i, sentence in enumerate(split_sentences(template)):
        c = check(sentence, ctx)
        if c.violations:
            reds.append(Redaction(agent, field_name, i, len(c.violations),
                                  sorted({v.kind for v in c.violations})))
            debug_sink.record(agent, field_name, "numeral_redacted", sentence, [v.token for v in c.violations])
        else:
            kept.append(sentence)
    return " ".join(kept), reds


# ── suggestions / feedback ──
_WORD_VALUES = {w: i for i, w in enumerate(_WORDS)}
_VALUE_RE = re.compile(r"-?\d+(?:\.\d+)?|-?\.\d+")


def _parse_number(s: str) -> tuple[float, int] | None:
    low = s.strip().lower()
    if low in _WORD_VALUES:
        return float(_WORD_VALUES[low]), 0
    cleaned = low.replace("$", "").replace(",", "").replace("−", "-")
    m = _VALUE_RE.search(cleaned)
    if not m:
        return None
    txt = m.group(0)
    dec = len(txt.split(".")[1]) if "." in txt else 0
    return float(txt), dec


def suggest_placeholder(token: str, ctx: dict[str, dict]) -> str | None:
    want = _parse_number(token)
    if want is None:
        return None
    for path, formatted in catalog_entries(ctx, list(ctx)):
        got = _parse_number(formatted)
        if got is None:
            continue
        value, dec = got
        if abs(round(want[0], dec) - value) < 1e-9:
            return "{{" + path + "}}"
    return None


def feedback(violations: list[Violation], ctx: dict[str, dict]) -> str:
    parts: list[str] = []
    seen: set[str] = set()
    items: list[str] = []
    for v in violations:
        if v.kind != "numeral" or v.token in seen:
            continue
        seen.add(v.token)
        sug = suggest_placeholder(v.token, ctx)
        items.append(f'"{v.token}" (use {sug})' if sug else f'"{v.token}" (no packet value matches; remove it)')
    if items:
        parts.append("Your previous answer contained numbers that were not written as placeholders: "
                     + ", ".join(items) + ".")
    bad: list[str] = []
    for v in violations:
        if v.kind != "numeral" and v.token not in bad:
            bad.append(v.token)
    if bad:
        parts.append("Unknown placeholders: " + ", ".join(bad) + ".")
    parts.append("Rewrite the answer: never write digits or number words; refer to values only with "
                 "placeholders from the list.")
    return " ".join(parts)


def finalize(template: str, ctx: dict[str, dict], agent: str, field_name: str,
             ledger: "GroundingLedger | None" = None) -> str:
    c = check(template, ctx)
    if not c.violations:
        return c.rendered
    cleaned, reds = redact(template, ctx, agent, field_name)
    if ledger is not None:
        ledger.add_redactions(reds)
    c2 = check(cleaned, ctx)
    if c2.violations:  # defensive: never return unverified text
        return ""
    return c2.rendered


# ── ledger ──
def _faith(n_rendered: int, n_viol: int) -> float | None:
    den = n_rendered + n_viol
    return round(n_rendered / den, 4) if den else None


@dataclass
class GroundingLedger:
    regenerations: int = 0
    redactions: list[Redaction] = field(default_factory=list)
    _first: list[Check] = field(default_factory=list)
    _final: list[Check] = field(default_factory=list)
    _agents: dict[str, dict[str, Any]] = field(default_factory=dict)
    fallbacks: list[dict[str, Any]] = field(default_factory=list)

    def record(self, agent: str, field_count: int, first: list[Check], final: list[Check],
               regenerated: bool) -> None:
        self._first.extend(first)
        self._final.extend(final)
        a = self._agents.setdefault(agent, {"viol": 0, "regen": False, "n": 0, "v": 0})
        a["viol"] += sum(len(c.violations) for c in first)
        a["regen"] = a["regen"] or regenerated
        a["n"] += sum(c.n_rendered for c in final)
        a["v"] += sum(len(c.violations) for c in final)

    def add_redactions(self, reds: list[Redaction]) -> None:
        self.redactions.extend(reds)

    def add_fallback(self, agent: str, field_name: str) -> None:
        """A required text field was emptied by redaction and replaced by code-built text."""
        self.fallbacks.append({"agent": agent, "field": field_name, "fallback_text": True})

    def to_dict(self, degraded: bool) -> dict:
        """Run-level grounding report. `faithfulness_first_pass` and `faithfulness_after` are measured
        on the model's text: first answers, and the final candidate after regeneration but BEFORE
        redaction (so they measure the model, not the redaction). A degraded run is never graded, so
        every `faithfulness_after` (top level and per agent) is None for it."""
        fn = sum(c.n_rendered for c in self._first)
        fv = sum(len(c.violations) for c in self._first)
        ln = sum(c.n_rendered for c in self._final)
        lv = sum(len(c.violations) for c in self._final)
        return {
            "violations_first_pass": fv,
            "regenerations": self.regenerations,
            "redactions": [asdict(r) for r in self.redactions],
            "fallbacks": [dict(f) for f in self.fallbacks],
            "numbers_checked": ln + lv,
            "faithfulness_first_pass": _faith(fn, fv),
            "faithfulness_after": None if degraded else _faith(ln, lv),
            "per_agent": {
                name: {"violations_first_pass": a["viol"], "regenerated": a["regen"],
                       "faithfulness_after": None if degraded else _faith(a["n"], a["v"]),
                       "fallback_text": any(f["agent"] == name for f in self.fallbacks)}
                for name, a in self._agents.items()
            },
        }


# ── blocking LLM wrapper ──
async def grounded_complete(
    llm, role: str, system: str, user: str, schema, *, agent: str,
    fields: Callable[[Any], dict[str, str]],
    apply: Callable[[Any, dict[str, str]], Any],
    ctx_for: Callable[[str], dict[str, dict]],
    ledger: GroundingLedger, telemetry=None, max_tokens: int, temperature: float = 0.1,
    allow_regen: bool = True,
):
    """Returns the model with cleaned *templates* applied; the caller renders via finalize()."""
    out = await llm.complete(role, system, user, schema, max_tokens=max_tokens,
                             temperature=temperature, telemetry=telemetry)
    tpl = fields(out)
    first = {p: check(t, ctx_for(p)) for p, t in tpl.items()}
    viols = [v for c in first.values() for v in c.violations]
    if not viols:
        ledger.record(agent, len(tpl), list(first.values()), list(first.values()), False)
        return apply(out, tpl)

    if debug_sink.enabled():
        for p, c in first.items():
            if c.violations:
                for sentence in split_sentences(tpl[p]):
                    sv = check(sentence, ctx_for(p)).violations
                    if sv:
                        debug_sink.record(agent, p, "numeral_flagged", sentence, [v.token for v in sv])

    chosen, chosen_tpl, final = out, tpl, first
    regenerated = False
    if allow_regen:
        ledger.regenerations += 1
        regenerated = True
        first_bad = next(p for p, c in first.items() if c.violations)
        msg = feedback(viols, ctx_for(first_bad))
        try:
            out2 = await llm.complete(role, system, user + "\n\n" + msg, schema, max_tokens=max_tokens,
                                      temperature=temperature, telemetry=telemetry)
        except Exception:
            out2 = None
        if out2 is not None:
            chosen, chosen_tpl = out2, fields(out2)
            final = {p: check(t, ctx_for(p)) for p, t in chosen_tpl.items()}

    cleaned = dict(chosen_tpl)
    for p, c in final.items():
        if c.violations:
            cleaned[p], reds = redact(chosen_tpl[p], ctx_for(p), agent, p)
            ledger.add_redactions(reds)
    ledger.record(agent, len(tpl), list(first.values()), list(final.values()), regenerated)
    return apply(chosen, cleaned)

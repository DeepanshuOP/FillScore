"""Post-verification claim check (2a.2). Pure and deterministic: no LLM, no I/O.

After the verifier has decided which actions passed, headline, narrative and observations may only
call a cost avoidable / missed / saved when the action area they name had a PASSED finding. Advice
wording (should, recommend, consider ...) is never allowed: the product audits the past only.
Flags carry code-owned vocabulary words only, never the sentence text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from agents.grounding import split_sentences

COUNTERFACTUAL_TERMS = ["avoidable", "could have", "would have", "missed", "saved", "saving", "savings",
                        "opportunity", "opportunities", "might have", "could save", "would save", "could cut",
                        "would cut", "could reduce", "would reduce", "could lower", "would lower",
                        "could avoid", "would avoid", "overpaid", "wasted", "unnecessary"]
ADVICE_TERMS = ["should", "recommend", "recommends", "recommended", "recommendation", "recommendations",
                "consider", "better to", "ought", "must", "needs to", "need to", "switch to"]
ACTION_CUES: dict[str, list[str]] = {
    "maker_instead_of_taker": ["taker", "maker", "fee", "fees", "fee drag"],
    "exclude_hours": ["hour", "hours", "UTC", "session", "sessions", "off-peak", "time of day"],
    "venue_shift": ["venue", "venues", "exchange", "exchanges"],
    "smaller_clips": ["clip", "clips", "trade size", "order size", "smaller"],
}


def _rx(terms: list[str]) -> re.Pattern:
    alts = "|".join(r"\s+".join(re.escape(w) for w in t.split()) for t in sorted(terms, key=len, reverse=True))
    return re.compile(r"(?<![A-Za-z])(?:" + alts + r")(?![A-Za-z])", re.I)


_COUNTER_RE = _rx(COUNTERFACTUAL_TERMS)
_ADVICE_RE = _rx(ADVICE_TERMS)
_CUE_RES = {a: _rx(c) for a, c in ACTION_CUES.items()}


def _norm(m: re.Match) -> str:
    return re.sub(r"\s+", " ", m.group(0).lower())


@dataclass
class ClaimFlag:
    field: str
    sentence_index: int
    terms: list[str]
    action_types: list[str]

    def to_dict(self) -> dict:
        return {"field": self.field, "sentence_index": self.sentence_index,
                "terms": list(self.terms), "action_types": list(self.action_types)}


def _flag_sentence(sentence: str, index: int, passed: set[str], field_name: str) -> ClaimFlag | None:
    advice = {_norm(m) for m in _ADVICE_RE.finditer(sentence)}
    counter = {_norm(m) for m in _COUNTER_RE.finditer(sentence)}
    if not advice and not counter:
        return None
    refs = sorted(a for a, rx in _CUE_RES.items() if rx.search(sentence))
    if not advice and refs and set(refs) <= passed:
        return None
    return ClaimFlag(field_name, index, sorted(advice | counter), refs)


def flag_sentences(text: str, passed: set[str], field: str) -> list[ClaimFlag]:
    flags = []
    for i, s in enumerate(split_sentences(text)):
        f = _flag_sentence(s, i, passed, field)
        if f:
            flags.append(f)
    return flags


def check_synthesis(headline: str, narrative: str, observations: list[str], passed: set[str]) -> list[ClaimFlag]:
    flags = flag_sentences(headline, passed, "headline") + flag_sentences(narrative, passed, "narrative")
    for i, text in enumerate(observations):
        flags += flag_sentences(text, passed, f"observations.{i}")
    return flags


def redact_claims(text: str, passed: set[str], field: str) -> tuple[str, list[ClaimFlag]]:
    kept: list[str] = []
    flags: list[ClaimFlag] = []
    for i, s in enumerate(split_sentences(text)):
        f = _flag_sentence(s, i, passed, field)
        if f:
            flags.append(f)
        else:
            kept.append(s)
    return " ".join(kept), flags


@dataclass
class ClaimsLedger:
    flagged_first_pass: int = 0
    regenerated: bool = False
    redactions: list[ClaimFlag] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {"flagged_first_pass": self.flagged_first_pass, "regenerated": self.regenerated,
                "redactions": [r.to_dict() for r in self.redactions]}

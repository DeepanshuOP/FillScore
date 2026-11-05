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
# 2c.A4, debate text only (strict=True). Causal assertions the packets cannot support are flagged for every
# action; the "whale" group is allowed only when this user's risk packet carries whale-adverse evidence
# (risk.whale_adverse_count > 0). Named theories are flagged outright: the simplest rule, since citing one
# is how an unverified conclusion gets dressed up ("...unavoidable under X"); a neutral mention is never needed.
CAUSAL_TERMS = ["unavoidable", "inevitable", "exogenous", "market-structure", "market structure",
                "execution error", "execution errors", "beyond the trader's control", "not the trader's fault"]
WHALE_TERMS = ["whale", "whales"]   # only a count of whale-flagged trades is evidence, never a mechanism
CAUSAL_TERMS += ["manipulation", "manipulated", "spoof", "spoofing", "front-run", "front-running", "frontrun",
                 "frontrunning"]
THEORY_TERMS = ["Cont-Kukanov-Stoikov", "Cont Kukanov Stoikov", "Kukanov", "Almgren-Chriss", "Almgren", "Chriss",
                "Kyle"]
ACTION_CUES: dict[str, list[str]] = {
    "maker_instead_of_taker": ["taker", "maker", "fee", "fees", "fee drag"],
    "exclude_hours": ["hour", "hours", "UTC", "session", "sessions", "off-peak", "time of day"],
    "venue_shift": ["venue", "venues", "exchange", "exchanges"],
    "smaller_clips": ["clip", "clips", "trade size", "order size", "smaller"],
}


def _rx(terms: list[str]) -> re.Pattern:
    alts = "|".join(r"\s+".join(re.escape(w) for w in t.split()) for t in sorted(terms, key=len, reverse=True))
    return re.compile(r"(?<![A-Za-z])(?:" + alts + r")(?![A-Za-z])", re.I)


_CAUSAL_RE = _rx(CAUSAL_TERMS + THEORY_TERMS)
_WHALE_RE = _rx(WHALE_TERMS)
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


def _flag_sentence(sentence: str, index: int, passed: set[str], field_name: str,
                   strict: bool = False, whale_ok: bool = False) -> ClaimFlag | None:
    advice = {_norm(m) for m in _ADVICE_RE.finditer(sentence)}
    counter = {_norm(m) for m in _COUNTER_RE.finditer(sentence)}
    if strict:
        cause = {_norm(m) for m in _CAUSAL_RE.finditer(sentence)}
        if not whale_ok:
            cause |= {_norm(m) for m in _WHALE_RE.finditer(sentence)}
        if cause:   # never excused by a passed action: no packet value supports a cause
            return ClaimFlag(field_name, index, sorted(advice | counter | cause),
                             sorted(a for a, rx in _CUE_RES.items() if rx.search(sentence)))
    if not advice and not counter:
        return None
    refs = sorted(a for a, rx in _CUE_RES.items() if rx.search(sentence))
    if not advice and refs and set(refs) <= passed:
        return None
    return ClaimFlag(field_name, index, sorted(advice | counter), refs)


def flag_sentences(text: str, passed: set[str], field: str, strict: bool = False,
                   whale_ok: bool = False) -> list[ClaimFlag]:
    flags = []
    for i, s in enumerate(split_sentences(text)):
        f = _flag_sentence(s, i, passed, field, strict, whale_ok)
        if f:
            flags.append(f)
    return flags


def check_synthesis(headline: str, narrative: str, observations: list[str], passed: set[str]) -> list[ClaimFlag]:
    flags = flag_sentences(headline, passed, "headline") + flag_sentences(narrative, passed, "narrative")
    for i, text in enumerate(observations):
        flags += flag_sentences(text, passed, f"observations.{i}")
    return flags


def redact_claims(text: str, passed: set[str], field: str, strict: bool = False,
                  whale_ok: bool = False) -> tuple[str, list[ClaimFlag]]:
    kept: list[str] = []
    flags: list[ClaimFlag] = []
    for i, s in enumerate(split_sentences(text)):
        f = _flag_sentence(s, i, passed, field, strict, whale_ok)
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
    debate_flagged: int = 0   # 2c.A4: sentences of debate text redacted by the claim check

    def to_dict(self) -> dict:
        return {"flagged_first_pass": self.flagged_first_pass, "regenerated": self.regenerated,
                "redactions": [r.to_dict() for r in self.redactions]}


KEY_DISPUTE_FALLBACK = "The two sides disagreed on the cause of the costs; the audited figures are in the findings."


def enforce_debate(debate: dict, passed: set[str], ctx: dict, cl: "ClaimsLedger") -> tuple[dict, list]:
    """2c.A4: the strict claim check on the debate's prosecution/defense summaries, every claim text and the
    key dispute, run after verification. Policy: redact by sentence, then the A3 code-built fallback for a
    summary or key dispute left empty; a claim left empty is dropped (a side always keeps one claim: its
    fallback). No regeneration (the debate is over). Returns (new debate dict, [(field, ClaimFlag)])."""
    from agents import debug_sink
    from agents.debate import fallback_text

    if not debate or not debate.get("claims"):
        return debate, []
    whale_ok = float(ctx.get("risk", {}).get("whale_adverse_count") or 0) > 0
    out = {**debate, "claims": [dict(c) for c in debate["claims"]]}
    log: list = []

    def scrub(text: str, field_name: str) -> str:
        cleaned, reds = redact_claims(text, passed, field_name, strict=True, whale_ok=whale_ok)
        for r in reds:
            debug_sink.record("debate", field_name, "claim_redacted", split_sentences(text)[r.sentence_index],
                              r.terms)
            log.append((field_name, r))
        cl.redactions.extend(reds)
        cl.debate_flagged += len(reds)
        return cleaned

    for side in ("prosecution", "defense"):
        key = f"{side}_summary"
        out[key] = scrub(debate[key], key) if debate.get(key) else debate.get(key, "")
        if debate.get(key) and not out[key].strip():
            out[key] = fallback_text(side, ctx)[0]
    kept = []
    for i, c in enumerate(out["claims"]):
        c["claim_text"] = scrub(c["claim_text"], f"debate.claims.{i}")
        if c["claim_text"].strip():
            kept.append(c)
    for side in ("prosecution", "defense"):
        if not any(c["side"] == side for c in kept):   # keep the debate two-sided
            text, keys = fallback_text(side, ctx)
            kept.append({"side": side, "claim_id": f"{side[0].upper()}0", "claim_text": text,
                         "evidence_keys": keys, "rebuts": None})
    out["claims"] = kept
    if debate.get("key_dispute"):
        kd = scrub(debate["key_dispute"], "key_dispute")
        out["key_dispute"] = kd if kd.strip() else KEY_DISPUTE_FALLBACK
    return out, log

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
# 3a G0: causal connectives are flagged in every text (debate, synthesis, findings) unless the sentence
# describes a PASSED verified finding of the matching action (same excuse as the counterfactual terms).
#
# Claim rules are versioned (config.versions.CLAIM_RULES_VERSION). 1.0.0 is the list below; 1.1.0 (2026-11-17) adds a
# bare "because" and the causal words the demo serving path already refused. A result carries the version it was made
# under; one with no stamp was made under 1.0.0. The offline evals judge each result by its own version.
CONNECTIVE_TERMS_1_0_0 = ["due to", "because of", "resulting from", "caused by", "driven by", "led to",
                          "as a result of"]
# Keep this literal's first list equal to backend/src/constants/adviceTerms.ts (a test reads it).
CONNECTIVE_TERMS = ["due to", "because of", "resulting from", "caused by", "driven by", "led to",
                    "as a result of", "because", "therefore", "thereby", "hence", "consequently"]
CONNECTIVE_BY_RULES = {"1.0.0": CONNECTIVE_TERMS_1_0_0, "1.1.0": CONNECTIVE_TERMS, "1.2.0": CONNECTIVE_TERMS,
                      "1.3.0": CONNECTIVE_TERMS, "1.4.0": CONNECTIVE_TERMS}

# 1.2.0 (2026-11-19), decided from the 18 ablation recordings; hand cases in tests/test_claim_rules_1_2_0.py.
# (a) causal phrasings, in every text, never excused by a passed finding (no packet value supports a cause).
CAUSAL_PHRASES_1_2_0 = ["inherent to", "resulting in", "led to", "drove"]
_RATHER_ERROR_RE = re.compile(r"(?<![A-Za-z])rather\s+than\s+(?:[A-Za-z'-]+\s+){0,4}?errors?(?![A-Za-z])", re.I)
# (b) unbacked judgements: an evaluative word about the trader's execution or the venue, in a sentence with no
# numeral and no {{placeholder}} behind it. The number must be in the same sentence (stated limit).
_EVAL_ADJ = ["efficient", "inefficient", "low", "high", "good", "poor", "strong", "weak", "acceptable", "excellent",
             "healthy", "optimal", "suboptimal", "reasonable", "favorable", "favourable", "solid", "decent"]
_EVAL_NOUN = ["routing", "execution", "executions", "fee drag", "fees", "fee", "slippage", "spread", "spreads",
              "impact", "costs", "cost", "timing", "venue", "venues", "fills", "fill quality", "order flow"]
_ADJ = "(" + "|".join(sorted(_EVAL_ADJ, key=len, reverse=True)) + ")"
_NOUN = "(?:" + "|".join(r"\s+".join(w.split()) for w in sorted(_EVAL_NOUN, key=len, reverse=True)) + ")"
_BE = r"(?:is|are|was|were|remained|remains|stayed|stays|looked|looks|appeared|appears|seemed|seems|became|became)"
_ADV = r"(?:(?:very|quite|fairly|relatively|generally|consistently|broadly)\s+)?"
_ADJ_NOUN_RE = re.compile(r"(?<![A-Za-z])" + _ADJ + r"\s+(?:[A-Za-z]+\s+){0,2}?" + _NOUN + r"(?![A-Za-z])", re.I)
_NOUN_ADJ_RE = re.compile(r"(?<![A-Za-z])" + _NOUN + r"\s+" + _BE + r"\s+" + _ADV + _ADJ + r"(?![A-Za-z])", re.I)
_WITHIN_RE = re.compile(r"(?<![A-Za-z])within\s+(?:the\s+)?(?:acceptable|normal|reasonable|expected|typical)\s+"
                        r"(?:range|limits|bounds)(?![A-Za-z])", re.I)
_HAS_NUMBER_RE = re.compile(r"\d|\{\{")
_CAUSAL_PHRASE_RE = None   # built after _rx is defined
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
_WHALE_KEY_RE = re.compile(r"\{\{\s*(?:risk\.whale_adverse_count|whale\.[A-Za-z0-9_.]+)\s*\}\}")
_COUNTER_RES = {v: _rx(COUNTERFACTUAL_TERMS + t) for v, t in CONNECTIVE_BY_RULES.items()}


# Rules 1.1.0 match on text with the look-alike dashes (U+2010-U+2015, U+2212) read as "-" and the no-break spaces
# (U+00A0, U+202F) read as " ": a model wrote "market‑structure" and the named term did not match. The stored text
# is never changed by this; only the matching sees the folded form.
_DASHES = set("‐‑‒–—―−")
_FOLD_RE = re.compile("[‐-―−  ]")


def _current_rules() -> str:
    from config.versions import CLAIM_RULES_VERSION
    return CLAIM_RULES_VERSION


def _counter_re(rules: str | None) -> re.Pattern:
    v = rules or _current_rules()
    if v not in _COUNTER_RES:
        raise ValueError(f"unknown claim rules version {v!r}; known: {sorted(_COUNTER_RES)}")
    return _COUNTER_RES[v]


_ADVICE_RE = _rx(ADVICE_TERMS)
_CUE_RES = {a: _rx(c) for a, c in ACTION_CUES.items()}
_CAUSAL_PHRASE_RE = _rx(CAUSAL_PHRASES_1_2_0)


def _at_least(version: str, floor: str) -> bool:
    return tuple(int(x) for x in version.split(".")) >= tuple(int(x) for x in floor.split("."))


def extra_terms_1_2_0(sentence: str) -> set[str]:
    """Rules 1.2.0 only: causal phrasings and unbacked judgements. Labels are code-owned words, never sentence text."""
    out = {_norm(m) for m in _CAUSAL_PHRASE_RE.finditer(sentence)}
    if _RATHER_ERROR_RE.search(sentence):
        out.add("rather than ... error")
    if not _HAS_NUMBER_RE.search(sentence):
        out |= {f"unbacked: {m.group(1).lower()}" for m in _ADJ_NOUN_RE.finditer(sentence)}
        out |= {f"unbacked: {m.group(1).lower()}" for m in _NOUN_ADJ_RE.finditer(sentence)}
        if _WITHIN_RE.search(sentence):
            out.add("unbacked: within range")
    return out


# 1.4.0 (2026-11-22; PROGRESS item 23, option C): a bare "rather than" joins "inherent to" and "resulting in" (both already
# in 1.2.0's CAUSAL_PHRASES_1_2_0) as a causal phrasing. "A rather than B" contrasts a cause with an unstated one, which no
# packet value supports. Never excused by a passed finding. Hand cases and guards: tests/test_claim_rules_1_4_0.py.
CAUSAL_PHRASES_1_4_0 = ["inherent to", "resulting in", "rather than"]
_CAUSAL_PHRASE_RE_1_4_0 = _rx(CAUSAL_PHRASES_1_4_0)


def extra_terms_1_4_0(sentence: str) -> set[str]:
    """Rules 1.4.0 only (on top of 1.2.0's): the causal phrasings of CAUSAL_PHRASES_1_4_0. Code-owned labels."""
    return {_norm(m) for m in _CAUSAL_PHRASE_RE_1_4_0.finditer(sentence)}


# 1.3.0 (2026-11-20): the specialists' flags, as the card shows them, go through the counterfactual and advice lists.
# Same humanising as frontend/app/utils/councilStatus.ts flagLabel (fixed map, else snake_case title-cased, else as is).
_TAG_LABELS = {"zero_market_orders": "No market orders", "single_symbol_concentration": "Single-symbol concentration",
               "agent_failed": "Agent unavailable"}
_TAG_RE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")
FLAG_AGENTS = ("liquidity", "alpha", "risk", "fee")


def humanise_flag(tag: str) -> str:
    if tag in _TAG_LABELS:
        return _TAG_LABELS[tag]
    if not _TAG_RE.match(tag):
        return tag
    return " ".join(w[:1].upper() + w[1:] for w in tag.split("_"))


def flag_terms_1_3_0(tag: str) -> list[str]:
    """Counterfactual and advice words in a flag as displayed. Never excused by a passed finding."""
    shown = _FOLD_RE.sub(lambda m: "-" if m.group(0) in _DASHES else " ", humanise_flag(tag))
    return sorted({_norm(m) for m in _ADVICE_RE.finditer(shown)} | {_norm(m) for m in _counter_re("1.3.0").finditer(shown)})


def flag_hits_1_3_0(result: dict) -> list[str]:
    """"agent.flags.i:terms" for every flag of the four specialists that carries such a word."""
    hits = []
    for agent in FLAG_AGENTS:
        flags = (result.get(agent) or {}).get("flags")
        for i, tag in enumerate(flags if isinstance(flags, list) else []):
            if isinstance(tag, str) and (terms := flag_terms_1_3_0(tag)):
                hits.append(f"{agent}.flags.{i}:{'/'.join(terms)}")
    return hits


def _cites_whale_count(sentence: str, token: str | None) -> bool:
    """The sentence cites the whale evidence: its placeholder (pre-render text) or the rendered count token
    (debate text is already rendered when the post-verification check runs)."""
    if _WHALE_KEY_RE.search(sentence):
        return True
    return bool(token) and re.search(r"(?<![\d.,$])" + re.escape(token) + r"(?![\d,%]|\.\d)", sentence) is not None


def result_texts(result: dict) -> list[tuple[str, str]]:
    """The copy of a Council or single-call result, as (field, text): everything a reader is shown. The grounding and
    claims ledgers, ids, hashes and model names are not copy. One list for the offline evals and the serving path."""
    syn = result.get("synthesis") or {}
    out = [("headline", syn.get("headline") or ""), ("narrative", syn.get("narrative") or "")]
    out += [(f"observations.{i}", o.get("text") or "") for i, o in enumerate(syn.get("observations") or [])]
    out += [(f"findings.{i}", f.get("text") or "") for i, f in enumerate(syn.get("findings") or [])]
    out += [("liquidity.slippageRoot", (result.get("liquidity") or {}).get("slippageRoot") or ""),
            ("alpha.bestAlternative", (result.get("alpha") or {}).get("bestAlternative") or ""),
            ("fee.recommendedAction", (result.get("fee") or {}).get("recommendedAction") or "")]
    d = result.get("debate_transcript") or {}
    for k in ("prosecution_summary", "defense_summary", "key_dispute"):
        out.append((f"debate.{k}", d.get(k) or ""))
    for i, c in enumerate(d.get("claims") or []):
        out.append((f"debate.claims.{i}", (c.get("claim_text") if isinstance(c, dict) else str(c)) or ""))
    return [(f, t) for f, t in out if isinstance(t, str) and t.strip()]


def new_rule_hits(result: dict) -> list[str]:
    """Rules 1.2.0 and 1.3.0 (the part no passed finding excuses), "field:terms" per flagged sentence, over the result's
    copy, then per flagged specialist flag (1.3.0). The serving path uses this: the older terms are excused by a passed
    finding, which needs the verified findings."""
    hits = []
    for field, text in result_texts(result):
        for i, s in enumerate(split_sentences(text)):
            folded = _FOLD_RE.sub(lambda m: "-" if m.group(0) in _DASHES else " ", s)
            terms = extra_terms_1_2_0(folded)
            if _at_least(_current_rules(), "1.4.0"):
                terms |= extra_terms_1_4_0(folded)
            if terms:
                hits.append(f"{field}:{'/'.join(sorted(terms))}")
    return hits + flag_hits_1_3_0(result)


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
                   strict: bool = False, whale_ok: bool = False, whale_token: str | None = None,
                   rules: str | None = None) -> ClaimFlag | None:
    counter_re = _counter_re(rules)
    if (rules or _current_rules()) != "1.0.0":
        sentence = _FOLD_RE.sub(lambda m: "-" if m.group(0) in _DASHES else " ", sentence)   # 1.1.0: look-alike dashes/spaces
    advice = {_norm(m) for m in _ADVICE_RE.finditer(sentence)}
    counter = {_norm(m) for m in counter_re.finditer(sentence)}
    if strict:
        cause = {_norm(m) for m in _CAUSAL_RE.finditer(sentence)}
        # 2c.2 C0: "whale" is allowed only in a sentence citing a whale placeholder, and only when count > 0
        if not (whale_ok and _cites_whale_count(sentence, whale_token)):
            cause |= {_norm(m) for m in _WHALE_RE.finditer(sentence)}
        if cause:   # never excused by a passed action: no packet value supports a cause
            return ClaimFlag(field_name, index, sorted(advice | counter | cause),
                             sorted(a for a, rx in _CUE_RES.items() if rx.search(sentence)))
    if _at_least(rules or _current_rules(), "1.2.0"):
        extra = extra_terms_1_2_0(sentence)
        if _at_least(rules or _current_rules(), "1.4.0"):
            extra |= extra_terms_1_4_0(sentence)
        if extra:   # never excused by a passed action: no packet value supports a cause or a number-free judgement
            return ClaimFlag(field_name, index, sorted(advice | counter | extra),
                             sorted(a for a, rx in _CUE_RES.items() if rx.search(sentence)))
    if not advice and not counter:
        return None
    refs = sorted(a for a, rx in _CUE_RES.items() if rx.search(sentence))
    if not advice and refs and set(refs) <= passed:
        return None
    return ClaimFlag(field_name, index, sorted(advice | counter), refs)


def flag_sentences(text: str, passed: set[str], field: str, strict: bool = False,
                   whale_ok: bool = False, whale_token: str | None = None,
                   rules: str | None = None) -> list[ClaimFlag]:
    flags = []
    for i, s in enumerate(split_sentences(text)):
        f = _flag_sentence(s, i, passed, field, strict, whale_ok, whale_token, rules)
        if f:
            flags.append(f)
    return flags


def check_synthesis(headline: str, narrative: str, observations: list[str], passed: set[str]) -> list[ClaimFlag]:
    flags = flag_sentences(headline, passed, "headline") + flag_sentences(narrative, passed, "narrative")
    for i, text in enumerate(observations):
        flags += flag_sentences(text, passed, f"observations.{i}")
    return flags


def redact_claims(text: str, passed: set[str], field: str, strict: bool = False,
                  whale_ok: bool = False, whale_token: str | None = None) -> tuple[str, list[ClaimFlag]]:
    kept: list[str] = []
    flags: list[ClaimFlag] = []
    for i, s in enumerate(split_sentences(text)):
        f = _flag_sentence(s, i, passed, field, strict, whale_ok, whale_token)
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
    whale_n = float(ctx.get("risk", {}).get("whale_adverse_count") or 0)
    whale_ok = whale_n > 0
    whale_token = f"{int(round(whale_n)):,}" if whale_ok else None   # same format as render.format_value (*_count)
    out = {**debate, "claims": [dict(c) for c in debate["claims"]]}
    log: list = []

    def scrub(text: str, field_name: str) -> str:
        cleaned, reds = redact_claims(text, passed, field_name, strict=True, whale_ok=whale_ok, whale_token=whale_token)
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

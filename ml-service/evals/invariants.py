"""Invariants any acceptable Council output must satisfy (pure, deterministic, no LLM, no I/O).

`check_all(result, golden)`:
  result  a CouncilResult.model_dump(mode="json") (rendered text, as persisted / returned to users)
  golden  {"id", "packet": {fee,risk,liquidity,alpha dicts}, "n_trades", optional "allowed_overall"}

Each invariant returns Outcome(ok, detail). Rendered text carries no placeholders any more, so the
"no raw numerals" invariant checks the other direction: every numeral in the text must be a value the
renderer could have produced from the packet (or a verified finding), so a number the model invented
cannot pass. Thresholds are the production ones (verification.materiality_threshold, claims term lists).
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass

from typing import get_args

from agents.claims import KEY_DISPUTE_FALLBACK, flag_sentences
from agents.schemas import AlphaVerdict, FeeVerdict, LiquidityVerdict, RiskVerdict
from agents.grounding import extract_numerals
from agents.render import RenderError, _leaves, catalog_entries, format_value, prompt_view
from agents.verification import ACTIONS, materiality_threshold

OVERALL = ("EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL")
SPECIALISTS = {"liquidity": "liquidityRating", "alpha": "alphaRating", "risk": "riskLevel", "fee": "feeRating"}
def _enum(model, field):
    return get_args(model.model_fields[field].annotation)


SPECIALIST_ENUMS = {   # from the schemas, so a schema change cannot silently desync the eval
    "liquidity": _enum(LiquidityVerdict, "liquidityRating"),
    "alpha": _enum(AlphaVerdict, "alphaRating"),
    "risk": _enum(RiskVerdict, "riskLevel"),
    "fee": _enum(FeeVerdict, "feeRating"),
}
NAMES = ("rating_allowed", "evidence_cited", "no_flagged_terms", "numerals_grounded", "findings_gated",
         "packet_provenance")


@dataclass
class Outcome:
    ok: bool
    detail: str = ""


def _texts(result: dict) -> list[tuple[str, str]]:
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


def _passed_actions(result: dict) -> set[str]:
    return {f.get("action_type") for f in (result.get("synthesis") or {}).get("findings") or []
            if f.get("verified") is True}


def rating_allowed(result: dict, golden: dict) -> Outcome:
    syn = result.get("synthesis") or {}
    allowed = tuple(golden.get("allowed_overall") or OVERALL)
    rating = syn.get("overallRating")
    if rating is None:
        return Outcome(bool(result.get("degraded")), "overallRating None on a run not marked degraded"
                       if not result.get("degraded") else "degraded run, ungraded")
    if rating not in allowed:
        return Outcome(False, f"overallRating {rating} not in {list(allowed)}")
    for agent, key in SPECIALISTS.items():
        if agent not in result:   # single-call arm has no specialists
            continue
        v = (result.get(agent) or {}).get(key)
        if v not in SPECIALIST_ENUMS[agent]:
            return Outcome(False, f"{agent}.{key}={v!r} not in {list(SPECIALIST_ENUMS[agent])}")
    return Outcome(True)


def _ctx(golden: dict) -> dict:
    pk = golden.get("packet") or {}
    return {ns: (prompt_view(v) if ns == "fee" else v) for ns, v in pk.items()}


def _norm(tok: str) -> str:
    return "".join(tok.lower().split())


def _tokens(text: str) -> set[str]:
    return {_norm(n.text) for n in extract_numerals(text)}


def _key_value(ctx: dict, dotted: str) -> str | None:
    """The string `render` would show for packet key `ns.key` (None if absent or unrenderable)."""
    path = dotted.split(".")
    node = ctx
    for seg in path:
        if isinstance(node, dict) and seg in node:
            node = node[seg]
        elif isinstance(node, list) and seg.isdigit() and int(seg) < len(node):
            node = node[int(seg)]
        else:
            return None
    try:
        return format_value(path, node)
    except RenderError:
        return None


AGENT_TEXT = {   # rendered text fields each specialist owns
    "fee_optimizer": lambda r: [(r.get("fee") or {}).get("recommendedAction")] + list((r.get("fee") or {}).get("flags") or []),
    "liquidity_scout": lambda r: [(r.get("liquidity") or {}).get("slippageRoot")] + list((r.get("liquidity") or {}).get("flags") or []),
    "alpha_architect": lambda r: [(r.get("alpha") or {}).get("bestAlternative")] + list((r.get("alpha") or {}).get("flags") or []),
    "risk_auditor": lambda r: list((r.get("risk") or {}).get("flags") or []),
}


def _synthesis_text(result: dict) -> list[str]:
    syn = result.get("synthesis") or {}
    return [syn.get("headline"), syn.get("narrative")] + [o.get("text") for o in syn.get("observations") or []] \
        + [f.get("text") for f in syn.get("findings") or []]


def _cited(ctx: dict, texts: list, keys: list[str]) -> list[str]:
    """Required keys whose rendered value does NOT appear (as a numeral token) in these texts."""
    blob = " \n ".join(t for t in texts if isinstance(t, str))
    toks = _tokens(blob)
    missing = []
    for key in keys:
        shown = _key_value(ctx, key)
        if shown is None:
            missing.append(f"{key}(not renderable from the golden packet)")
            continue
        want = _tokens(shown)
        if not (want <= toks if want else shown in blob):
            missing.append(key)
    return missing


def evidence_cited(result: dict, golden: dict) -> Outcome:
    """Each agent cited at least one packet value (values_cited) AND showed every key the golden file
    requires of it (golden["required_evidence"][agent]; the key's rendered value must appear in the
    agent's text). Single-call arm: the synthesis text must show the union of all required keys."""
    per = ((result.get("grounding") or {}).get("per_agent")) or {}
    council = "liquidity" in result
    expected = ("fee_optimizer", "risk_auditor", "alpha_architect", "liquidity_scout", "synthesis") \
        if council else ("synthesis",)
    bad = [f"{a}: no packet value cited" for a in expected if not (per.get(a) or {}).get("values_cited")]
    ctx = _ctx(golden)
    req = golden.get("required_evidence") or {}
    if council:
        for agent, getter in AGENT_TEXT.items():
            miss = _cited(ctx, getter(result), req.get(agent) or [])
            if miss:
                bad.append(f"{agent}: required {', '.join(miss)} not cited")
        miss = _cited(ctx, _synthesis_text(result), req.get("synthesis") or [])
        if miss:
            bad.append(f"synthesis: required {', '.join(miss)} not cited")
    else:
        union = list(dict.fromkeys(k for keys in req.values() for k in keys))
        miss = _cited(ctx, _synthesis_text(result), union)
        if miss:
            bad.append(f"synthesis: required {', '.join(miss)} not cited")
    return Outcome(not bad, "; ".join(bad))


def no_flagged_terms(result: dict, golden: dict) -> Outcome:
    """No advice, counterfactual, causal or mechanism wording (strict, as for debate text), except
    counterfactual wording about an action area that has a passed finding."""
    passed = _passed_actions(result)
    risk = (golden.get("packet") or {}).get("risk") or {}
    n_whale = risk.get("whale_adverse_count") or 0
    bad = []
    for field, text in _texts(result):
        # strict (causal/mechanism terms) only on debate text, exactly as production enforces it
        for fl in flag_sentences(text, passed, field, strict=field.startswith("debate."), whale_ok=n_whale > 0,
                                 whale_token=str(n_whale) if n_whale else None):
            bad.append(f"{field}:{'/'.join(fl.terms)}")
    return Outcome(not bad, "; ".join(bad[:6]))


def _packet_tokens(golden: dict) -> set[str]:
    """Numeral tokens of every packet value exactly as render.format_value shows it."""
    toks: set[str] = set()
    for _path, shown in catalog_entries(_ctx(golden), list((golden.get("packet") or {}))):
        toks |= _tokens(shown)
    return toks


def _finding_tokens(f: dict) -> set[str]:
    """Tokens a verified finding's text may carry: its own cf values (rendered by the same formatter)."""
    toks: set[str] = set()
    cf = {k: f.get(k) for k in ("effect_usd", "effect_bps", "n_trades_affected")}
    for path, v in list(_leaves(cf, ["cf"])) + list(_leaves(f.get("params") or {}, ["cf"])):
        try:
            toks |= _tokens(format_value(path, v))
        except RenderError:
            continue
    return toks


def _method_numbers(f: dict) -> list[float]:
    """Numbers in the code-written `method` string (cf details such as from_bps are not stored elsewhere)."""
    return [x for x in (_parse(n.text) for n in extract_numerals(f.get("method") or "")) if x is not None]


_ORDINAL = re.compile(r"^\d+(?:st|nd|rd|th)$")
_LIST_MARKER = re.compile(r"(?m)^\s*\d+[.)]\s+")


def _parse(tok: str) -> float | None:
    s = tok.strip().lower().replace("−", "-").replace("$", "").replace(",", "")
    s = s.rstrip("abcdefghijklmnopqrstuvwxyz%").strip()
    try:
        return float(s.split()[0].split("-")[0]) if s and not s.startswith("-") else float(s.split()[0])
    except (ValueError, IndexError):
        return None


def numerals_grounded(result: dict, golden: dict) -> Outcome:
    """A displayed numeral passes only if it is character-for-character a packet value as render.format_value
    shows it, a finding's own rendered cf value (or a number in that finding's code-written method string),
    or a structural token (percentile label, glossary name, ordinal, list marker). No numeric tolerance."""
    packet = _packet_tokens(golden)
    findings = (result.get("synthesis") or {}).get("findings") or []
    bad = []
    for field, text in _texts(result):
        text = _LIST_MARKER.sub("", text.replace(KEY_DISPUTE_FALLBACK, ""))   # code-owned sentence is not model output
        allowed = set(packet)
        method: list[float] = []
        if field.startswith("findings."):
            f = findings[int(field.split(".")[1])]
            allowed |= _finding_tokens(f)
            method = _method_numbers(f)
        for n in extract_numerals(text):
            tok = _norm(n.text)
            if tok in allowed or _ORDINAL.match(tok):
                continue
            x = _parse(n.text)
            if x is not None and any(abs(x - m) <= 0.051 for m in method):
                continue
            bad.append(f"{field}:{n.text}")   # includes number words: only the renderer may write numbers
    return Outcome(not bad, "; ".join(bad[:6]))


def findings_gated(result: dict, golden: dict) -> Outcome:
    fees = ((golden.get("packet") or {}).get("fee") or {}).get("total_fee_paid_usd") or 0.0
    gate = materiality_threshold(float(fees))
    bad = []
    for i, f in enumerate((result.get("synthesis") or {}).get("findings") or []):
        e = f.get("effect_usd")
        if f.get("action_type") not in ACTIONS or f.get("action_type") in ("none", "general"):
            bad.append(f"findings.{i}: action {f.get('action_type')!r} cannot carry an effect")
        elif not (isinstance(e, (int, float)) and not isinstance(e, bool) and math.isfinite(e) and e > gate):
            bad.append(f"findings.{i}: effect_usd {e!r} not above gate {gate:.4f}")
        elif f.get("verified") is not True or not f.get("method"):
            bad.append(f"findings.{i}: not verified / no method")
    return Outcome(not bad, "; ".join(bad))


def packet_provenance(result: dict, golden: dict) -> Outcome:
    """Replaces numeric_fields_match. Its cost check was a tautology (code overwrites
    estimatedMonthlyCostUSD; test_cost_override covers that). What can still fail: the run must record the
    trade count and all four packet hashes it saw, and they must equal the golden file's, so a recording
    made on different data (or a stale golden) is caught. A missing field fails."""
    pk = golden.get("packet") or {}
    tc = result.get("tradeContext") or {}
    bad = []
    if golden.get("n_trades") is not None and tc.get("trade_count") != golden["n_trades"]:
        bad.append(f"trade_count {tc.get('trade_count')!r} != {golden['n_trades']}")
    for ns, key in (("fee", "fee_packet_hash"), ("risk", "risk_packet_hash"),
                    ("liquidity", "liquidity_packet_hash"), ("alpha", "alpha_packet_hash")):
        h = (pk.get(ns) or {}).get("content_hash")
        if h and tc.get(key) != h:
            bad.append(f"{key} {tc.get(key)!r} != golden {h}")
    return Outcome(not bad, "; ".join(bad))


CHECKS = {"rating_allowed": rating_allowed, "evidence_cited": evidence_cited, "no_flagged_terms": no_flagged_terms,
          "numerals_grounded": numerals_grounded, "findings_gated": findings_gated,
          "packet_provenance": packet_provenance}


def check_all(result: dict, golden: dict) -> dict[str, Outcome]:
    return {name: fn(result, golden) for name, fn in CHECKS.items()}

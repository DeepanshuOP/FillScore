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
from dataclasses import dataclass

from typing import get_args

from agents.claims import KEY_DISPUTE_FALLBACK, flag_sentences
from agents.schemas import AlphaVerdict, FeeVerdict, LiquidityVerdict, RiskVerdict
from agents.grounding import extract_numerals
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
         "numeric_fields_match")


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


def evidence_cited(result: dict, golden: dict) -> Outcome:
    """Every specialist and the synthesis cited at least one packet value (stored as values_cited)."""
    per = ((result.get("grounding") or {}).get("per_agent")) or {}
    expected = ("fee_optimizer", "risk_auditor", "alpha_architect", "liquidity_scout", "synthesis") \
        if "liquidity" in result else ("synthesis",)   # single-call arm: synthesis only
    missing = [a for a in expected if not (per.get(a) or {}).get("values_cited")]
    return Outcome(not missing, "no packet value cited by: " + ", ".join(missing) if missing else "")


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


def _allowed_numbers(result: dict, golden: dict) -> list[float]:
    vals: list[float] = []

    def walk(n):
        if isinstance(n, bool):
            return
        if isinstance(n, (int, float)) and math.isfinite(n):
            vals.extend([float(n), float(n) * 100.0, abs(float(n))])
        elif isinstance(n, dict):
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    walk(golden.get("packet") or {})
    for f in (result.get("synthesis") or {}).get("findings") or []:
        walk({k: f.get(k) for k in ("effect_usd", "effect_bps", "n_trades_affected")})
        walk(f.get("params") or {})
    return vals


def _parse(tok: str) -> float | None:
    s = tok.strip().lower().replace("−", "-").replace("$", "").replace(",", "")
    s = s.rstrip("abcdefghijklmnopqrstuvwxyz%").strip()
    try:
        return float(s.split()[0].split("-")[0]) if s and not s.startswith("-") else float(s.split()[0])
    except (ValueError, IndexError):
        return None


def numerals_grounded(result: dict, golden: dict) -> Outcome:
    allowed = _allowed_numbers(result, golden)
    bad = []
    for field, text in _texts(result):
        text = text.replace(KEY_DISPUTE_FALLBACK, "")   # code-owned constant sentence, not model output
        for n in extract_numerals(text):
            x = _parse(n.text)
            if x is None:
                bad.append(f"{field}:{n.text}")   # a number word: only the renderer may write numbers
                continue
            if not any(abs(x - a) <= max(0.051, 0.006 * abs(a)) for a in allowed):
                bad.append(f"{field}:{n.text}")
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


def numeric_fields_match(result: dict, golden: dict) -> Outcome:
    pk = golden.get("packet") or {}
    bad = []
    cost = (result.get("synthesis") or {}).get("estimatedMonthlyCostUSD")
    want = (pk.get("fee") or {}).get("total_fee_paid_usd")
    if want is not None and not (isinstance(cost, (int, float)) and abs(cost - want) < 1e-3):
        bad.append(f"estimatedMonthlyCostUSD {cost!r} != fee.total_fee_paid_usd {want!r}")
    tc = result.get("tradeContext") or {}
    if tc.get("trade_count") is not None and golden.get("n_trades") is not None \
            and tc["trade_count"] != golden["n_trades"]:
        bad.append(f"trade_count {tc['trade_count']} != {golden['n_trades']}")
    for ns, key in (("fee", "fee_packet_hash"), ("risk", "risk_packet_hash"),
                    ("liquidity", "liquidity_packet_hash"), ("alpha", "alpha_packet_hash")):
        h = (pk.get(ns) or {}).get("content_hash")
        if h and tc.get(key) and tc[key] != h:
            bad.append(f"{key} {tc[key]} != golden {h}")
    return Outcome(not bad, "; ".join(bad))


CHECKS = {"rating_allowed": rating_allowed, "evidence_cited": evidence_cited, "no_flagged_terms": no_flagged_terms,
          "numerals_grounded": numerals_grounded, "findings_gated": findings_gated,
          "numeric_fields_match": numeric_fields_match}


def check_all(result: dict, golden: dict) -> dict[str, Outcome]:
    return {name: fn(result, golden) for name, fn in CHECKS.items()}

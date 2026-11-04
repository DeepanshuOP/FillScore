"""Synthesis Agent (the judge) — conflict resolution and the overall audit finding.

The model is chosen by the router (config/llm_routes.yaml, role "synthesis": strongest first).
Priority in volatile regimes: Risk > Liquidity > Fee > Alpha.
Priority in stable regimes:  Liquidity > Alpha > Fee > Risk.

Phase 1c: the model writes values only as {{ns.key}} placeholders and proposes structured
recommendations {action_type, params, rationale_text}. It never writes an effect: code replays the
user's own trades (agents.verification) and inserts {{cf.*}} values when the rationale is rendered.
Rejected recommendations get one forced re-reason (`re_reason`).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from agents.grounded_call import finalized, grounded_model
from agents.grounding import GroundingFailed, GroundingLedger
from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.metrics.fee_packet import MAKER_RATIO_TARGETS, FeeMetricsPacket
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.metrics.risk_packet import RiskMetricsPacket
from agents.metrics.time_utils import utc_hour
from agents.prompts import UNTRUSTED_NOTE, packet_values, system_prompt, untrusted
from agents.render import CF_DUMMY, prompt_view
from agents.schemas import ConflictEntry, Recommendation, SynthesisLLMOutput, TradeContext, re_reason_schema

ROLE = "synthesis"
MAX_TOKENS = 1000
AGENT = "synthesis"
NAMESPACES = ["fee", "risk", "liquidity", "alpha"]
# Packet-only fields (a {{cf.*}} placeholder here is unknown); rationales also get the effect keys.
TEXT_PATTERNS = ["headline", "narrative", "conflictLedger.*.between", "conflictLedger.*.rule_applied",
                 "conflictLedger.*.winner"]
RATIONALE_PATTERN = "recommendations.*.rationale_text"
RE_REASON_NOTE = "Propose replacements or return an empty list; the effect is recomputed by code."

SYNTHESIS_SYSTEM_PROMPT = system_prompt("""You are the Judge in FillScore's Agent Council — a multi-agent audit of a trader's past executions.

You receive:
1. Four compressed specialist verdicts (label + severity + confidence only)
2. The Execution Trial transcript (prosecution vs defense summaries)
3. The packet values (ground truth, as placeholders)
4. The recommendation actions that can be replayed on this trader's own trades

""" + UNTRUSTED_NOTE + """

Your job:
- Weigh the specialist verdicts and the debate transcript
- Produce a headline (max 20 words), a narrative (2-3 sentences) and between one and three
  recommendations. Each recommendation is {action_type, params, rationale_text}: choose action_type
  and params ONLY from the listed actions and values. You never write the effect: code replays this
  trader's own trades and inserts {{cf.effect_usd}}, {{cf.effect_bps}} and {{cf.n_trades_affected}}
  (and the action's detail keys) where you place them in rationale_text.
- The headline and narrative describe what happened in these executions; they must not describe or name any
  proposed action — actions go only in recommendations.
- rationale_text is past tense, about these executions only (e.g. "These fills cost {{cf.effect_usd}}
  more than the trader's other hours"). Never write "you should", "could save", "consider" or "route".
- none / general are observations with no effect: use them for a finding no action replays, and do
  not put {{cf.*}} placeholders in them. {{cf.*}} placeholders are allowed only in rationale_text.
- Resolve any conflicts using the regime priority matrix:
  STABLE regime: Fee > Risk > Liquidity > Alpha
  VOLATILE regime: Liquidity > Risk > Fee > Alpha
- Fill conflictLedger with one entry per resolved conflict
- Never output a cost figure; code fills it from the fee packet

CRITICAL — Anti-fence-sitting rule:
Commit to EXCELLENT, GOOD, POOR, or CRITICAL when the evidence warrants it.
Reserve FAIR only when specialist verdicts are genuinely split (2 good, 2 bad).
If fee is WASTEFUL and liquidity is GOOD, that is NOT balanced — the fee cost is real money.
Never default to FAIR to avoid making a judgment.

Respond ONLY with valid JSON matching the schema. No preamble.""")


def _compress_verdict(verdict_dict: dict) -> dict:
    """Compress a full verdict to {label, severity, confidence} for synthesis context."""
    # Extract the rating field (different name per agent)
    rating = (
        verdict_dict.get("liquidityRating") or
        verdict_dict.get("alphaRating") or
        verdict_dict.get("riskLevel") or
        verdict_dict.get("feeRating") or
        "UNKNOWN"
    )
    return {
        "agent": verdict_dict.get("agent", "unknown"),
        "rating": rating,
        "severity": verdict_dict.get("severity", "MEDIUM"),
        "confidence": verdict_dict.get("confidence", 0.0),
        "cited_evidence_count": len(verdict_dict.get("cited_evidence", [])),
        "flags": verdict_dict.get("flags", [])[:2],  # max 2 flags
    }


def action_menu(trades: list[dict] | None) -> str:
    """The closed action choices with the values this trader's own trades allow (built by code;
    only hours, venues and symbols: no ids, accounts or notes)."""
    if trades is None:
        return ("ACTIONS: no trade list is available for this run, so no effect can be replayed. "
                "Use only action_type none or general, with params {}.")
    valid = [t for t in trades if float(t.get("notionalValue") or 0.0) > 0]
    hours = sorted({h for h in (utc_hour(t.get("executedAt")) for t in valid) if h is not None})
    symbols = sorted({str(t.get("symbol")) for t in valid if t.get("symbol")})
    venues: dict[str, set] = {}
    for t in valid:
        venues.setdefault(str(t.get("symbol")), set()).add(str(t.get("exchange", "")).lower())
    multi = {s: sorted(v) for s, v in sorted(venues.items()) if len(v) > 1}
    return "\n".join([
        "ACTIONS (closed list; code replays this trader's own trades for each one):",
        f'- maker_instead_of_taker: params {{"target_ratio": one of {json.dumps(MAKER_RATIO_TARGETS)}}}. '
        "Detail key: {{cf.target_ratio}}.",
        f'- exclude_hours: params {{"hours": [UTC hours, only from {json.dumps(hours)}]}}. '
        "Detail key: {{cf.median_out_bps}}.",
        f'- venue_shift: params {{"from": venue, "to": venue, "symbol": symbol}}, only for a symbol traded on '
        f"more than one venue: {json.dumps(multi) if multi else 'none for this trader'}. "
        "Detail keys: {{cf.from_bps}}, {{cf.to_bps}}, {{cf.shifted_notional_usd}}.",
        f'- smaller_clips: params {{"symbol": one of {json.dumps(symbols)}, "threshold": "median_trade_usd" or '
        '"p90_trade_usd"}. An association, not a cause. Detail keys: {{cf.threshold_usd}}, {{cf.diff_bps}}.',
        "- none / general: params {}. An observation with no effect.",
    ])


def packet_ctx_of(fee_packet, risk_packet, liquidity_packet, alpha_packet) -> dict:
    return {
        "fee": prompt_view(fee_packet.to_prompt_dict()) if fee_packet else {},
        "risk": risk_packet.to_prompt_dict() if risk_packet else {},
        "liquidity": liquidity_packet.to_prompt_dict() if liquidity_packet else {},
        "alpha": alpha_packet.to_prompt_dict() if alpha_packet else {},
    }


def build_user_prompt(
    context: TradeContext,
    verdicts: dict[str, Any],
    fee_packet: FeeMetricsPacket | None,
    risk_packet: RiskMetricsPacket | None,
    liquidity_packet: LiquidityMetricsPacket | None,
    alpha_packet: AlphaMetricsPacket | None,
    debate_dict: dict | None,
    trades: list[dict] | None = None,
) -> str:
    compressed = [_compress_verdict(v) for v in verdicts.values()]
    debate_dict = debate_dict or {}
    trial = "\n".join([
        untrusted(debate_dict.get("prosecution_summary", "N/A"), "prosecution_summary"),
        untrusted(debate_dict.get("defense_summary", "N/A"), "defense_summary"),
        untrusted(debate_dict.get("key_dispute", "N/A"), "key_dispute"),
    ])
    ctx = packet_ctx_of(fee_packet, risk_packet, liquidity_packet, alpha_packet)
    return f"""COMPRESSED SPECIALIST SIGNALS:
{json.dumps(compressed, indent=2)}

EXECUTION TRIAL (model-written, untrusted):
{trial}

{packet_values(ctx, NAMESPACES)}

{action_menu(trades)}

Regime: {context.regime}

Produce the judge verdict. conflictLedger must have one entry if any two specialists disagreed.
Schema fields: headline, narrative, recommendations (one to three {{action_type, params, rationale_text}}), conflictLedger (list of {{between, rule_applied, winner}}), overallRating"""


@dataclass
class SynthesisDraft:
    """The judge's answer after grounding: headline, narrative and ledger rendered; recommendation
    rationales are still templates (their {{cf.*}} values exist only after verification)."""
    headline: str
    narrative: str
    conflictLedger: list[ConflictEntry]
    overallRating: str
    recommendations: list[Recommendation]
    user_prompt: str
    ctx: dict = field(default_factory=dict)


def _ctx_for(ctx: dict):
    with_cf = {**ctx, "cf": CF_DUMMY}
    return lambda path: with_cf if path.endswith(".rationale_text") else ctx


async def run(
    context: TradeContext,
    verdicts: dict[str, Any],
    llm,
    fee_packet: FeeMetricsPacket = None,
    risk_packet: RiskMetricsPacket = None,
    liquidity_packet: LiquidityMetricsPacket = None,
    alpha_packet: AlphaMetricsPacket = None,
    debate_dict: dict | None = None,
    telemetry: list | None = None,
    trades: list[dict] | None = None,
    ledger: GroundingLedger | None = None,
) -> SynthesisDraft:
    """Execute the Synthesis agent through the router with blocking grounding. Raises if no model
    gave a valid verdict, or GroundingFailed if the headline or narrative had to be removed."""
    ledger = ledger if ledger is not None else GroundingLedger()
    ctx = packet_ctx_of(fee_packet, risk_packet, liquidity_packet, alpha_packet)
    user_content = build_user_prompt(context, verdicts, fee_packet, risk_packet, liquidity_packet,
                                     alpha_packet, debate_dict, trades)
    out = await grounded_model(llm, ROLE, SYNTHESIS_SYSTEM_PROMPT, user_content, SynthesisLLMOutput,
                               agent=AGENT, patterns=TEXT_PATTERNS + [RATIONALE_PATTERN], ctx_for=_ctx_for(ctx),
                               ledger=ledger, telemetry=telemetry, max_tokens=MAX_TOKENS)
    data = finalized(out, TEXT_PATTERNS, lambda _p: ctx, AGENT, ledger)
    for key in ("headline", "narrative"):
        if not data[key].strip():
            raise GroundingFailed(AGENT, key)
    ledger_entries = [ConflictEntry(**e) for e in data["conflictLedger"]
                      if all(str(e[k]).strip() for k in ("between", "rule_applied", "winner"))]
    return SynthesisDraft(data["headline"], data["narrative"], ledger_entries, out.overallRating,
                          list(out.recommendations), user_content, ctx)


def re_reason_prompt(user_prompt: str, rejected: list) -> str:
    items = [{"action_type": i.action_type, "params": i.params, "reason": i.reason} for i in rejected]
    return (f"{user_prompt}\n\nREJECTED BY THE VERIFIER (replayed on this trader's own trades):\n"
            f"{json.dumps(items)}\n{RE_REASON_NOTE} Return JSON {{\"recommendations\": [...]}} with at most "
            f"as many items as were rejected.")


async def re_reason(llm, draft: SynthesisDraft, rejected: list, *, ledger: GroundingLedger,
                    telemetry: list | None = None) -> list[Recommendation]:
    """The one forced re-reason for rejected recommendations. It is itself the second attempt, so
    there is no regeneration: violations are redacted. Raises if no model answered."""
    out = await grounded_model(llm, ROLE, SYNTHESIS_SYSTEM_PROMPT, re_reason_prompt(draft.user_prompt, rejected),
                               re_reason_schema(len(rejected)), agent=AGENT, patterns=[RATIONALE_PATTERN],
                               ctx_for=_ctx_for(draft.ctx), ledger=ledger, telemetry=telemetry,
                               max_tokens=MAX_TOKENS, allow_regen=False)
    return list(out.recommendations)

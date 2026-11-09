"""Ablation arm: ONE LLM call instead of the 9-call Council (L2).

The model gets its OWN prompt (SINGLE_CALL_SYSTEM_PROMPT): the same packet values as {{placeholders}}, the same
action menu, the same writing/safety rules (agents.prompts.SYNTH_*, shared with the Council judge), the same
output schema SynthesisLLMOutput, and no mention of specialists, a debate or a conflict ledger. Its answer then
goes through the SAME grounding, verification gate, claim check and cost override as a Council run, so only the
reasoning structure differs. The verifier's forced re-reason (if a recommendation is rejected) is a further call
under the same single-call prompt, and is counted in n_calls.
"""
from __future__ import annotations

from agents import claims as claims_mod
from agents import synthesis
from agents.council import (RunCollector, _clock, enforce_claims, override_synthesis_cost, verify_draft,
                            _default_synthesis, _model_usage, _token_usage)
from agents.prompts import (SYNTH_COST_RULE, SYNTH_JSON_ONLY, SYNTH_WRITING_RULES, packet_values, system_prompt)
from agents.render import packet_ctx
from agents.schemas import SynthesisOutput, TradeContext
from agents.verification import summarise
from config.versions import SINGLE_PROMPT_VERSION
from observability import tracing

SINGLE_CALL_SYSTEM_PROMPT = system_prompt("""You write FillScore's single-pass audit of a trader's past executions.

You receive:
1. The packet values (ground truth, as placeholders)
2. The recommendation actions that can be replayed on this trader's own trades

Your job:
""" + SYNTH_WRITING_RULES + SYNTH_COST_RULE + """
CRITICAL — Anti-fence-sitting rule:
Commit to EXCELLENT, GOOD, POOR, or CRITICAL when the evidence warrants it.
Reserve FAIR only when the packet values are genuinely mixed.
Never default to FAIR to avoid making a judgment.

""" + SYNTH_JSON_ONLY)


def build_single_user_prompt(context: TradeContext, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
                             trades: list[dict] | None) -> str:
    ctx = synthesis.packet_ctx_of(fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt)
    return f"""{packet_values(ctx, synthesis.NAMESPACES)}

{synthesis.action_menu(trades)}

Produce the audit.
Schema fields: headline, narrative, recommendations (one to three {{action_type, params, rationale_text}}), overallRating"""


async def run_single_call(account_id: str, symbol: str, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt, llm,
                          trades: list[dict] | None) -> dict:
    try:
        return await _run_single_call(account_id, symbol, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt, llm, trades)
    finally:
        tracing.finish_run("error")   # idempotent: a no-op after the normal path's own finish_run


async def _run_single_call(account_id: str, symbol: str, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt, llm,
                           trades: list[dict] | None) -> dict:
    trace_id = tracing.start_run(account_id)
    start = _clock()
    context = TradeContext(userId=account_id, symbol=symbol, trade_count=fee_pkt.trade_count,
                           fee_packet_hash=fee_pkt.content_hash, risk_packet_hash=risk_pkt.content_hash,
                           liquidity_packet_hash=liquidity_pkt.content_hash, alpha_packet_hash=alpha_pkt.content_hash)
    run = RunCollector(llm=llm, ctx=packet_ctx(fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt, trades))
    reasons: list[str] = []
    try:
        draft = await synthesis.run(context, {}, llm, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
                                    debate_dict=None, telemetry=run.telemetry, trades=trades, ledger=run.ledger,
                                    system=SINGLE_CALL_SYSTEM_PROMPT,
                                    user_prompt=build_single_user_prompt(context, fee_pkt, risk_pkt, liquidity_pkt,
                                                                         alpha_pkt, trades))
    except Exception as exc:
        draft = None
        reasons.append(f"single call failed: {type(exc).__name__}")
    if draft is not None:
        findings, observations, verification = await verify_draft(run, draft, trades, symbol)
        headline, narrative, findings, observations, ledger_entries, claims = await enforce_claims(
            run, draft, findings, observations, verification)
        synth = SynthesisOutput(headline=headline, narrative=narrative, findings=findings,
                                observations=observations, conflictLedger=ledger_entries,
                                overallRating=draft.overallRating)
    else:
        synth, verification = _default_synthesis(), summarise([], None)
        claims = claims_mod.ClaimsLedger().to_dict()
    synth = override_synthesis_cost(synth, fee_pkt)
    degraded = draft is None
    if degraded:
        synth = synth.model_copy(update={"overallRating": None})
    tokens = sum(c.get("tokens", 0) for c in run.telemetry)
    tracing.finish_run("degraded" if degraded else "ok")
    return {
        "tradeContext": context.model_dump(mode="json"),
        "synthesis": synth.model_dump(mode="json"),
        "grounding": run.ledger.to_dict(degraded),
        "claims": claims,
        "verification": verification,
        "debate_transcript": {},
        "degraded": degraded,
        "degraded_reasons": reasons,
        "n_calls_ok": sum(1 for c in run.telemetry if c.get("outcome") == "ok"),
        "n_attempts": len(run.telemetry),
        "totalLatencyMs": round((_clock() - start) * 1000, 2),
        "llm_calls": list(run.telemetry),
        "trace_id": trace_id,
        "arm": "single_call",
        "prompt_version": SINGLE_PROMPT_VERSION,
        "route_config_hash": llm.config.hash,
        "modelUsage": _model_usage(run.telemetry),
        "tokenUsage": _token_usage(run.telemetry),
    }

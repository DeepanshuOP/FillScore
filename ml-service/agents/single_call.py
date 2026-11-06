"""Ablation arm: ONE LLM call instead of the 9-call Council (L2).

The model gets exactly what the synthesis agent gets (the same packet values as {{placeholders}}, the same
glossary and rules in SYNTHESIS_SYSTEM_PROMPT, the same action menu, the same output schema
SynthesisLLMOutput) but no specialist signals and no debate. Its answer then goes through the SAME
grounding, verification gate, claim check and cost override as a Council run, so only the reasoning
structure differs. The verifier's forced re-reason (if a recommendation is rejected) is a further call, as
in the Council, and is counted in n_calls.
"""
from __future__ import annotations

from agents import claims as claims_mod
from agents import synthesis
from agents.council import (RunCollector, _clock, enforce_claims, override_synthesis_cost, verify_draft,
                            _default_synthesis)
from agents.render import packet_ctx
from agents.schemas import SynthesisOutput, TradeContext
from agents.verification import summarise
from observability import tracing


async def run_single_call(account_id: str, symbol: str, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt, llm,
                          trades: list[dict] | None) -> dict:
    trace_id = tracing.start_run(account_id)
    start = _clock()
    context = TradeContext(userId=account_id, symbol=symbol, regime="STABLE", trade_count=fee_pkt.trade_count,
                           fee_packet_hash=fee_pkt.content_hash, risk_packet_hash=risk_pkt.content_hash,
                           liquidity_packet_hash=liquidity_pkt.content_hash, alpha_packet_hash=alpha_pkt.content_hash)
    run = RunCollector(llm=llm, ctx=packet_ctx(fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt))
    reasons: list[str] = []
    try:
        draft = await synthesis.run(context, {}, llm, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
                                    debate_dict=None, telemetry=run.telemetry, trades=trades, ledger=run.ledger)
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
        "tokenUsage": {"total_tokens": tokens},
        "llm_calls": list(run.telemetry),
        "trace_id": trace_id,
        "arm": "single_call",
    }

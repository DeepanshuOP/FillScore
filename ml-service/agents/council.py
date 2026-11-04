"""Agent Council — the one pipeline both endpoints run (Phase 1b.1).

Topology (LangGraph):
  START → parallel fanout [liquidity, alpha, risk, fee] → synthesis_node (debate + judge) → END

`run_council_pipeline` is the only implementation. `/ml/agents/council` returns its result and
`/ml/agents/council/stream` forwards the events it emits through `on_event`. In order it does:
specialists (each verdict gets deterministic coverage confidence straight away), the Execution
Trial debate, synthesis, the degraded rule (a degraded run is never graded), the counterfactual
verifier with one forced re-reason (1c.4), the deterministic cost override, token telemetry and
persistence.

Every LLM text field is grounded as it arrives (1c.3, agents.grounded_call): values only as
{{ns.key}} placeholders, one regeneration on a stray numeral, then sentence redaction. An
explanation emptied by redaction fails its agent, which degrades the run.

Models are chosen by the router (agents/llm_router.py, config/llm_routes.yaml). Once any step has
fallen back to a default the run is degraded, so the remaining LLM steps are skipped rather than
spending calls on a result that will not be graded.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Optional, TypedDict

from langgraph.graph import END, START, StateGraph

from agents import alpha_architect, fee_optimizer, liquidity_scout, risk_auditor, synthesis
from agents.confidence import inject_coverage_confidence
from agents.debate import MAX_ROUNDS, run_debate, transcript_to_dict
from agents.grounding import GroundingFailed, GroundingLedger, finalize
from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.metrics.fee_packet import FeeMetricsPacket
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.metrics.risk_packet import RiskMetricsPacket
from agents.schemas import (
    AlphaVerdict,
    CouncilResult,
    FeeVerdict,
    LiquidityVerdict,
    RiskVerdict,
    Finding,
    Observation,
    SynthesisOutput,
    TradeContext,
)
from agents.render import packet_ctx, prompt_view
from agents.verification import GateItem, evaluate, mark_contradictions, run_gate, summarise

EventSink = Optional[Callable[[str, dict], Awaitable[None]]]

_clock = time.perf_counter


# ---------------------------------------------------------------------------
# Default verdicts for graceful failure handling (always flagged; the run is then degraded)
# ---------------------------------------------------------------------------

def _default_liquidity() -> LiquidityVerdict:
    return LiquidityVerdict(
        agent="liquidity_scout",
        liquidityRating="MODERATE",
        slippageRoot="Agent unavailable",
        cited_evidence=[],
        severity="MEDIUM",
        confidence=0.0,
        flags=["agent_failed"],
    )


def _default_alpha() -> AlphaVerdict:
    return AlphaVerdict(
        agent="alpha_architect",
        alphaRating="NEUTRAL",
        bestAlternative="Agent unavailable",
        cited_evidence=[],
        severity="MEDIUM",
        confidence=0.0,
        flags=["agent_failed"],
    )


def _default_risk() -> RiskVerdict:
    return RiskVerdict(
        agent="risk_auditor",
        riskLevel="MEDIUM",
        cited_evidence=[],
        severity="MEDIUM",
        confidence=0.0,
        flags=["agent_failed"],
    )


def _default_fee() -> FeeVerdict:
    return FeeVerdict(
        agent="fee_optimizer",
        feeRating="MODERATE",
        recommendedAction="Agent unavailable",
        cited_evidence=[],
        severity="MEDIUM",
        confidence=0.0,
        flags=["agent_failed"],
    )


def _default_synthesis(context: TradeContext | None = None) -> SynthesisOutput:
    """No grade, no findings: an incomplete run is never graded (F-06)."""
    return SynthesisOutput(
        headline="Analysis incomplete",
        narrative="Part of the Council could not finish this run, so no overall grade was given.",
        findings=[],
        observations=[],
        conflictLedger=[],
        overallRating=None,
        estimatedMonthlyCostUSD=0.0,
    )


# (agent name, state key, packet key, module, default factory, rating field)
SPECIALISTS = (
    ("liquidity_scout", "liquidity", "liquidity_packet", liquidity_scout, _default_liquidity, "liquidityRating"),
    ("alpha_architect", "alpha", "alpha_packet", alpha_architect, _default_alpha, "alphaRating"),
    ("risk_auditor", "risk", "risk_packet", risk_auditor, _default_risk, "riskLevel"),
    ("fee_optimizer", "fee", "fee_packet", fee_optimizer, _default_fee, "feeRating"),
)


def expected_calls() -> int:
    """LLM calls a complete run makes: 4 specialists + 2 turns per debate round + 1 synthesis = 9."""
    return len(SPECIALISTS) + 2 * MAX_ROUNDS + 1


def _failure_reason(exc: BaseException) -> str:
    from agents.llm_router import RouterExhausted

    if isinstance(exc, GroundingFailed):
        return "its explanation had to be removed by the number check"
    if isinstance(exc, RouterExhausted):
        return {
            "budget": "the daily AI budget was used up",
            "no_provider": "no AI provider is configured",
        }.get(exc.reason, "no model returned a valid answer")
    return "an unexpected error"


# ---------------------------------------------------------------------------
# Per-run collector (shared by the parallel nodes) and event helpers
# ---------------------------------------------------------------------------

@dataclass
class RunCollector:
    llm: Any
    emit: EventSink = None
    telemetry: list = field(default_factory=list)
    reasons: list = field(default_factory=list)
    ok_calls: list = field(default_factory=list)
    ledger: GroundingLedger = field(default_factory=GroundingLedger)
    ctx: dict = field(default_factory=dict)          # packet values for rendering (agents.render)

    async def event(self, name: str, data: dict) -> None:
        if self.emit is not None:
            await self.emit(name, data)


def agent_summary(agent: str, verdict) -> dict:
    """The agent_done payload: labels plus the deterministic coverage confidence."""
    d = verdict.model_dump()
    rating_field = next(s[5] for s in SPECIALISTS if s[0] == agent)
    return {
        "agent": agent,
        "rating": d.get(rating_field, "UNKNOWN"),
        "confidence": d.get("confidence", 0.0),
        "severity": d.get("severity", "MEDIUM"),
        "cited_evidence_count": len(d.get("cited_evidence", [])),
        "flags": d.get("flags", []),
        "failed": "agent_failed" in d.get("flags", []),
    }


def _with_coverage_confidence(verdict, packet_dict: dict):
    updated = inject_coverage_confidence(
        verdict.model_dump(), verdict.cited_evidence, packet_dict, llm_self_confidence=verdict.confidence,
    )
    return verdict.model_copy(update={
        "confidence": updated["confidence"],
        "llm_self_confidence": updated["llm_self_confidence"],
        "evidence_coverage_detail": updated["evidence_coverage_detail"],
    })


def _skipped_debate_dict(why: str) -> dict:
    return {
        "round_count": 0,
        "prosecution_summary": why,
        "defense_summary": why,
        "key_dispute": why,
        "debate_latency_ms": 0.0,
        "turns_expected": 2 * MAX_ROUNDS,
        "turns_ok": 0,
        "failed_turns": [],
        "claims": [],
    }


# ---------------------------------------------------------------------------
# LangGraph state and nodes
# ---------------------------------------------------------------------------

class CouncilState(TypedDict, total=False):
    context: TradeContext
    run: RunCollector
    fee_packet: FeeMetricsPacket
    risk_packet: RiskMetricsPacket
    liquidity_packet: LiquidityMetricsPacket
    alpha_packet: AlphaMetricsPacket
    liquidity: LiquidityVerdict
    alpha: AlphaVerdict
    risk: RiskVerdict
    fee: FeeVerdict
    trades: Optional[list]
    draft: Optional[synthesis.SynthesisDraft]
    debate_dict: dict


def _specialist_node(agent: str, state_key: str, packet_key: str, module, default_factory):
    async def node(state: CouncilState) -> dict:
        run: RunCollector = state["run"]
        packet = state[packet_key]
        await run.event("agent_start", {"agent": agent})
        try:
            verdict = await module.run(state["context"], run.llm, packet, telemetry=run.telemetry,
                                       ctx=run.ctx, ledger=run.ledger)
            run.ok_calls.append(agent)
        except GroundingFailed as exc:
            print(f"[{agent}] failed: {type(exc).__name__}")
            verdict = default_factory()
            run.reasons.append(f"{agent}: {_failure_reason(exc)}")
        except Exception as exc:
            print(f"[{agent}] failed: {type(exc).__name__}")
            verdict = default_factory()
            run.reasons.append(f"{agent}: fell back to a default verdict because {_failure_reason(exc)}")
        verdict = _with_coverage_confidence(verdict, packet.to_prompt_dict())
        await run.event("agent_done", agent_summary(agent, verdict))
        return {state_key: verdict}

    node.__name__ = f"{agent}_node"
    return node


async def synthesis_node(state: CouncilState) -> dict:
    """The Execution Trial debate, then the Synthesis judge. Skipped once the run is degraded."""
    run: RunCollector = state["run"]

    if run.reasons:
        run.reasons.append("debate and synthesis: skipped because a specialist failed")
        return {"draft": None, "debate_dict": _skipped_debate_dict("Not run")}

    packets = {k: prompt_view(state[k].to_prompt_dict()) for k in ("liquidity_packet", "risk_packet", "fee_packet", "alpha_packet")}

    await run.event("debate_started", {"message": "Execution Trial in progress", "max_rounds": MAX_ROUNDS})
    transcript = await run_debate(
        liquidity_packet=packets["liquidity_packet"],
        risk_packet=packets["risk_packet"],
        fee_packet=packets["fee_packet"],
        alpha_packet=packets["alpha_packet"],
        llm=run.llm,
        telemetry=run.telemetry,
        ledger=run.ledger,
    )
    debate_dict = transcript_to_dict(transcript)
    run.ok_calls.extend(["debate"] * transcript.turns_ok)
    if transcript.failed_turns:
        run.reasons.append("debate: " + ", ".join(transcript.failed_turns) + " failed, so the debate stopped")
    await run.event("debate_done", {
        "round_count": debate_dict["round_count"],
        "prosecution_summary": debate_dict["prosecution_summary"],
        "defense_summary": debate_dict["defense_summary"],
        "key_dispute": debate_dict["key_dispute"],
        "claim_count": len(debate_dict["claims"]),
        "turns_ok": debate_dict["turns_ok"],
        "turns_expected": debate_dict["turns_expected"],
    })

    if run.reasons:
        run.reasons.append("synthesis: skipped because the debate failed")
        return {"draft": None, "debate_dict": debate_dict}

    verdicts = {s[0]: state[s[1]].model_dump() for s in SPECIALISTS}
    await run.event("agent_start", {"agent": "synthesis"})
    try:
        draft = await synthesis.run(
            state["context"], verdicts, run.llm,
            state["fee_packet"], state["risk_packet"], state["liquidity_packet"], state["alpha_packet"],
            debate_dict=debate_dict,
            telemetry=run.telemetry,
            trades=state.get("trades"),
            ledger=run.ledger,
        )
        run.ok_calls.append("synthesis")
    except GroundingFailed as exc:
        print(f"[synthesis] failed: {type(exc).__name__}")
        draft = None
        run.reasons.append(f"synthesis: {_failure_reason(exc)}")
    except Exception as exc:
        print(f"[synthesis] failed: {type(exc).__name__}")
        draft = None
        run.reasons.append(f"synthesis: fell back to a default because {_failure_reason(exc)}")
    return {"draft": draft, "debate_dict": debate_dict}


def _build_graph() -> StateGraph:
    graph = StateGraph(CouncilState)
    for agent, state_key, packet_key, module, default_factory, _ in SPECIALISTS:
        name = f"{agent}_node"
        graph.add_node(name, _specialist_node(agent, state_key, packet_key, module, default_factory))
        graph.add_edge(START, name)
        graph.add_edge(name, "synthesis_node")
    graph.add_node("synthesis_node", synthesis_node)
    graph.add_edge("synthesis_node", END)
    return graph


_compiled_graph = _build_graph().compile()


# ---------------------------------------------------------------------------
# Deterministic post-processing
# ---------------------------------------------------------------------------

def override_synthesis_cost(synthesis, fee_pkt):
    """The cost shown to users is always the fee packet's total, never the model's number."""
    return synthesis.model_copy(update={"estimatedMonthlyCostUSD": fee_pkt.total_fee_paid_usd})


def _gate(recs, trades: list[dict] | None, symbol: str) -> list[GateItem]:
    """run_gate, except that without a trade list no effect can be replayed: every non-observation
    is rejected as not computable."""
    if trades is not None:
        return run_gate(recs, trades, symbol)
    items = [evaluate(r, [], symbol) for r in recs]
    for it in items:
        if it.status != "observation":
            it.status, it.reason, it.cf = "rejected", "not_computable:no_trades", None
    return items


def _finding(item: GateItem, ctx: dict, ledger: GroundingLedger) -> Finding:
    """A passed item: the rationale rendered with the recomputed effect (a text emptied by the
    number check falls back to the deterministic method string)."""
    cf = item.cf
    cf_ctx = {"effect_usd": cf.effect_usd, "effect_bps": cf.effect_bps,
              "n_trades_affected": cf.n_trades_affected, **cf.details}
    text = finalize(item.rationale_text, {**ctx, "cf": cf_ctx}, "synthesis", "finding", ledger)
    return Finding(action_type=item.action_type, params=item.params, text=text or cf.method,
                   effect_usd=cf.effect_usd, effect_bps=cf.effect_bps,
                   n_trades_affected=cf.n_trades_affected, method=cf.method, verified=True)


async def verify_draft(run: RunCollector, draft, trades: list[dict] | None, symbol: str):
    """1c.4: gate the draft's recommendations on the user's own trades, give rejected ones ONE forced
    re-reason, gate the replacements, drop what fails again. Returns (findings, observations,
    verification). A failed re-reason call drops the rejected items; it never degrades the run."""
    round1 = _gate(draft.recommendations, trades, symbol)
    rejected = [it for it in round1 if it.status == "rejected"]
    round2 = None
    re_reason_failed = False
    if rejected:
        try:
            replacements = await synthesis.re_reason(run.llm, draft, rejected, ledger=run.ledger,
                                                     telemetry=run.telemetry)
            round2 = _gate(replacements, trades, symbol)
            mark_contradictions(round1 + round2)
        except Exception as exc:
            print(f"[re-reason] failed: {type(exc).__name__}")
            re_reason_failed = True
    items = round1 + (round2 or [])
    for it in items:   # unvalidated params are model-written: never shown or stored
        if it.reason == "invalid_params":
            it.params = {}
    verification = summarise(round1, round2)
    if re_reason_failed:
        verification["re_reason_failed"] = True
    findings = [_finding(it, run.ctx, run.ledger) for it in items if it.status == "passed"]
    observations = []
    for it in items:
        if it.status == "observation":
            text = finalize(it.rationale_text, run.ctx, "synthesis", "observation", run.ledger)
            if text:
                observations.append(Observation(action_type=it.action_type, text=text))
    return findings, observations, verification


def _model_usage(telemetry: list[dict]) -> dict:
    def used(role: str) -> str:
        labels = []
        for t in telemetry:
            label = f"{t['provider']}/{t['model']}"
            if t.get("role") == role and t.get("outcome") == "ok" and label not in labels:
                labels.append(label)
        return ", ".join(labels) or "none"

    return {"specialists_model": used("specialist"), "debate_model": used("debate"), "synthesis_model": used("synthesis")}


def _token_usage(telemetry: list[dict]) -> dict:
    """Totals over every reply received (a reply that failed validation still used tokens)."""
    from agents.llm_client import rollup_token_usage

    replies = [t for t in telemetry if t.get("tokens")]
    return rollup_token_usage([
        {
            "prompt_tokens": t.get("prompt_tokens", 0),
            "completion_tokens": t.get("completion_tokens", 0),
            "total_tokens": t.get("tokens", 0),
        }
        for t in replies
    ])


def result_events(result: CouncilResult) -> list[tuple[str, dict]]:
    """The events a client needs to render a finished result (used to replay cached runs)."""
    events: list[tuple[str, dict]] = []
    for agent, state_key, *_ in SPECIALISTS:
        events.append(("agent_done", agent_summary(agent, getattr(result, state_key))))
    d = result.debate_transcript or {}
    if d:
        events.append(("debate_done", {
            "round_count": d.get("round_count", 0),
            "prosecution_summary": d.get("prosecution_summary", ""),
            "defense_summary": d.get("defense_summary", ""),
            "key_dispute": d.get("key_dispute", ""),
            "claim_count": len(d.get("claims", [])),
            "turns_ok": d.get("turns_ok", 0),
            "turns_expected": d.get("turns_expected", 2 * MAX_ROUNDS),
        }))
    events.append(("synthesis_done", synthesis_event(result.synthesis, result.degraded, result.degraded_reasons)))
    events.append(("gate_done", {"verification": result.verification, "grounding": result.grounding}))
    events.append(("complete", result.model_dump(mode="json")))
    return events


def synthesis_event(synth: SynthesisOutput, degraded: bool, reasons: list[str]) -> dict:
    return {
        "headline": synth.headline,
        "overallRating": synth.overallRating,
        "findings": [f.model_dump(mode="json") for f in synth.findings],
        "observations": [o.model_dump(mode="json") for o in synth.observations],
        "estimatedMonthlyCostUSD": synth.estimatedMonthlyCostUSD,
        "degraded": degraded,
        "degraded_reasons": reasons,
    }


# ---------------------------------------------------------------------------
# The pipeline
# ---------------------------------------------------------------------------

async def run_council_pipeline(
    account_id: str,
    user_id: str,
    symbol: str,
    fee_pkt: FeeMetricsPacket,
    risk_pkt: RiskMetricsPacket,
    liquidity_pkt: LiquidityMetricsPacket,
    alpha_pkt: AlphaMetricsPacket,
    llm=None,
    on_event: EventSink = None,
    persist: bool = True,
    trades: list[dict] | None = None,
) -> CouncilResult:
    """Run the whole Council on prepared packets. Both HTTP endpoints, the eval harness and the
    demo-run generator go through here. `trades` are the normalised trades the packets were built
    from; the verifier replays them (None: every effect is rejected as not computable)."""
    from agents import llm_router
    from agents.persistence import save_council_run
    from config.versions import METRICS_VERSION, PROMPT_VERSION

    llm = llm or llm_router.get_default_router()
    context = TradeContext(
        userId=user_id,
        symbol=symbol,
        regime="STABLE",  # placeholder until HMM; disclose in paper
        fee_packet_hash=fee_pkt.content_hash,
        risk_packet_hash=risk_pkt.content_hash,
        liquidity_packet_hash=liquidity_pkt.content_hash,
        alpha_packet_hash=alpha_pkt.content_hash,
    )
    run = RunCollector(llm=llm, emit=on_event, ctx=packet_ctx(fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt))
    start = _clock()

    final_state = await _compiled_graph.ainvoke({
        "context": context,
        "run": run,
        "fee_packet": fee_pkt,
        "risk_packet": risk_pkt,
        "liquidity_packet": liquidity_pkt,
        "alpha_packet": alpha_pkt,
        "trades": trades,
    })

    liquidity_v, alpha_v = final_state["liquidity"], final_state["alpha"]
    risk_v, fee_v = final_state["risk"], final_state["fee"]

    # ── degraded rule (F-06) ──
    n_expected = expected_calls()
    n_ok = len(run.ok_calls)
    reasons = list(run.reasons)
    if n_ok < n_expected and not reasons:
        reasons.append(f"only {n_ok} of {n_expected} model calls succeeded")
    degraded = bool(reasons) or n_ok < n_expected

    # ── verification (1c.4), then the deterministic cost override (F-03) ──
    draft = final_state.get("draft")
    if draft is not None and not degraded:
        findings, observations, verification = await verify_draft(run, draft, trades, symbol)
        synth = SynthesisOutput(headline=draft.headline, narrative=draft.narrative, findings=findings,
                                observations=observations, conflictLedger=draft.conflictLedger,
                                overallRating=draft.overallRating)
    else:
        synth, verification = _default_synthesis(), summarise([], None)
    synth = override_synthesis_cost(synth, fee_pkt)
    if degraded:
        synth = synth.model_copy(update={"overallRating": None})
    grounding = run.ledger.to_dict(degraded)
    await run.event("synthesis_done", synthesis_event(synth, degraded, reasons))
    await run.event("gate_done", {"verification": verification, "grounding": grounding})

    elapsed_ms = (_clock() - start) * 1000
    result = CouncilResult(
        tradeContext=context,
        liquidity=liquidity_v,
        alpha=alpha_v,
        risk=risk_v,
        fee=fee_v,
        synthesis=synth,
        grounding=grounding,
        verification=verification,
        debate_transcript=final_state.get("debate_dict", {}),
        totalLatencyMs=round(elapsed_ms, 2),
        modelUsage=_model_usage(run.telemetry),
        tokenUsage=_token_usage(run.telemetry),
        degraded=degraded,
        degraded_reasons=reasons,
        n_calls_expected=n_expected,
        n_calls_ok=n_ok,
        cached=False,
        llm_calls=list(run.telemetry),
        prompt_version=PROMPT_VERSION,
        metrics_version=METRICS_VERSION,
        route_config_hash=llm.config.hash,
    )

    # ── persistence ──
    if persist:
        try:
            result.run_id = await save_council_run(
                account_id=account_id,
                user_id=user_id,
                symbol=symbol,
                council_result_dict=result.model_dump(mode="json"),
                grounding=grounding,
                verification=verification,
                packet_hashes={
                    "fee": fee_pkt.content_hash,
                    "risk": risk_pkt.content_hash,
                    "liquidity": liquidity_pkt.content_hash,
                    "alpha": alpha_pkt.content_hash,
                },
                model_usage=result.modelUsage,
                total_latency_ms=result.totalLatencyMs,
                prompt_version=PROMPT_VERSION,
                extra={
                    "degraded": degraded,
                    "degraded_reasons": reasons,
                    "n_calls_expected": n_expected,
                    "n_calls_ok": n_ok,
                    "metrics_version": METRICS_VERSION,
                    "route_config_hash": llm.config.hash,
                    "llm_calls": list(run.telemetry),
                    # LLM self-reported confidence, kept for calibration analysis only
                    "llm_self_confidence": {
                        s[0]: final_state[s[1]].llm_self_confidence for s in SPECIALISTS
                    },
                },
            )
        except Exception as e:
            print(f"[persistence] Failed to save run: {type(e).__name__}")
            result.run_id = None

    await run.event("complete", result.model_dump(mode="json"))
    return result


async def load_packets(user_id: str, symbol: str):
    """((fee, risk, liquidity, alpha), trades) from one DB read; symbol "ALL" = every symbol."""
    from agents.metrics import loader

    return await loader.load_run_inputs(user_id, symbol)


async def run_council(account_id: str, user_id: str, symbol: str, llm=None, on_event: EventSink = None) -> CouncilResult:
    """Load the packets and trades for an account, then run the pipeline."""
    (fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt), trades = await load_packets(user_id, symbol)
    return await run_council_pipeline(account_id, user_id, symbol, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
                                      llm=llm, on_event=on_event, trades=trades)


async def run_council_with_packets(
    account_id: str,
    user_id: str,
    symbol: str,
    fee_pkt,
    risk_pkt,
    liquidity_pkt,
    alpha_pkt,
    llm=None,
    trades: list[dict] | None = None,
) -> CouncilResult:
    """Run the pipeline on pre-built packets and the trades they came from (eval harness)."""
    return await run_council_pipeline(account_id, user_id, symbol, fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt,
                                      llm=llm, trades=trades)

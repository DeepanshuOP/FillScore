"""Agent Council — LangGraph StateGraph wiring for parallel specialist execution.

Topology:
  START → parallel fanout [liquidity, alpha, risk, fee] → synthesis → END

Each specialist uses claude-haiku-4-5 (fast extraction).
Synthesis uses claude-sonnet-4-6 (nuanced reasoning).
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from agents import alpha_architect, fee_optimizer, liquidity_scout, risk_auditor, synthesis
from agents.grounding import check_all_verdicts, summarise_grounding
from agents.schemas import (
    AlphaVerdict,
    CouncilResult,
    FeeVerdict,
    LiquidityVerdict,
    RiskVerdict,
    SynthesisOutput,
    TradeContext,
)
from agents.metrics.fee_packet import FeeMetricsPacket
from agents.metrics.risk_packet import RiskMetricsPacket
from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.metrics.loader import load_all_packets, load_all_packets_for_user

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Default verdicts for graceful failure handling
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


def _default_synthesis(context: TradeContext) -> SynthesisOutput:
    return SynthesisOutput(
        headline="Synthesis unavailable — using fallback assessment",
        narrative="One or more agents failed. This is a conservative fallback.",
        topRecommendations=[
            "Review execution data manually",
            "Retry analysis when agents are available",
            "Check API key and network connectivity",
        ],
        conflictLedger=[],
        overallRating="FAIR",
        estimatedMonthlyCostUSD=0.0,
    )


# ---------------------------------------------------------------------------
# LangGraph state
# ---------------------------------------------------------------------------

class CouncilState(TypedDict, total=False):
    context: TradeContext
    specialist_client: Any
    synthesis_client: Any
    fee_packet: FeeMetricsPacket
    risk_packet: RiskMetricsPacket
    liquidity_packet: LiquidityMetricsPacket
    alpha_packet: AlphaMetricsPacket
    liquidity: LiquidityVerdict
    alpha: AlphaVerdict
    risk: RiskVerdict
    fee: FeeVerdict
    synthesis: SynthesisOutput
    debate_dict: dict
    model_usage: dict


# ---------------------------------------------------------------------------
# Node functions
# ---------------------------------------------------------------------------

async def liquidity_scout_node(state: CouncilState) -> dict:
    """Run the Liquidity Scout specialist."""
    try:
        verdict = await liquidity_scout.run(state["context"], state["specialist_client"], state["liquidity_packet"])
    except Exception as exc:
        import traceback
        print(f"[Liquidity Scout] failed: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        verdict = _default_liquidity()
    return {"liquidity": verdict}


async def alpha_architect_node(state: CouncilState) -> dict:
    """Run the Alpha Architect specialist."""
    try:
        verdict = await alpha_architect.run(state["context"], state["specialist_client"], state["alpha_packet"])
    except Exception as exc:
        import traceback
        print(f"[Alpha Architect] failed: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        verdict = _default_alpha()
    return {"alpha": verdict}


async def risk_auditor_node(state: CouncilState) -> dict:
    """Run the Risk Auditor specialist."""
    try:
        verdict = await risk_auditor.run(state["context"], state["specialist_client"], state["risk_packet"])
    except Exception as exc:
        import traceback
        print(f"[Risk Auditor] failed: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        verdict = _default_risk()
    return {"risk": verdict}


async def fee_optimizer_node(state: CouncilState) -> dict:
    """Run the Fee Optimizer specialist."""
    try:
        verdict = await fee_optimizer.run(state["context"], state["specialist_client"], state["fee_packet"])
    except Exception as exc:
        import traceback
        print(f"[Fee Optimizer] failed: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        verdict = _default_fee()
    return {"fee": verdict}

async def synthesis_node(state: CouncilState) -> dict:
    """Run the Execution Trial debate, then the Synthesis agent (judge)."""
    from agents.confidence import inject_coverage_confidence

    packets_by_agent = {
        "liquidity_scout": state["liquidity_packet"].to_prompt_dict(),
        "alpha_architect": state["alpha_packet"].to_prompt_dict(),
        "risk_auditor": state["risk_packet"].to_prompt_dict(),
        "fee_optimizer": state["fee_packet"].to_prompt_dict(),
    }

    for agent_name, verdict in [
        ("liquidity_scout", state["liquidity"]),
        ("alpha_architect", state["alpha"]),
        ("risk_auditor", state["risk"]),
        ("fee_optimizer", state["fee"]),
    ]:
        llm_conf = verdict.confidence
        updated = inject_coverage_confidence(
            verdict.model_dump(),
            verdict.cited_evidence,
            packets_by_agent[agent_name],
            llm_self_confidence=llm_conf,
        )
        verdict.confidence = updated["confidence"]
        verdict.llm_self_confidence = updated["llm_self_confidence"]
        verdict.evidence_coverage_detail = updated["evidence_coverage_detail"]

    verdicts = {
        "liquidity_scout": state["liquidity"].model_dump(),
        "alpha_architect": state["alpha"].model_dump(),
        "risk_auditor": state["risk"].model_dump(),
        "fee_optimizer": state["fee"].model_dump(),
    }

    # ── Execution Trial debate (before synthesis) ──────────────────────
    from agents.debate import run_debate, transcript_to_dict
    debate_dict = {}
    try:
        debate_transcript = await run_debate(
            liquidity_packet=state["liquidity_packet"].to_prompt_dict(),
            risk_packet=state["risk_packet"].to_prompt_dict(),
            fee_packet=state["fee_packet"].to_prompt_dict(),
            alpha_packet=state["alpha_packet"].to_prompt_dict(),
            groq_client=state["specialist_client"],
        )
        debate_dict = transcript_to_dict(debate_transcript)
    except Exception as exc:
        print(f"[Debate] failed: {type(exc).__name__}: {exc}")

    # ── Synthesis (judge reads debate transcript) ──────────────────────
    try:
        result = await synthesis.run(
            state["context"],
            verdicts,
            state["synthesis_client"],
            state["fee_packet"],
            state["risk_packet"],
            state["liquidity_packet"],
            state["alpha_packet"],
            debate_dict=debate_dict,
        )
    except Exception as exc:
        import traceback
        print(f"[Synthesis] failed: {type(exc).__name__}: {exc}")
        traceback.print_exc()
        result = _default_synthesis(state["context"])
    return {"synthesis": result, "debate_dict": debate_dict}


# ---------------------------------------------------------------------------
# Build the StateGraph
# ---------------------------------------------------------------------------

def _build_graph() -> StateGraph:
    """Construct the Agent Council LangGraph with parallel fanout."""
    graph = StateGraph(CouncilState)

    graph.add_node("liquidity_scout_node", liquidity_scout_node)
    graph.add_node("alpha_architect_node", alpha_architect_node)
    graph.add_node("risk_auditor_node", risk_auditor_node)
    graph.add_node("fee_optimizer_node", fee_optimizer_node)
    graph.add_node("synthesis_node", synthesis_node)

    # Parallel execution
    graph.add_edge(START, "liquidity_scout_node")
    graph.add_edge(START, "alpha_architect_node")
    graph.add_edge(START, "risk_auditor_node")
    graph.add_edge(START, "fee_optimizer_node")

    graph.add_edge("liquidity_scout_node", "synthesis_node")
    graph.add_edge("alpha_architect_node", "synthesis_node")
    graph.add_edge("risk_auditor_node", "synthesis_node")
    graph.add_edge("fee_optimizer_node", "synthesis_node")

    # Synthesis → END
    graph.add_edge("synthesis_node", END)

    return graph


_compiled_graph = _build_graph().compile()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def run_council(user_id: str, symbol: str) -> CouncilResult:
    """Execute the full Agent Council pipeline and return a CouncilResult."""
    from agents.llm_client import get_groq_client, get_openrouter_client, SYNTHESIS_PROVIDER, SPECIALIST_MODEL, SYNTHESIS_MODEL
    
    # Load packets first — this is the ground truth for all agent verdicts
    if symbol == "ALL":
        fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt = await load_all_packets_for_user(user_id)
    else:
        fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt = await load_all_packets(user_id, symbol)

    context = TradeContext(
        userId=user_id,
        symbol=symbol,
        regime="STABLE",  # placeholder until HMM; disclose in paper
        fee_packet_hash=fee_pkt.content_hash,
        risk_packet_hash=risk_pkt.content_hash,
        liquidity_packet_hash=liquidity_pkt.content_hash,
        alpha_packet_hash=alpha_pkt.content_hash,
    )

    specialist_client = get_groq_client()
    synthesis_client = get_groq_client() if SYNTHESIS_PROVIDER == "groq" else get_openrouter_client()
    start = time.time()

    initial_state: CouncilState = {
        "context": context,
        "specialist_client": specialist_client,
        "synthesis_client": synthesis_client,
        "fee_packet": fee_pkt,
        "risk_packet": risk_pkt,
        "liquidity_packet": liquidity_pkt,
        "alpha_packet": alpha_pkt,
    }

    final_state = await _compiled_graph.ainvoke(initial_state)

    elapsed_ms = (time.time() - start) * 1000

    liquidity_verdict = final_state["liquidity"]
    alpha_verdict = final_state["alpha"]
    risk_verdict = final_state["risk"]
    fee_verdict = final_state["fee"]

    liquidity_pkt = final_state["liquidity_packet"]
    alpha_pkt = final_state["alpha_packet"]
    risk_pkt = final_state["risk_packet"]
    fee_pkt = final_state["fee_packet"]

    grounding_reports = check_all_verdicts(
        liquidity_cited=liquidity_verdict.cited_evidence,
        liquidity_reasoning=liquidity_verdict.slippageRoot,
        liquidity_packet=liquidity_pkt.to_prompt_dict(),
        alpha_cited=alpha_verdict.cited_evidence,
        alpha_reasoning=alpha_verdict.bestAlternative,
        alpha_packet=alpha_pkt.to_prompt_dict(),
        risk_cited=risk_verdict.cited_evidence,
        risk_reasoning=" ".join(risk_verdict.flags),
        risk_packet=risk_pkt.to_prompt_dict(),
        fee_cited=fee_verdict.cited_evidence,
        fee_reasoning=fee_verdict.recommendedAction,
        fee_packet=fee_pkt.to_prompt_dict(),
    )
    grounding_summary = summarise_grounding(grounding_reports)

    from agents.verification import verify_recommendations, gate_report_to_dict
    gate_report = verify_recommendations(
        recommendations=final_state["synthesis"].topRecommendations,
        fee_packet=fee_pkt.to_prompt_dict(),
        risk_packet=risk_pkt.to_prompt_dict(),
        liquidity_packet=liquidity_pkt.to_prompt_dict(),
        alpha_packet=alpha_pkt.to_prompt_dict(),
    )
    gate_dict = gate_report_to_dict(gate_report)

    from agents.persistence import save_council_run

    result = CouncilResult(
        tradeContext=context,
        liquidity=liquidity_verdict,
        alpha=alpha_verdict,
        risk=risk_verdict,
        fee=fee_verdict,
        synthesis=final_state["synthesis"],
        grounding_report=grounding_summary,
        gate_report=gate_dict,
        debate_transcript=final_state.get("debate_dict", {}),
        totalLatencyMs=round(elapsed_ms, 2),
        modelUsage={
            "specialists_model": f"{SPECIALIST_MODEL} (Groq)",
            "synthesis_model": f"{SYNTHESIS_MODEL} ({SYNTHESIS_PROVIDER})",
        },
    )

    try:
        run_id = await save_council_run(
            user_id=user_id,
            symbol=symbol,
            council_result_dict=result.model_dump(),
            grounding_summary=grounding_summary,
            packet_hashes={
                "fee": fee_pkt.content_hash,
                "risk": risk_pkt.content_hash,
                "liquidity": liquidity_pkt.content_hash,
                "alpha": alpha_pkt.content_hash,
            },
            model_usage=result.modelUsage,
            total_latency_ms=result.totalLatencyMs,
        )
        result.run_id = run_id
    except Exception as e:
        print(f"[persistence] Failed to save run: {e}")
        result.run_id = None

    return result

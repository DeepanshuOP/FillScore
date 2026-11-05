"""Liquidity Scout — specialist agent for slippage & liquidity analysis.

Audits past executions from the deterministic LiquidityMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

from agents.metrics.liquidity_packet import LiquidityMetricsPacket
from agents.grounded_call import grounded_verdict
from agents.prompts import packet_values, system_prompt
from agents.schemas import TradeContext, LiquidityVerdict

ROLE = "specialist"
MAX_TOKENS = 500
NAMESPACE = "liquidity"
TEXT_FIELD = "slippageRoot"   # the explanation; emptied by redaction -> code-built fallback sentence

SYSTEM_PROMPT = system_prompt(
    "You are FillScore's Liquidity Scout agent. You audit the liquidity conditions of a "
    "trader's past executions using the provided LiquidityMetricsPacket.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "liquidity_scout",\n'
    '  "liquidityRating": "GOOD" | "MODERATE" | "POOR" | "CRITICAL",\n'
    '  "slippageRoot": string (one past-tense sentence on the root cause; any value only as a placeholder),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n\n"
    "Rating guide:\n"
    "- GOOD: low slippage, little adverse selection\n"
    "- POOR / CRITICAL: high slippage, strong adverse selection\n"
    "- MODERATE: everything else\n"
    "\nExample: \"slippageRoot\": \"Market orders averaged {{liquidity.avg_slippage_bps}} of slippage and were worst at {{liquidity.worst_hour_utc}}.\"  Wrong: \"averaged 7.3 bps\" or \"the five worst trades\" (digits or number words outside a placeholder).\n"
)


def build_user_prompt(context: TradeContext, packet: LiquidityMetricsPacket, ctx: dict | None = None) -> str:
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return f"""LiquidityMetricsPacket:
{packet_values(ctx, [NAMESPACE])}

Regime: {context.regime}

Assign liquidityRating, write slippageRoot citing packet keys, list cited_evidence keys.
Schema: liquidityRating (GOOD/MODERATE/POOR/CRITICAL), slippageRoot (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: LiquidityMetricsPacket, telemetry: list | None = None, *,
              ctx: dict | None = None, ledger=None) -> LiquidityVerdict:
    """Run the agent through the router with blocking grounding (agents.grounded_call). Raises if no
    model produced a valid verdict, or, if its explanation had to be removed, uses the code-built fallback sentence."""
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return await grounded_verdict(
        llm, ROLE, SYSTEM_PROMPT, build_user_prompt(context, packet, ctx), LiquidityVerdict,
        agent="liquidity_scout", text_field=TEXT_FIELD, ctx=ctx, ledger=ledger, telemetry=telemetry, max_tokens=MAX_TOKENS,
        namespace=NAMESPACE, fallback=("Liquidity", "liquidityRating", "liquidity.avg_slippage_bps"),
    )

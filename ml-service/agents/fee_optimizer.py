"""Fee Optimizer — specialist agent for fee efficiency.

Audits past executions from the deterministic FeeMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

from agents.metrics.fee_packet import FeeMetricsPacket
from agents.grounded_call import grounded_verdict
from agents.prompts import packet_values, system_prompt
from agents.schemas import TradeContext, FeeVerdict

ROLE = "specialist"
MAX_TOKENS = 500
NAMESPACE = "fee"
TEXT_FIELD = "recommendedAction"   # the explanation; emptied by redaction -> code-built fallback sentence

SYSTEM_PROMPT = system_prompt(
    "You are FillScore's Fee Optimizer agent. You audit the fee efficiency of a "
    "crypto spot trader's past executions.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "fee_optimizer",\n'
    '  "feeRating": "OPTIMAL" | "MODERATE" | "WASTEFUL" | "SEVERELY_WASTEFUL",\n'
    '  "recommendedAction": string (one past-tense finding about where the fee cost came from, e.g. "Most fills were taker orders ({{fee.maker_ratio}} maker)"),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
    "\nExample: \"recommendedAction\": \"Maker orders were {{fee.maker_ratio}} of fills, which left fee drag at {{fee.fee_drag_bps}}.\"  Wrong: \"22% maker\" or \"about ten bps of drag\" (digits or number words outside a placeholder).\n"
)


def build_user_prompt(context: TradeContext, packet: FeeMetricsPacket, ctx: dict | None = None) -> str:
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return f"""FeeMetricsPacket:
{packet_values(ctx, [NAMESPACE])}

Regime: {context.regime}

Assign feeRating, write recommendedAction, list cited_evidence keys.
Schema: feeRating (OPTIMAL/MODERATE/WASTEFUL/SEVERELY_WASTEFUL), recommendedAction (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: FeeMetricsPacket, telemetry: list | None = None, *,
              ctx: dict | None = None, ledger=None) -> FeeVerdict:
    """Run the agent through the router with blocking grounding (agents.grounded_call). Raises if no
    model produced a valid verdict, or, if its explanation had to be removed, uses the code-built fallback sentence."""
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return await grounded_verdict(
        llm, ROLE, SYSTEM_PROMPT, build_user_prompt(context, packet, ctx), FeeVerdict,
        agent="fee_optimizer", text_field=TEXT_FIELD, ctx=ctx, ledger=ledger, telemetry=telemetry, max_tokens=MAX_TOKENS,
        namespace=NAMESPACE, fallback=("Fee", "feeRating", "fee.fee_drag_bps"),
    )

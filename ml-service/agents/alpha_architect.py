"""Alpha Architect — specialist agent for benchmark-relative execution quality.

Audits past executions from the deterministic AlphaMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

from agents.metrics.alpha_packet import AlphaMetricsPacket
from agents.grounded_call import grounded_verdict
from agents.prompts import packet_values, system_prompt
from agents.schemas import TradeContext, AlphaVerdict

ROLE = "specialist"
MAX_TOKENS = 500
NAMESPACE = "alpha"
TEXT_FIELD = "bestAlternative"   # the explanation; emptied by redaction -> code-built fallback sentence

SYSTEM_PROMPT = system_prompt(
    "You are FillScore's Alpha Architect agent. You audit whether a trader's past "
    "executions captured or leaked value relative to the packet's benchmarks.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "alpha_architect",\n'
    '  "alphaRating": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "SEVERELY_NEGATIVE",\n'
    '  "bestAlternative": string (past tense: which benchmark in the packet these executions compared best or worst against; any value only as a placeholder),\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
    "\nExample: \"bestAlternative\": \"Fills sat close to the VWAP benchmark, with a median deviation of {{alpha.median_vwap_deviation_bps}}.\"  Wrong: \"a median deviation of 2 bps\" or \"within three bps\" (digits or number words outside a placeholder).\n"
)


def build_user_prompt(context: TradeContext, packet: AlphaMetricsPacket, ctx: dict | None = None) -> str:
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return f"""AlphaMetricsPacket:
{packet_values(ctx, [NAMESPACE])}

Assign alphaRating, write bestAlternative, list cited_evidence keys.
Schema: alphaRating (POSITIVE/NEUTRAL/NEGATIVE/SEVERELY_NEGATIVE), bestAlternative (str), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: AlphaMetricsPacket, telemetry: list | None = None, *,
              ctx: dict | None = None, ledger=None) -> AlphaVerdict:
    """Run the agent through the router with blocking grounding (agents.grounded_call). Raises if no
    model produced a valid verdict, or, if its explanation had to be removed, uses the code-built fallback sentence."""
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return await grounded_verdict(
        llm, ROLE, SYSTEM_PROMPT, build_user_prompt(context, packet, ctx), AlphaVerdict,
        agent="alpha_architect", text_field=TEXT_FIELD, ctx=ctx, ledger=ledger, telemetry=telemetry, max_tokens=MAX_TOKENS,
        namespace=NAMESPACE, fallback=("Alpha", "alphaRating", "alpha.avg_vwap_deviation_bps"),
    )

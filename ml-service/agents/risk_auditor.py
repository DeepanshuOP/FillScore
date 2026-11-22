"""Risk Auditor — specialist agent for concentration and adverse-selection risk.

Audits past executions from the deterministic RiskMetricsPacket. The model is chosen by the router
(config/llm_routes.yaml, role "specialist").
"""

from __future__ import annotations

from agents.metrics.risk_packet import RiskMetricsPacket
from agents.grounded_call import grounded_verdict
from agents.prompts import packet_values, system_prompt
from agents.required_evidence import specialist_line
from agents.schemas import TradeContext, RiskVerdict

ROLE = "specialist"
MAX_TOKENS = 500
NAMESPACE = "risk"
TEXT_FIELD = None   # no free-text explanation, only flags

_EXAMPLE_ALL = ('\nExample: "flags": ["Notional was concentrated, with the top symbol at {{risk.top_symbol_notional_fraction}} '
                'of the total."]  Wrong: "the top symbol was 75%" or "two symbols dominated" (digits or number words '
                'outside a placeholder).\n')
# Prompt 1.8.0: a packet built for one symbol holds no cross-symbol concentration values (metrics 1.4.0), so the
# prompt says so and gives an example that uses a value the packet has.
_EXAMPLE_ONE_SYMBOL = ('\nThis packet covers one symbol only. It holds no symbol concentration values: state nothing about '
                       'concentration across symbols, and do not infer what else the account trades.\n'
                       'Example: "flags": ["Trading clustered in the busiest hour, at {{risk.top_hour_trade_fraction}} of the trades."]  '
                       'Wrong: "the top hour held 40%" or "two hours dominated" (digits or number words outside a '
                       'placeholder).\n')


def _system_prompt(example: str) -> str:
    return system_prompt(
    "You are FillScore's Risk Auditor agent. You audit the concentration risk and "
    "adverse selection exposure of a trader's past executions.\n\n"
    "Return ONLY valid JSON matching this schema — no prose, no markdown fences, "
    "no preamble:\n"
    "{\n"
    '  "agent": "risk_auditor",\n'
    '  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "cited_evidence": [string] (keys from the packet that support this verdict),\n'
    '  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",\n'
    '  "confidence": float (0-1),\n'
    '  "flags": [string]\n'
    "}\n"
    + example
    )


SYSTEM_PROMPT = _system_prompt(_EXAMPLE_ALL)                 # a packet built over every symbol (unchanged text)
SYSTEM_PROMPT_ONE_SYMBOL = _system_prompt(_EXAMPLE_ONE_SYMBOL)


def system_prompt_for(packet: RiskMetricsPacket) -> str:
    return SYSTEM_PROMPT if packet.covers_all_symbols else SYSTEM_PROMPT_ONE_SYMBOL


def build_user_prompt(context: TradeContext, packet: RiskMetricsPacket, ctx: dict | None = None) -> str:
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return f"""RiskMetricsPacket:
{packet_values(ctx, [NAMESPACE])}

{specialist_line(ctx, NAMESPACE)}

Assign riskLevel, list cited_evidence keys.
Schema: riskLevel (LOW/MEDIUM/HIGH/CRITICAL), cited_evidence (list[str]), severity (LOW/MEDIUM/HIGH/CRITICAL), confidence (0-1), flags (list[str])"""


async def run(context: TradeContext, llm, packet: RiskMetricsPacket, telemetry: list | None = None, *,
              ctx: dict | None = None, ledger=None) -> RiskVerdict:
    """Run the agent through the router with blocking grounding (agents.grounded_call). Raises if no
    model produced a valid verdict, or GroundingFailed if its explanation had to be removed."""
    ctx = ctx if ctx is not None else {NAMESPACE: packet.to_prompt_dict()}
    return await grounded_verdict(
        llm, ROLE, system_prompt_for(packet), build_user_prompt(context, packet, ctx), RiskVerdict,
        agent="risk_auditor", text_field=TEXT_FIELD, ctx=ctx, ledger=ledger, telemetry=telemetry, max_tokens=MAX_TOKENS,
        namespace=NAMESPACE,
    )

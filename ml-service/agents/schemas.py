"""
Agent Council schemas — Pydantic v2.
Specialist verdicts are LABEL-ONLY: agents cite evidence keys,
never originate numeric values. All numbers come from MetricsPackets.
"""
from __future__ import annotations
from pydantic import BaseModel, Field, create_model, field_validator
from typing import Literal, Optional

from agents.verification import ACTIONS


# ── Specialist verdict schemas (label-only after AC-3 wiring) ────────────────

class LiquidityVerdict(BaseModel):
    agent: str = "liquidity_scout"
    liquidityRating: Literal["GOOD", "MODERATE", "POOR", "CRITICAL"]
    slippageRoot: str = Field(description="One-sentence root cause citing packet keys, no invented numbers")
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the liquidity packet that support this verdict (e.g. 'avg_slippage_bps', 'worst5_trade_ids')"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)
    llm_self_confidence: float | None = Field(default=None, exclude=True, description="LLM-reported confidence. Never serialised to API output (an LLM-originated number); persisted separately for calibration")
    evidence_coverage_detail: dict = Field(default_factory=dict)


class AlphaVerdict(BaseModel):
    agent: str = "alpha_architect"
    alphaRating: Literal["POSITIVE", "NEUTRAL", "NEGATIVE", "SEVERELY_NEGATIVE"]
    bestAlternative: str = Field(description="One past-tense finding about how the executions compared with benchmarks, using placeholders")
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the alpha packet that support this verdict"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)
    llm_self_confidence: float | None = Field(default=None, exclude=True, description="LLM-reported confidence. Never serialised to API output (an LLM-originated number); persisted separately for calibration")
    evidence_coverage_detail: dict = Field(default_factory=dict)


class RiskVerdict(BaseModel):
    agent: str = "risk_auditor"
    riskLevel: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the risk packet that support this verdict"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)
    llm_self_confidence: float | None = Field(default=None, exclude=True, description="LLM-reported confidence. Never serialised to API output (an LLM-originated number); persisted separately for calibration")
    evidence_coverage_detail: dict = Field(default_factory=dict)


class FeeVerdict(BaseModel):
    agent: str = "fee_optimizer"
    feeRating: Literal["OPTIMAL", "MODERATE", "WASTEFUL", "SEVERELY_WASTEFUL"]
    recommendedAction: str = Field(description="One past-tense finding about where the fee cost came from, using placeholders")
    cited_evidence: list[str] = Field(
        default_factory=list,
        description="Keys from the fee packet that support this verdict"
    )
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "MEDIUM"
    confidence: float = Field(ge=0.0, le=1.0)
    flags: list[str] = Field(default_factory=list)
    llm_self_confidence: float | None = Field(default=None, exclude=True, description="LLM-reported confidence. Never serialised to API output (an LLM-originated number); persisted separately for calibration")
    evidence_coverage_detail: dict = Field(default_factory=dict)


# ── Synthesis output ──────────────────────────────────────────────────────────

class ConflictEntry(BaseModel):
    between: str = Field(description="Two agents that disagreed, e.g. 'fee_optimizer vs risk_auditor'")
    rule_applied: str = Field(description="The priority rule used to resolve, e.g. 'Fee > Risk'")
    winner: str = Field(description="Which agent's recommendation was prioritised")

    @field_validator("between", mode="before")
    @classmethod
    def _join_agent_list(cls, v):
        """One synthesis model wrote `between` as a list of agent names (1d.3, recorded loc/type
        `conflictLedger.N.between: string_type`). A list of strings is joined with " vs "; any other
        non-string still fails. The joined text is grounded like any other text field."""
        if isinstance(v, list) and v and all(isinstance(x, str) for x in v):
            return " vs ".join(v)
        return v


OverallRating = Literal["EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL"]


class Finding(BaseModel):
    """A recommendation the verifier recomputed on the user's own trades. Every number here comes
    from agents.counterfactual; `text` is the model's rationale rendered with those numbers."""
    action_type: str
    params: dict = Field(default_factory=dict)
    text: str
    effect_usd: float
    effect_bps: float
    n_trades_affected: int
    method: str
    verified: bool = True


class Observation(BaseModel):
    """A `none` / `general` item: shown without any effect."""
    action_type: str
    text: str


class SynthesisOutput(BaseModel):
    """Synthesis as returned to users. overallRating is None when the run is degraded (F-06):
    an incomplete run is never graded. estimatedMonthlyCostUSD is always overwritten from the fee
    packet by deterministic code (council.override_synthesis_cost)."""
    headline: str = Field(description="One sentence summary, max 20 words")
    narrative: str = Field(description="2-3 sentence explanation; numbers only via rendered placeholders")
    findings: list[Finding] = Field(default_factory=list, description="Verified counterfactual findings")
    observations: list[Observation] = Field(default_factory=list, description="Findings with no effect")
    conflictLedger: list[ConflictEntry] = Field(
        default_factory=list,
        description="Structured conflict resolution log — each entry names the conflict, rule applied, and winner"
    )
    overallRating: Optional[OverallRating] = Field(
        default=None,
        description="Forced verdict; None for a degraded run, which is never graded",
    )
    estimatedMonthlyCostUSD: float = Field(
        default=0.0,
        description="Fees paid in the audited period, copied from fee_packet.total_fee_paid_usd by code",
    )


ActionType = Literal[ACTIONS]


class Recommendation(BaseModel):
    """A structured recommendation from the synthesis model. Code replays it; the model never
    writes the effect."""
    action_type: ActionType
    params: dict = Field(default_factory=dict)
    rationale_text: str


class SynthesisLLMOutput(BaseModel):
    """The shape the synthesis model must return. Any extra field (e.g. a cost) is ignored."""
    headline: str
    narrative: str
    recommendations: list[Recommendation] = Field(min_length=1, max_length=3)
    conflictLedger: list[ConflictEntry] = Field(default_factory=list)
    overallRating: OverallRating = Field(
        description="Forced verdict — commit to EXCELLENT/GOOD/POOR/CRITICAL when evidence warrants; reserve FAIR only when evidence is genuinely balanced"
    )


class SynthesisTextOutput(BaseModel):
    """The verification-aware rewrite (2a.2): only the headline and narrative."""
    headline: str
    narrative: str


class ReReasonOutput(BaseModel):
    """The forced re-reason: replacements for rejected recommendations (possibly none)."""
    recommendations: list[Recommendation] = Field(default_factory=list)


def re_reason_schema(n_rejected: int) -> type[ReReasonOutput]:
    """ReReasonOutput with at most `n_rejected` items."""
    return create_model(
        "ReReasonOutput",
        __base__=ReReasonOutput,
        recommendations=(list[Recommendation], Field(default_factory=list, max_length=n_rejected)),
    )


# ── Full council result ───────────────────────────────────────────────────────

class TradeContext(BaseModel):
    """Thin context passed to each agent alongside their MetricsPacket."""
    userId: str
    symbol: str
    regime: Optional[str] = None   # legacy: kept so persisted runs still load; never set or rendered
    trade_count: int | None = None   # trades in this Council's packet (code-set; the panel's scope label)
    # packet hashes for integrity verification
    fee_packet_hash: str = ""
    risk_packet_hash: str = ""
    liquidity_packet_hash: str = ""
    alpha_packet_hash: str = ""


class CouncilResult(BaseModel):
    tradeContext: TradeContext
    liquidity: LiquidityVerdict
    alpha: AlphaVerdict
    risk: RiskVerdict
    fee: FeeVerdict
    synthesis: SynthesisOutput
    totalLatencyMs: float
    modelUsage: dict
    tokenUsage: dict = Field(
        default_factory=dict,
        description="AC-14b token usage telemetry for Table 4"
    )
    grounding: dict = Field(
        default_factory=dict,
        description="1c.3 blocking grounding: GroundingLedger.to_dict (violations, regenerations, redactions, faithfulness)"
    )
    claims: dict = Field(default_factory=dict, description="2a.2 claim check: ClaimsLedger.to_dict")
    verification: dict = Field(
        default_factory=dict,
        description="1c.4 counterfactual verifier: verification.summarise (proposed, passed, rejected, re_reasoned, dropped)"
    )
    debate_transcript: dict = Field(
        default_factory=dict,
        description="AC-6 execution trial debate — prosecution/defense claims"
    )
    run_id: Optional[str] = None
    # Phase 1b.2: honest run status. A degraded run is never graded.
    degraded: bool = False
    degraded_reasons: list[str] = Field(default_factory=list)
    n_calls_expected: int = 0
    n_calls_ok: int = 0
    # Phase 1b.5: served from an earlier identical run (zero LLM calls).
    cached: bool = False
    # Phase 1b.4: one record per HTTP attempt {role, provider, model, attempt, latency_ms, tokens, outcome}
    llm_calls: list[dict] = Field(default_factory=list)
    prompt_version: str = ""
    metrics_version: str = ""
    route_config_hash: str = ""

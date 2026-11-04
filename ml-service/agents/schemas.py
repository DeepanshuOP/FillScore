"""
Agent Council schemas — Pydantic v2.
Specialist verdicts are LABEL-ONLY: agents cite evidence keys,
never originate numeric values. All numbers come from MetricsPackets.
"""
from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Literal, Optional


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
    bestAlternative: str = Field(description="Recommended execution alternative, e.g. 'VWAP or passive limit'")
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
    recommendedAction: str = Field(description="Specific action, e.g. 'Switch to limit orders on BTC'")
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
    rule_applied: str = Field(description="The regime rule used to resolve, e.g. 'STABLE: Fee > Risk'")
    winner: str = Field(description="Which agent's recommendation was prioritised")


OverallRating = Literal["EXCELLENT", "GOOD", "FAIR", "POOR", "CRITICAL"]


class SynthesisOutput(BaseModel):
    """Synthesis as returned to users. overallRating is None when the run is degraded (F-06):
    an incomplete run is never graded. estimatedMonthlyCostUSD is always overwritten from the fee
    packet by deterministic code (council.override_synthesis_cost)."""
    headline: str = Field(description="One sentence summary, max 20 words")
    narrative: str = Field(description="2-3 sentence explanation using only numbers from the injected packet data")
    topRecommendations: list[str] = Field(
        default_factory=list,
        description="Key findings: past-tense statements about the audited executions",
    )
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


class SynthesisLLMOutput(SynthesisOutput):
    """The shape the synthesis model must return: a rating and exactly 3 findings are required.
    Any number it puts in estimatedMonthlyCostUSD is discarded."""
    topRecommendations: list[str] = Field(
        description="Exactly 3 findings, each a past-tense statement about the audited executions",
        min_length=3,
        max_length=3,
    )
    overallRating: OverallRating = Field(
        description="Forced verdict — commit to EXCELLENT/GOOD/POOR/CRITICAL when evidence warrants; reserve FAIR only when evidence is genuinely balanced"
    )
    estimatedMonthlyCostUSD: Optional[float] = None


# ── Full council result ───────────────────────────────────────────────────────

class TradeContext(BaseModel):
    """Thin context passed to each agent alongside their MetricsPacket."""
    userId: str
    symbol: str
    regime: str = "STABLE"
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
    grounding_report: dict = Field(
        default_factory=dict,
        description="E1 faithfulness scores per agent — paper metric"
    )
    gate_report: dict = Field(
        default_factory=dict,
        description="AC-5 verification gate — counterfactual verdicts per recommendation"
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

"""
Deterministic confidence scoring for Agent Council specialists.
Replaces LLM-vibe confidence with evidence-coverage score.

evidence_coverage = (cited_evidence_keys ∩ available_packet_keys) / available_packet_keys

This is the confidence metric reported in the paper.
LLM self-confidence is stored separately for calibration analysis.
"""
from __future__ import annotations
from dataclasses import dataclass


@dataclass
class ConfidenceResult:
    evidence_coverage: float      # deterministic: cited / available packet keys
    llm_self_confidence: float    # what the LLM reported (stored for calibration)
    cited_count: int              # how many packet keys the agent cited
    available_count: int          # total keys in the packet
    uncited_keys: list[str]       # packet keys the agent did NOT cite


def compute_evidence_coverage(
    cited_evidence: list[str],
    packet_dict: dict,
) -> ConfidenceResult:
    """
    Compute deterministic evidence-coverage confidence score.

    Args:
        cited_evidence: keys the agent listed in cited_evidence field
        packet_dict: the to_prompt_dict() output for this agent's packet

    Returns:
        ConfidenceResult with coverage score and diagnostics
    """
    # Only count substantive packet keys (exclude metadata)
    METADATA_KEYS = {"content_hash", "metrics_version", "evidence_counts"}
    available_keys = [k for k in packet_dict.keys() if k not in METADATA_KEYS]
    available_count = len(available_keys)

    if available_count == 0:
        return ConfidenceResult(
            evidence_coverage=0.0,
            llm_self_confidence=0.0,
            cited_count=0,
            available_count=0,
            uncited_keys=[],
        )

    # Valid citations = cited keys that actually exist in the packet
    valid_cited = [k for k in cited_evidence if k in packet_dict and k not in METADATA_KEYS]
    cited_count = len(valid_cited)
    coverage = cited_count / available_count

    uncited = [k for k in available_keys if k not in valid_cited]

    return ConfidenceResult(
        evidence_coverage=round(coverage, 4),
        llm_self_confidence=0.0,  # caller sets this from LLM verdict
        cited_count=cited_count,
        available_count=available_count,
        uncited_keys=uncited,
    )


def inject_coverage_confidence(
    verdict_dict: dict,
    cited_evidence: list[str],
    packet_dict: dict,
    llm_self_confidence: float,
) -> dict:
    """
    Return updated verdict dict with confidence replaced by evidence_coverage,
    and llm_self_confidence added as a separate field for calibration logging.
    """
    result = compute_evidence_coverage(cited_evidence, packet_dict)
    result.llm_self_confidence = llm_self_confidence

    updated = dict(verdict_dict)
    updated["confidence"] = result.evidence_coverage          # deterministic
    updated["llm_self_confidence"] = llm_self_confidence      # stored for calibration
    updated["evidence_coverage_detail"] = {
        "cited_count": result.cited_count,
        "available_count": result.available_count,
        "coverage_score": result.evidence_coverage,
    }
    return updated

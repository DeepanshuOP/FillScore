"""1d.3: gpt-oss-120b's recorded synthesis failure (Phase 1d.7 live run, demo-disciplined, 2 attempts):
    validation conflictLedger.0.between:string_type, conflictLedger.1.between:string_type(, .2.between)
i.e. `between` arrived as a non-string. The router keeps only loc/type (no raw text), so the payload
below is reconstructed to match that signature: `between` as a list of the two agent names."""
from agents.schemas import ConflictEntry, SynthesisLLMOutput
from config.versions import PROMPT_VERSION

BAD_120B = {
    "headline": "Disciplined execution with low cost.",
    "narrative": "Fees and slippage were contained.",
    "recommendations": [{"action_type": "none", "params": {}, "rationale_text": "No change stood out."}],
    "conflictLedger": [
        {"between": ["fee_optimizer", "risk_auditor"], "rule_applied": "STABLE: Fee > Risk", "winner": "fee_optimizer"},
        {"between": ["liquidity_scout", "alpha_architect"], "rule_applied": "STABLE: Liquidity > Alpha",
         "winner": "liquidity_scout"},
    ],
    "overallRating": "GOOD",
}


def test_recorded_120b_shape_now_parses_with_agents_joined_by_vs():
    out = SynthesisLLMOutput.model_validate(BAD_120B)
    assert [e.between for e in out.conflictLedger] == ["fee_optimizer vs risk_auditor",
                                                       "liquidity_scout vs alpha_architect"]


def test_between_still_rejects_non_string_items():
    import pytest
    from pydantic import ValidationError

    for bad in ({"a": 1}, [1, 2], ["fee_optimizer", {"x": 1}], 7):
        with pytest.raises(ValidationError):
            ConflictEntry(between=bad, rule_applied="r", winner="w")


def test_string_between_unchanged():
    assert ConflictEntry(between="fee_optimizer vs risk_auditor", rule_applied="r", winner="w").between == \
        "fee_optimizer vs risk_auditor"


def test_prompt_version_bumped_for_the_between_example():
    assert PROMPT_VERSION == "1.5.0"

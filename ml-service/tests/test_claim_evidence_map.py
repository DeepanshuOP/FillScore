import os
import pytest
from eval.claim_evidence_map import CLAIM_EVIDENCE_MAP

def test_claim_evidence_map_structure():
    assert len(CLAIM_EVIDENCE_MAP) == 5

    valid_statuses = {"measured", "measured_pilot", "pending_full_eval", "not_measured"}

    # 1. Compute-then-judge grounding contract with a measured faithfulness metric (E1). No reference repo can compute this.
    # 2. Adversarial execution-attribution debate (prosecution/defense/judge) — audits skill vs luck vs market.
    # 3. Deterministic counterfactual verification of LLM recommendations with forced self-correction.
    # 4. Leakage-free walk-forward evaluation of an auditing (not trading) agent system on real microstructure.
    # 5. Cost-quality frontier across open models, all on free tiers ($0/run).

    for i, entry in enumerate(CLAIM_EVIDENCE_MAP):
        assert "contribution" in entry
        assert "implementation" in entry
        assert "metric_or_table" in entry
        assert "status" in entry
        assert entry["status"] in valid_statuses

        imp_path = entry["implementation"]
        if imp_path:
            # The path format is "file.py:function_name". We strip off the function name
            file_part = imp_path.split(":")[0]
            # Since the path is relative to ml-service/, e.g. "agents/grounding.py"
            # we check if it exists relative to tests/.. -> ml-service/
            abs_path = os.path.join(os.path.dirname(__file__), "..", file_part)
            assert os.path.exists(abs_path), f"Implementation path {imp_path} does not exist"

    # Specific check for entry 5 (Cost-quality frontier)
    assert CLAIM_EVIDENCE_MAP[4]["status"] == "not_measured"

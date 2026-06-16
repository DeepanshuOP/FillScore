import os

CLAIM_EVIDENCE_MAP = [
    {
        "contribution": "Compute-then-judge grounding contract with a measured faithfulness metric (E1). No reference repo can compute this.",
        "implementation": "agents/grounding.py:check_grounding",
        "metric_or_table": "Table 1 (Faithfulness)",
        "status": "measured_pilot"
    },
    {
        "contribution": "Adversarial execution-attribution debate (prosecution/defense/judge) — audits skill vs luck vs market.",
        "implementation": "agents/debate.py:run_debate",
        "metric_or_table": "Table 2 (Consistency)",
        "status": "pending_full_eval"
    },
    {
        "contribution": "Deterministic counterfactual verification of LLM recommendations with forced self-correction.",
        "implementation": "agents/verification.py:verify_recommendations",
        "metric_or_table": "Table 3 (Utility)",
        "status": "pending_full_eval"
    },
    {
        "contribution": "Leakage-free walk-forward evaluation of an auditing (not trading) agent system on real microstructure.",
        "implementation": "eval/harness.py:assert_no_future_leakage",
        "metric_or_table": "E1/E2/E3 leakage bounds",
        "status": "measured_pilot"
    },
    {
        "contribution": "Cost-quality frontier across open models, all on free tiers ($0/run).",
        "implementation": "",
        "metric_or_table": "Table 5 (Cost-Quality)",
        "status": "not_measured"
    }
]

def render_claim_evidence_map() -> str:
    md = "# Claim-Evidence Map\n\n"
    
    for i, entry in enumerate(CLAIM_EVIDENCE_MAP, 1):
        md += f"## {i}. {entry['contribution']}\n\n"
        md += f"- **Implementation:** `{entry['implementation']}`\n"
        md += f"- **Metric/Table:** {entry['metric_or_table']}\n"
        md += f"- **Status:** `{entry['status']}`\n"
        
        if i == 1:
            md += "- **Evidence Note:** AC-11 validated run numbers: `leakage_free=true`, `pre_cutoff_trade_count=36`, `E1_faithfulness=1.0`. Full statistical tables are pending the eval run.\n\n"
        elif i == 4:
            md += "- **Evidence Note:** AC-11 validated run numbers: `leakage_free=true`, `pre_cutoff_trade_count=36`, `E1_faithfulness=1.0`. Full statistical tables are pending the eval run.\n\n"
        elif i == 5:
            md += "- **Evidence Note:** No multi-model comparison has been run. AC-12 is required to produce this evidence.\n\n"
        else:
            md += "- **Evidence Note:** Full statistical tables are pending the eval run.\n\n"
            
    return md

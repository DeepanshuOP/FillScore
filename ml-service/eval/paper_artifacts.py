import os
import asyncio

async def generate_all_artifacts(eval_results: dict | None = None, write: bool = True) -> dict:
    from eval.repro_config import generate_repro_config
    from eval.claim_evidence_map import render_claim_evidence_map
    from eval.cost_report import generate_cost_report
    from eval.table_renderers import (
        render_table1_faithfulness,
        render_table2_consistency,
        render_table3_utility,
        render_eval_tables_placeholder
    )

    out_dir = os.path.join(os.path.dirname(__file__), "artifacts")
    if write:
        os.makedirs(out_dir, exist_ok=True)

    summary = {
        "written_files": [],
        "errors": {},
        "eval_tables_type": "real" if eval_results else "placeholder"
    }

    # 1. Repro config
    try:
        await generate_repro_config(write=write)
        if write:
            summary["written_files"].append("repro_config.json")
    except Exception as e:
        summary["errors"]["repro_config"] = str(e)

    # 2. Claim-evidence map
    try:
        md_cem = render_claim_evidence_map()
        if write:
            path = os.path.join(out_dir, "claim_evidence_map.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(md_cem)
            summary["written_files"].append("claim_evidence_map.md")
    except Exception as e:
        summary["errors"]["claim_evidence_map"] = str(e)

    # 3. Cost report (Table 4)
    try:
        await generate_cost_report(write=write)
        if write:
            summary["written_files"].append("table4_cost.md")
            summary["written_files"].append("table4_cost.csv")
    except Exception as e:
        summary["errors"]["cost_report"] = str(e)

    # 4. Eval tables (Tables 1-3)
    try:
        if eval_results:
            md_eval = render_table1_faithfulness(eval_results) + "\n\n" + \
                      render_table2_consistency(eval_results) + "\n\n" + \
                      render_table3_utility(eval_results)
        else:
            md_eval = render_eval_tables_placeholder()
            
        if write:
            path = os.path.join(out_dir, "eval_tables.md")
            with open(path, "w", encoding="utf-8") as f:
                f.write(md_eval)
            summary["written_files"].append("eval_tables.md")
    except Exception as e:
        summary["errors"]["eval_tables"] = str(e)

    return summary

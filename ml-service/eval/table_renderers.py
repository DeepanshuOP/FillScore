def render_table1_faithfulness(eval_results: dict) -> str:
    md = "# TABLE 1: Faithfulness (E1) per user profile\n\n"
    md += "| User | E1 Faithfulness | E1 Key Validity |\n"
    md += "|---|---|---|\n"
    
    for uid, r in eval_results.items():
        md += f"| {uid} | {r.get('E1_avg_faithfulness', 0):.4f} | N/A |\n"
        
    return md

def render_table2_consistency(eval_results: dict) -> str:
    md = "# TABLE 2: Consistency (E2) — verdict agreement rates\n\n"
    md += "| User | Overall | Fee | Risk | Liq |\n"
    md += "|---|---|---|---|---|\n"
    
    for uid, r in eval_results.items():
        ag = r.get("E2_agreement", {})
        overall = ag.get("overall", {}).get("agreement_rate", 0)
        fee = ag.get("fee", {}).get("agreement_rate", 0)
        risk = ag.get("risk", {}).get("agreement_rate", 0)
        liq = ag.get("liquidity", {}).get("agreement_rate", 0)
        md += f"| {uid} | {overall:.2%} | {fee:.2%} | {risk:.2%} | {liq:.2%} |\n"
        
    return md

def render_table3_utility(eval_results: dict) -> str:
    md = "# TABLE 3: Latency profile\n\n"
    md += "| User | Avg Latency | N Runs |\n"
    md += "|---|---|---|\n"
    
    for uid, r in eval_results.items():
        md += f"| {uid} | {r.get('avg_latency_ms', 0):.0f}ms | {r.get('n_runs', 0)} |\n"
        
    return md

def render_eval_tables_placeholder() -> str:
    md = "# Evaluation Tables (E1/E2/E3)\n\n"
    md += "> [!WARNING] STATUS: PENDING\n"
    md += "> The full walk-forward evaluation run has not been executed yet. Run `python -c \"import asyncio; from eval.harness import run_full_eval; print(asyncio.run(run_full_eval()))\"` to generate the real tables.\n\n"
    return md

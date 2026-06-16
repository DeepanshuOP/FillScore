import os
import certifi
from motor.motor_asyncio import AsyncIOMotorClient

def aggregate_costs(runs: list[dict]) -> dict:
    rows = []
    total_tokens = 0
    prompt_tokens = 0
    completion_tokens = 0
    total_latency_ms = 0.0

    for r in runs:
        token_usage = r.get("token_usage")
        if not token_usage:
            continue
        
        # must have actual keys
        if not all(k in token_usage for k in ["prompt_tokens", "completion_tokens", "total_tokens", "n_calls"]):
            continue

        model_usage = r.get("model_usage", {})
        model = model_usage.get("synthesis_model", "unknown")
        
        latency_ms = float(r.get("total_latency_ms", 0.0))

        row = {
            "run_id": r.get("run_id", "unknown"),
            "user_symbol": f"{r.get('user_id', 'unknown')}/{r.get('symbol', 'unknown')}",
            "model": model,
            "prompt_tokens": token_usage["prompt_tokens"],
            "completion_tokens": token_usage["completion_tokens"],
            "total_tokens": token_usage["total_tokens"],
            "n_calls": token_usage["n_calls"],
            "latency_ms": latency_ms,
            "cost_usd": 0.00
        }
        rows.append(row)

        total_tokens += row["total_tokens"]
        prompt_tokens += row["prompt_tokens"]
        completion_tokens += row["completion_tokens"]
        total_latency_ms += latency_ms

    n_runs = len(rows)
    totals = {
        "total_tokens": total_tokens,
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "n_runs": n_runs,
        "avg_total_tokens": float(total_tokens / n_runs) if n_runs > 0 else 0.0,
        "avg_latency_ms": float(total_latency_ms / n_runs) if n_runs > 0 else 0.0,
    }

    return {"rows": rows, "totals": totals}


def _render_markdown(agg: dict) -> str:
    md = "# Table 4: Agent Council Inference Telemetry\n\n"
    md += "*Note: Measured performance on Groq free tier.*\n\n"
    md += "| Run ID | Target | Model | Prompt | Completion | Total | Calls | Latency | Cost (USD) |\n"
    md += "|---|---|---|---|---|---|---|---|---|\n"

    for r in agg["rows"]:
        md += f"| `{r['run_id'][:8]}` | {r['user_symbol']} | {r['model']} | "
        md += f"{r['prompt_tokens']} | {r['completion_tokens']} | {r['total_tokens']} | "
        md += f"{r['n_calls']} | {r['latency_ms']:.1f}ms | ${r['cost_usd']:.2f} |\n"

    t = agg["totals"]
    md += f"| **TOTAL/AVG** | **{t['n_runs']} runs** | - | **{t['prompt_tokens']}** | "
    md += f"**{t['completion_tokens']}** | **{t['total_tokens']}** | - | "
    md += f"**{t['avg_latency_ms']:.1f}ms avg** | **$0.00** |\n"
    return md


def _render_csv(agg: dict) -> str:
    csv_str = "run_id,user_symbol,model,prompt_tokens,completion_tokens,total_tokens,n_calls,latency_ms,cost_usd\n"
    for r in agg["rows"]:
        csv_str += f"{r['run_id']},{r['user_symbol']},{r['model']},"
        csv_str += f"{r['prompt_tokens']},{r['completion_tokens']},{r['total_tokens']},"
        csv_str += f"{r['n_calls']},{r['latency_ms']:.1f},{r['cost_usd']:.2f}\n"

    t = agg["totals"]
    csv_str += f"TOTAL,n={t['n_runs']},-,{t['prompt_tokens']},{t['completion_tokens']},{t['total_tokens']},-,{t['avg_latency_ms']:.1f},0.00\n"
    return csv_str


async def generate_cost_report(write: bool = True) -> str:
    import codecs
    
    # load env
    for path in ['.env', '../backend/.env']:
        try:
            with codecs.open(path, 'r', encoding='utf-8') as f:
                for line in f:
                    if '=' in line:
                        k, v = line.strip().split('=', 1)
                        if k.strip() not in os.environ:
                            os.environ[k.strip()] = v.strip()
        except: pass

    uri = os.environ.get("MONGODB_URI")
    client = AsyncIOMotorClient(uri, tlsCAFile=certifi.where())
    db = client["fillscore"]

    all_runs = await db.council_runs.find().to_list(1000)
    
    agg = aggregate_costs(all_runs)

    included = agg["totals"]["n_runs"]
    skipped = len(all_runs) - included
    print(f"[cost_report] Included runs: {included}, Skipped runs: {skipped}")

    md = _render_markdown(agg)
    csv_str = _render_csv(agg)

    if write:
        out_dir = os.path.join(os.path.dirname(__file__), "artifacts")
        os.makedirs(out_dir, exist_ok=True)

        md_path = os.path.join(out_dir, "table4_cost.md")
        csv_path = os.path.join(out_dir, "table4_cost.csv")

        with open(md_path, "w", encoding="utf-8") as f:
            f.write(md)
        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(csv_str)

    return md

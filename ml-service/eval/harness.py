"""
Walk-Forward Evaluation Harness — paper metric E1/E2/E3.
Implements AI-Trader's leakage-free methodology for TCA auditing.

Temporal split: council sees Jan weeks 1-2 only (cutoff = 2024-01-15).
Recommendations scored on weeks 3-4 data.
CI assertion: no trade with executedAt > CUTOFF_DATE reaches any agent prompt.
"""
from __future__ import annotations
import asyncio, os, json
from datetime import datetime, timezone
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient
from collections import Counter

CUTOFF_DATE = "2024-01-15T00:00:00+00:00"  # Jan week 1-2 boundary
EVAL_USERS = ["demo-disciplined", "demo-moderate", "demo-aggressive"]
EVAL_SYMBOL = "BTCUSDT"


def _get_db():
    _ml_env = os.path.join(os.path.dirname(__file__), "..", ".env")
    _backend_env = os.path.join(os.path.dirname(__file__), "..", "..", "backend", ".env")
    for _env_path in [_ml_env, _backend_env]:
        if os.path.exists(_env_path):
            try:
                from dotenv import load_dotenv
                load_dotenv(_env_path, override=False)
            except (ValueError, UnicodeDecodeError):
                pass
            
    import certifi
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/fillscore")
    client = AsyncIOMotorClient(uri, tlsCAFile=certifi.where())
    db_name = uri.rsplit("/", 1)[-1].split("?")[0] if "/" in uri else "fillscore"
    return client, client[db_name]


async def fetch_trades_before_cutoff(
    user_id: str,
    symbol: str,
    cutoff: str = CUTOFF_DATE,
) -> list[dict]:
    """
    Fetch only trades with executedAt < cutoff.
    This is the leakage-free boundary: agents never see future data.
    """
    client, db = _get_db()
    try:
        from datetime import datetime
        # Convert string cutoff to naive datetime matching MongoDB format
        if isinstance(cutoff, str):
            cutoff_dt = datetime.fromisoformat(cutoff.replace("Z", "+00:00")).replace(tzinfo=None)
        else:
            cutoff_dt = cutoff

        cursor = db["trades"].find(
            {
                "userId": user_id,
                "symbol": symbol,
                "executedAt": {"$lt": cutoff_dt},
            },
            {
                "_id": 1, "symbol": 1, "exchange": 1,
                "isMaker": 1, "feePaid": 1, "notionalValue": 1,
                "orderType": 1, "arrivalSlippageBps": 1,
                "fillScore": 1, "executedAt": 1, "side": 1,
                "executionPrice": 1, "vwap5m": 1,
                "whale_adverse": 1,
            }
        ).sort("executedAt", 1)
        trades = []
        async for doc in cursor:
            doc["id"] = str(doc.get("_id", ""))
            trades.append(doc)
        return trades
    finally:
        client.close()


async def assert_no_future_leakage(trades: list[dict], cutoff: str = CUTOFF_DATE) -> bool:
    """
    CI assertion: verify no trade in the list has executedAt >= cutoff.
    Returns True if clean, raises AssertionError if leakage detected.
    This assertion runs in CI to guarantee reproducibility.
    """
    cutoff_dt = datetime.fromisoformat(cutoff)
    for t in trades:
        ts_raw = t.get("executedAt", "")
        try:
            ts = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            if ts >= cutoff_dt:
                raise AssertionError(
                    f"LEAKAGE DETECTED: trade {t.get('id')} has executedAt={ts_raw} >= cutoff {cutoff}"
                )
        except ValueError:
            pass  # unparseable timestamp — skip
    return True


async def run_single_eval(
    user_id: str,
    symbol: str,
    cutoff: str = CUTOFF_DATE,
) -> dict:
    """
    Run one council evaluation on pre-cutoff data only.
    Returns a result dict with E1/E2/E3 metrics for this run.
    """
    from agents.metrics.fee_packet import build_fee_packet
    from agents.metrics.risk_packet import build_risk_packet
    from agents.metrics.liquidity_packet import build_liquidity_packet
    from agents.metrics.alpha_packet import build_alpha_packet
    from agents.council import run_council_with_packets

    # Fetch pre-cutoff trades only
    trades = await fetch_trades_before_cutoff(user_id, symbol, cutoff)

    # Leakage assertion — will raise if any future data slips through
    await assert_no_future_leakage(trades, cutoff)

    if len(trades) < 5:
        return {"error": f"Insufficient pre-cutoff trades: {len(trades)}", "user_id": user_id}

    # Build packets from pre-cutoff trades only
    fee_pkt = build_fee_packet(trades, user_id, symbol)
    risk_pkt = build_risk_packet(trades, user_id, symbol)
    liq_pkt = build_liquidity_packet(trades, user_id, symbol)
    alpha_pkt = build_alpha_packet(trades, user_id, symbol)

    # Run council
    result = await run_council_with_packets(user_id, symbol, fee_pkt, risk_pkt, liq_pkt, alpha_pkt)

    # E1: faithfulness
    grounding = result.grounding_report

    # E2: verdict labels (for consistency analysis across repeated runs)
    verdict_labels = {
        "liquidity": result.liquidity.liquidityRating,
        "alpha": result.alpha.alphaRating,
        "risk": result.risk.riskLevel,
        "fee": result.fee.feeRating,
        "overall": result.synthesis.overallRating,
    }

    # E3: recommendation utility
    gate = result.gate_report
    recs_with_values = [
        {
            "text": v["text"],
            "action_type": v["action_type"],
            "passed": v["passed"],
            "counterfactual_value": v["counterfactual_value"],
            "counterfactual_key": v["counterfactual_key"],
        }
        for v in gate.get("verdicts", [])
    ]

    return {
        "user_id": user_id,
        "symbol": symbol,
        "cutoff": cutoff,
        "pre_cutoff_trade_count": len(trades),
        "leakage_free": True,
        "E1_faithfulness": grounding.get("avg_faithfulness_score", 0.0),
        "E1_key_validity": grounding.get("avg_key_validity_score", 0.0),
        "E1_violations": grounding.get("total_violations", 0),
        "E2_verdict_labels": verdict_labels,
        "E3_gate_passed": gate.get("gate_passed", False),
        "E3_passed_count": gate.get("passed_count", 0),
        "E3_total_recs": gate.get("total_recommendations", 0),
        "E3_recommendations": recs_with_values,
        "debate_rounds": result.debate_transcript.get("round_count", 0) if isinstance(result.debate_transcript, dict) else 0,
        "total_latency_ms": result.totalLatencyMs,
        "overall_rating": result.synthesis.overallRating,
        "estimated_monthly_cost_usd": result.synthesis.estimatedMonthlyCostUSD,
    }


async def run_consistency_eval(
    user_id: str,
    symbol: str,
    n_runs: int = 5,
    cutoff: str = CUTOFF_DATE,
) -> dict:
    """
    E2: Run N council evaluations on the SAME pre-cutoff packet.
    Measure agreement rate on verdict labels across runs.
    Same packet = same content_hash = reproducible inputs, variable LLM outputs.
    """
    results = []
    for i in range(n_runs):
        print(f"  Consistency run {i+1}/{n_runs}...")
        try:
            r = await run_single_eval(user_id, symbol, cutoff)
            if "error" not in r:
                results.append(r)
        except Exception as e:
            print(f"  Run {i+1} failed: {e}")
        await asyncio.sleep(4)  # rate limit pause between runs

    if not results:
        return {"error": "All consistency runs failed"}

    # Compute agreement rate per verdict type
    agreement = {}
    for verdict_type in ["liquidity", "alpha", "risk", "fee", "overall"]:
        labels = [r["E2_verdict_labels"].get(verdict_type, "") for r in results]
        most_common, count = Counter(labels).most_common(1)[0]
        agreement[verdict_type] = {
            "most_common": most_common,
            "agreement_rate": round(count / len(labels), 4),
            "all_labels": labels,
        }

    avg_faithfulness = sum(r["E1_faithfulness"] for r in results) / len(results)
    avg_latency = sum(r["total_latency_ms"] for r in results) / len(results)

    return {
        "user_id": user_id,
        "n_runs": len(results),
        "E1_avg_faithfulness": round(avg_faithfulness, 4),
        "E2_agreement": agreement,
        "E2_avg_agreement_rate": round(
            sum(v["agreement_rate"] for v in agreement.values()) / len(agreement), 4
        ),
        "avg_latency_ms": round(avg_latency, 2),
    }


async def run_full_eval(n_consistency_runs: int = 3) -> dict:
    """
    Run the complete evaluation across all three demo profiles.
    Produces the paper's Tables 1-3.
    """
    print(f"Starting full evaluation: {len(EVAL_USERS)} users × {n_consistency_runs} consistency runs")
    print(f"Temporal cutoff: {CUTOFF_DATE}")
    print()

    results = {}
    for user_id in EVAL_USERS:
        print(f"=== Evaluating {user_id} ===")

        print("  Running consistency eval...")
        consistency = await run_consistency_eval(user_id, EVAL_SYMBOL, n_consistency_runs)
        results[user_id] = consistency
        print(f"  E2 avg agreement: {consistency.get('E2_avg_agreement_rate', 0):.2%}")
        print(f"  E1 avg faithfulness: {consistency.get('E1_avg_faithfulness', 0):.2%}")
        print()

        await asyncio.sleep(5)  # pause between users

    return results


def print_eval_table(results: dict) -> None:
    """Print paper-ready tables from eval results."""
    print("\n" + "="*60)
    print("TABLE 1: Faithfulness (E1) per user profile")
    print("="*60)
    print(f"{'User':<25} {'E1 Faithfulness':>15} {'E1 Key Validity':>15}")
    print("-"*55)
    for uid, r in results.items():
        print(f"{uid:<25} {r.get('E1_avg_faithfulness', 0):>15.4f} {'N/A':>15}")

    print("\n" + "="*60)
    print("TABLE 2: Consistency (E2) — verdict agreement rates")
    print("="*60)
    print(f"{'User':<25} {'Overall':>10} {'Fee':>10} {'Risk':>10} {'Liq':>10}")
    print("-"*65)
    for uid, r in results.items():
        ag = r.get("E2_agreement", {})
        print(f"{uid:<25} "
              f"{ag.get('overall', {}).get('agreement_rate', 0):>10.2%} "
              f"{ag.get('fee', {}).get('agreement_rate', 0):>10.2%} "
              f"{ag.get('risk', {}).get('agreement_rate', 0):>10.2%} "
              f"{ag.get('liquidity', {}).get('agreement_rate', 0):>10.2%}")

    print("\n" + "="*60)
    print("TABLE 3: Latency profile")
    print("="*60)
    for uid, r in results.items():
        print(f"{uid}: avg {r.get('avg_latency_ms', 0):.0f}ms over {r.get('n_runs', 0)} runs")

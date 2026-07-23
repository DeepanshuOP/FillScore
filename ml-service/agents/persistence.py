"""
Council run persistence — append-only MongoDB storage.
Every council run is stored as an immutable CouncilRunRecord.
Replaying a run with the same packet hashes must produce hash-identical
Layer-0 outputs (deterministic) and comparable LLM verdicts.

Collections:
  council_runs   — one document per council run (full result + telemetry)
  council_traces — one document per agent per run (prompt, raw LLM output, tokens)
"""
from __future__ import annotations
import os, uuid
from datetime import datetime, timezone
from typing import Any, Optional
from motor.motor_asyncio import AsyncIOMotorClient
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from config.versions import PROMPT_VERSION
from config.demo_users import VALID_DEMO_USERS


def _get_db():
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    client = AsyncIOMotorClient(uri)
    db_name = os.getenv("MONGO_DB_NAME", "fillscore")
    return client, client[db_name]


async def save_council_run(
    account_id: str,
    user_id: str,
    symbol: str,
    council_result_dict: dict,
    grounding_summary: dict,
    packet_hashes: dict[str, str],
    model_usage: dict,
    total_latency_ms: float,
    prompt_version: str = PROMPT_VERSION,
) -> str:
    """
    Persist a completed council run. Returns the run_id.
    Document is immutable after insert — never update, only insert new runs.
    """
    if not account_id:
        import logging
        logging.warning("save_council_run skipped: account_id is missing or empty")
        return None

    run_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    doc = {
        "run_id": run_id,
        "accountId": account_id,
        "user_id": user_id,
        "data_source": "synthetic-demo" if account_id in VALID_DEMO_USERS else "real-user",
        "symbol": symbol,
        "created_at": now,
        "prompt_version": prompt_version,
        "model_usage": model_usage,
        "total_latency_ms": total_latency_ms,
        # packet hashes — used to verify replay determinism
        "packet_hashes": packet_hashes,
        # grounding metrics (E1)
        "grounding_summary": grounding_summary,
        # full council result (verdicts + synthesis)
        "council_result": council_result_dict,
        # extracted for easy querying without deserialising full result
        "overall_rating": council_result_dict.get("synthesis", {}).get("overallRating", "UNKNOWN"),
        "avg_faithfulness_score": grounding_summary.get("avg_faithfulness_score", 0.0),
        "total_violations": grounding_summary.get("total_violations", 0),
        "token_usage": council_result_dict.get("tokenUsage", {}),
    }

    client, db = _get_db()
    try:
        await db["council_runs"].insert_one(doc)
    finally:
        client.close()

    return run_id


async def save_agent_trace(
    run_id: str,
    agent_name: str,
    prompt_text: str,
    raw_llm_output: str,
    parsed_verdict: dict,
    input_tokens: int,
    output_tokens: int,
    latency_ms: float,
    model: str,
    grounding_score: float,
) -> None:
    """
    Persist one agent's trace for a run. Append-only.
    Used by eval harness to compute per-agent metrics across runs.
    """
    doc = {
        "run_id": run_id,
        "agent_name": agent_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "model": model,
        "prompt_text": prompt_text,
        "raw_llm_output": raw_llm_output,
        "parsed_verdict": parsed_verdict,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": input_tokens + output_tokens,
        "latency_ms": latency_ms,
        "grounding_score": grounding_score,
    }
    client, db = _get_db()
    try:
        await db["council_traces"].insert_one(doc)
    finally:
        client.close()


async def load_council_run(run_id: str, account_id: str) -> Optional[dict]:
    """Load a stored council run by run_id, scoped by account_id. Returns None if not found."""
    client, db = _get_db()
    try:
        doc = await db["council_runs"].find_one({"run_id": run_id, "accountId": account_id})
        if doc:
            doc.pop("_id", None)
        return doc
    finally:
        client.close()


async def list_council_runs(
    account_id: str,
    symbol: Optional[str] = None,
    limit: int = 20,
) -> list[dict]:
    """
    List recent council runs for an account, newest first.
    Returns lightweight summary (no full council_result).
    """
    query: dict[str, Any] = {"accountId": account_id}
    if symbol:
        query["symbol"] = symbol

    projection = {
        "_id": 0,
        "run_id": 1,
        "accountId": 1,
        "user_id": 1,
        "symbol": 1,
        "created_at": 1,
        "total_latency_ms": 1,
        "overall_rating": 1,
        "avg_faithfulness_score": 1,
        "total_violations": 1,
        "model_usage": 1,
        "packet_hashes": 1,
        "prompt_version": 1,
    }

    client, db = _get_db()
    try:
        cursor = db["council_runs"].find(query, projection).sort("created_at", -1).limit(limit)
        return [doc async for doc in cursor]
    finally:
        client.close()


async def get_telemetry_summary(account_id: Optional[str] = None) -> dict:
    """
    Aggregate telemetry for paper Table: avg latency, avg faithfulness,
    total runs, total violations, per-model stats.
    Used by AC-11 eval harness and AC-14 cost report.
    """
    query = {}
    if account_id:
        query["accountId"] = account_id

    client, db = _get_db()
    try:
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": None,
                "total_runs": {"$sum": 1},
                "avg_latency_ms": {"$avg": "$total_latency_ms"},
                "avg_faithfulness": {"$avg": "$avg_faithfulness_score"},
                "total_violations": {"$sum": "$total_violations"},
                "rating_counts": {"$push": "$overall_rating"},
            }}
        ]
        results = await db["council_runs"].aggregate(pipeline).to_list(1)
        if not results:
            return {"total_runs": 0}
        r = results[0]
        r.pop("_id", None)
        # count ratings
        from collections import Counter
        r["rating_distribution"] = dict(Counter(r.pop("rating_counts", [])))
        return r
    finally:
        client.close()

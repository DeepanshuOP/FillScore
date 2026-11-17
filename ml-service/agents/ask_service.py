"""The service around "Ask your execution": who may ask, the budget, and where the data is read from.

A demo account is refused (no model is run for demo data, as for the Council). A real account's question reads only its own stored
v2 score and order measurements (read-only), costs ASK_UNITS budget units from the same allowance as the audits, and is refused
before any model call when the allowance or the router budget is gone.
"""
from __future__ import annotations

import os

from agents.ask import ASK_UNITS, ask_flow
from agents.errors import (ASK_NOT_AVAILABLE_FOR_DEMO, DAILY_BUDGET_EXHAUSTED, MODEL_UNAVAILABLE, RATE_LIMIT_EXHAUSTED, CouncilError)
from config.demo_users import VALID_DEMO_USERS


def _router():
    from agents import llm_router

    return llm_router.get_default_router()


async def load_account_data(account_id: str) -> tuple[dict | None, list[dict]]:
    """(latest v2 score document, order measurement documents) of the account. Read-only; no other account's data is addressable."""
    from agents.metrics.loader import _get_mongo_client

    db_name = os.getenv("MONGO_DB_NAME", "fillscore")
    client = _get_mongo_client()
    try:
        db = client[db_name]
        score = await db["scores_v2"].find_one({"accountId": account_id}, {"_id": 0, "scoringVersion": 1, "result": 1}, sort=[("computedAt", -1)])
        cursor = db["order_measurements"].find({"accountId": account_id}, {"_id": 0, "orderId": 1, "symbol": 1, "shortfall": 1, "unmeasuredReason": 1, "expectedCost": 1})
        return score, [d async for d in cursor.limit(5000)]
    finally:
        client.close()


async def ask_account(account_id: str, question: str, llm=None) -> dict:
    from config.budget import council_budget

    if account_id in VALID_DEMO_USERS:
        raise CouncilError(ASK_NOT_AVAILABLE_FOR_DEMO)
    llm = llm or _router()
    problem = await llm.capacity_problem()          # checked before the quota, so a refused question costs nothing
    if problem == "no_provider":
        raise CouncilError(MODEL_UNAVAILABLE)
    if problem is not None:
        raise CouncilError(DAILY_BUDGET_EXHAUSTED)
    decision = council_budget.try_acquire(account_id, ASK_UNITS)
    if not decision.allowed:
        raise CouncilError(RATE_LIMIT_EXHAUSTED if decision.reason == "account" else DAILY_BUDGET_EXHAUSTED, retry_after_s=decision.retry_after_s)

    async def load():
        return await load_account_data(account_id)

    return await ask_flow(question, load, llm)

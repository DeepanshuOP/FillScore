"""
MetricsLoader — fetches trade data from MongoDB and builds all four
deterministic MetricsPackets for the Agent Council.
Called once per council run; results cached by content_hash.
"""
from __future__ import annotations
import os
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient

from agents.metrics.fee_packet import build_fee_packet, FeeMetricsPacket
from agents.metrics.risk_packet import build_risk_packet, RiskMetricsPacket
from agents.metrics.liquidity_packet import build_liquidity_packet, LiquidityMetricsPacket
from agents.metrics.alpha_packet import build_alpha_packet, AlphaMetricsPacket


# Fields every packet builder reads. feeUsd (F-10) is the fee converted to USD at ingest.
TRADE_PROJECTION = {
    "_id": 1, "symbol": 1, "exchange": 1,
    "isMaker": 1, "fee": 1, "feeUsd": 1, "notional": 1,
    "orderType": 1, "arrivalSlippageBps": 1,
    "fillScore": 1, "executedAt": 1, "side": 1,
    "executionPrice": 1, "vwap5min": 1,
    "whaleAdverse": 1,
    "postPrices": 1, "spreadEstimates": 1, "halfSpreadBps": 1,   # 4a enrichment (absent until backfilled)
}


def normalise_trade_doc(doc: dict) -> dict:
    """Map a raw trade doc onto the field names the packet builders expect. feePaid is USD:
    feeUsd when ingest stored it, else the native fee (legacy/demo docs, which pay in USDT)."""
    doc["id"] = str(doc.get("_id", ""))  # string _id for evidence indexing
    fee_usd = doc.get("feeUsd")
    doc["feePaid"] = fee_usd if fee_usd is not None else doc.get("fee", 0.0)
    doc["notionalValue"] = doc.get("notional", 0.0)
    if doc.get("vwap5min") is not None:  # DB stores vwap5min; builders read vwap5m
        doc["vwap5m"] = doc["vwap5min"]
    return doc


def _get_mongo_client() -> AsyncIOMotorClient:
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    return AsyncIOMotorClient(uri)


async def load_trades(
    user_id: str,
    symbol: str,
    db_name: str | None = None,
    collection_name: str = "trades",
    client=None,
) -> list[dict]:
    """One read: the user's trades for `symbol` ("ALL" = every symbol), normalised, oldest first.
    The database is `db_name`, else MONGO_DB_NAME (as in persistence), else "fillscore". A `client` passed in is
    shared and left open (load_run_inputs reads trades and measurements through one connection)."""
    db_name = db_name or os.getenv("MONGO_DB_NAME", "fillscore")
    query = {"userId": user_id} if symbol == "ALL" else {"userId": user_id, "symbol": symbol}
    own = client is None
    client = client or _get_mongo_client()
    try:
        cursor = client[db_name][collection_name].find(query, TRADE_PROJECTION).sort([("executedAt", 1), ("_id", 1)])
        return [normalise_trade_doc(doc) async for doc in cursor]
    finally:
        if own:
            client.close()


async def count_fills(user_id: str, symbol: str, db_name: str | None = None, collection_name: str = "trades",
                      client=None) -> int:
    """How many fills (trade documents) the user has for `symbol` ("ALL" = every symbol). Read only. The Council page
    prints this beside the audit's own count, so a one-symbol audit says how much of the account it covers."""
    db_name = db_name or os.getenv("MONGO_DB_NAME", "fillscore")
    query = {"userId": user_id} if symbol == "ALL" else {"userId": user_id, "symbol": symbol}
    own = client is None
    client = client or _get_mongo_client()
    try:
        return int(await client[db_name][collection_name].count_documents(query))
    finally:
        if own:
            client.close()


async def scope_counts(user_id: str, symbol: str) -> dict:
    """{"symbolFills", "accountFills"}: fills of the audited symbol, and of the whole account. Both are counts of
    stored trade documents; the page prints them as served (the browser computes nothing)."""
    client = _get_mongo_client()
    try:
        return {"symbolFills": await count_fills(user_id, symbol, client=client),
                "accountFills": await count_fills(user_id, "ALL", client=client)}
    finally:
        client.close()


async def load_measurements(user_id: str, symbol: str, db_name: str | None = None, client=None) -> list[dict]:
    """The account's measured order shortfalls (collection order_measurements, written by ml-service/measure) for
    `symbol` ("ALL" = every symbol). Read only. The packets summarise them (agents.metrics.measured)."""
    db_name = db_name or os.getenv("MONGO_DB_NAME", "fillscore")
    query = {"accountId": user_id} if symbol == "ALL" else {"accountId": user_id, "symbol": symbol}
    own = client is None
    client = client or _get_mongo_client()
    try:
        cursor = client[db_name]["order_measurements"].find(query, {"_id": 0, "orderId": 1, "shortfall": 1, "unmeasuredReason": 1})
        return [doc async for doc in cursor.sort("orderId", 1)]
    finally:
        if own:
            client.close()


def build_all_packets(
    trades: list[dict], user_id: str, symbol: str, measurements: list[dict] | None = None,
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """The four packets (fee, risk, liquidity, alpha) from one list of normalised trades, plus (liquidity and alpha)
    the measured order shortfalls when there are any."""
    return (
        build_fee_packet(trades, user_id, symbol),
        build_risk_packet(trades, user_id, symbol),
        build_liquidity_packet(trades, user_id, symbol, measurements=measurements),
        build_alpha_packet(trades, user_id, symbol, measurements=measurements),
    )


async def load_run_inputs(user_id: str, symbol: str):
    """Packets and the trades they were built from, from a single DB read (the Council verifier
    replays these same trades)."""
    client = _get_mongo_client()
    try:
        trades = await load_trades(user_id, symbol, client=client)
        measurements = await load_measurements(user_id, symbol, client=client)
    finally:
        client.close()
    return build_all_packets(trades, user_id, symbol, measurements), trades


async def load_all_packets(
    user_id: str,
    symbol: str,
    db_name: str | None = None,
    collection_name: str = "trades",
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """Packets only (fee, risk, liquidity, alpha) for (user_id, symbol)."""
    return build_all_packets(await load_trades(user_id, symbol, db_name, collection_name), user_id, symbol)


async def load_all_packets_for_user(
    user_id: str,
    db_name: str | None = None,
    collection_name: str = "trades",
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """Same as load_all_packets across ALL symbols for a user (symbol="ALL")."""
    return await load_all_packets(user_id, "ALL", db_name, collection_name)

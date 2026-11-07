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
    db_name: str = "fillscore",
    collection_name: str = "trades",
) -> list[dict]:
    """One read: the user's trades for `symbol` ("ALL" = every symbol), normalised, oldest first."""
    query = {"userId": user_id} if symbol == "ALL" else {"userId": user_id, "symbol": symbol}
    client = _get_mongo_client()
    try:
        cursor = client[db_name][collection_name].find(query, TRADE_PROJECTION).sort("executedAt", 1)
        return [normalise_trade_doc(doc) async for doc in cursor]
    finally:
        client.close()


def build_all_packets(
    trades: list[dict], user_id: str, symbol: str,
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """The four packets (fee, risk, liquidity, alpha) from one list of normalised trades."""
    return (
        build_fee_packet(trades, user_id, symbol),
        build_risk_packet(trades, user_id, symbol),
        build_liquidity_packet(trades, user_id, symbol),
        build_alpha_packet(trades, user_id, symbol),
    )


async def load_run_inputs(user_id: str, symbol: str):
    """Packets and the trades they were built from, from a single DB read (the Council verifier
    replays these same trades)."""
    trades = await load_trades(user_id, symbol)
    return build_all_packets(trades, user_id, symbol), trades


async def load_all_packets(
    user_id: str,
    symbol: str,
    db_name: str = "fillscore",
    collection_name: str = "trades",
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """Packets only (fee, risk, liquidity, alpha) for (user_id, symbol)."""
    return build_all_packets(await load_trades(user_id, symbol, db_name, collection_name), user_id, symbol)


async def load_all_packets_for_user(
    user_id: str,
    db_name: str = "fillscore",
    collection_name: str = "trades",
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """Same as load_all_packets across ALL symbols for a user (symbol="ALL")."""
    return await load_all_packets(user_id, "ALL", db_name, collection_name)

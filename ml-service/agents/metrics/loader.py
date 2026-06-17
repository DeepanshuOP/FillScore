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


def _get_mongo_client() -> AsyncIOMotorClient:
    uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    return AsyncIOMotorClient(uri)


async def load_all_packets(
    user_id: str,
    symbol: str,
    db_name: str = "fillscore",
    collection_name: str = "trades",
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """
    Fetch all trades for (user_id, symbol) from MongoDB and build the
    four MetricsPackets. Returns a tuple (fee, risk, liquidity, alpha).
    """
    client = _get_mongo_client()
    try:
        db = client[db_name]
        collection = db[collection_name]

        cursor = collection.find(
            {"userId": user_id, "symbol": symbol},
            {
                "_id": 1,
                "symbol": 1,
                "exchange": 1,
                "isMaker": 1,
                "fee": 1,
                "notional": 1,
                "orderType": 1,
                "arrivalSlippageBps": 1,
                "fillScore": 1,
                "executedAt": 1,
                "side": 1,
                "executionPrice": 1,
                "vwap5m": 1,
                "whaleAdverse": 1,
            }
        ).sort("executedAt", 1)

        trades = []
        async for doc in cursor:
            # normalise _id to string for evidence indexing
            doc["id"] = str(doc.get("_id", ""))
            doc["feePaid"] = doc.get("fee", 0.0)
            doc["notionalValue"] = doc.get("notional", 0.0)
            trades.append(doc)

    finally:
        client.close()

    fee_pkt = build_fee_packet(trades, user_id, symbol)
    risk_pkt = build_risk_packet(trades, user_id, symbol)
    liquidity_pkt = build_liquidity_packet(trades, user_id, symbol)
    alpha_pkt = build_alpha_packet(trades, user_id, symbol)

    return fee_pkt, risk_pkt, liquidity_pkt, alpha_pkt


async def load_all_packets_for_user(
    user_id: str,
    db_name: str = "fillscore",
    collection_name: str = "trades",
) -> tuple[FeeMetricsPacket, RiskMetricsPacket, LiquidityMetricsPacket, AlphaMetricsPacket]:
    """
    Same as load_all_packets but across ALL symbols for a user.
    Used when symbol="ALL" is requested.
    """
    client = _get_mongo_client()
    try:
        db = client[db_name]
        collection = db[collection_name]
        cursor = collection.find(
            {"userId": user_id},
            {
                "_id": 1, "symbol": 1, "exchange": 1,
                "isMaker": 1, "fee": 1, "notional": 1,
                "orderType": 1, "arrivalSlippageBps": 1,
                "fillScore": 1, "executedAt": 1, "side": 1,
                "executionPrice": 1, "vwap5m": 1,
                "whaleAdverse": 1,
            }
        ).sort("executedAt", 1)
        trades = []
        async for doc in cursor:
            doc["id"] = str(doc.get("_id", ""))
            doc["feePaid"] = doc.get("fee", 0.0)
            doc["notionalValue"] = doc.get("notional", 0.0)
            trades.append(doc)
    finally:
        client.close()

    symbol_label = "ALL"
    return (
        build_fee_packet(trades, user_id, symbol_label),
        build_risk_packet(trades, user_id, symbol_label),
        build_liquidity_packet(trades, user_id, symbol_label),
        build_alpha_packet(trades, user_id, symbol_label),
    )

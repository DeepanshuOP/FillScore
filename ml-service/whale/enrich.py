"""
enrich.py — T2.12 Whale Correlation feature.

Enriches trades with whale pressure scores directly in MongoDB.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
import pymongo
from pymongo import MongoClient

# Use absolute imports if run as a module, or relative if run within ml-service
try:
    from whale.aggtrades_window import fetch_aggtrades_window
    from whale.whale_score import score_whale_window
except ImportError:
    from aggtrades_window import fetch_aggtrades_window
    from whale_score import score_whale_window


MONGO_URI = "mongodb+srv://deepanshuop_db_user:Fillscore2026@cluster0.ujqvavh.mongodb.net/fillscore?retryWrites=true&w=majority&appName=Cluster0"

WHALE_THRESHOLDS = {
    'BTCUSDT': 250_000.0,
    'ETHUSDT': 250_000.0,
    'SOLUSDT': 100_000.0,
    'BNBUSDT': 50_000.0
}

def enrich_symbol(symbol: str, user_ids: list[str], whale_notional_usd: float = 250_000.0) -> dict:
    """
    Fetch aggTrades and compute whale score for all matching trades, updating MongoDB.
    """
    client = MongoClient(MONGO_URI)
    db = client.get_database("fillscore")
    trades_collection = db.get_collection("trades")

    query = {
        "userId": {"$in": user_ids},
        "symbol": symbol
    }

    trades = list(trades_collection.find(query).sort("executedAt", 1))
    total_trades = len(trades)
    
    print(f"Found {total_trades} trades for {symbol} across {len(user_ids)} users.")

    enriched_count = 0
    events_count = 0
    adverse_count = 0
    examples = []

    for i, t in enumerate(trades):
        doc_id = t["_id"]
        executed_at = t["executedAt"]
        ts_ms = int(executed_at.timestamp() * 1000)
        side = t["side"]

        print(f"[{i+1}/{total_trades}] Enriching trade {t['tradeId']} at {executed_at}...", end="", flush=True)

        try:
            df = fetch_aggtrades_window(symbol, ts_ms, half_window_s=30)
            score = score_whale_window(
                df, 
                ts_ms, 
                side, 
                whale_notional_usd=whale_notional_usd
            )

            # Determine top event
            top_event = None
            if score["whale_events"]:
                # Sort descending by notional
                sorted_events = sorted(score["whale_events"], key=lambda x: x["notional"], reverse=True)
                top = sorted_events[0]
                top_event = {
                    "side": top["side"],
                    "notional": float(top["notional"]),
                    "secondsFromTrade": float(top["seconds_from_trade"])
                }

            update_fields = {
                "whaleNetPressure": float(score["net_pressure"]),
                "whalePressure": float(score["whale_pressure"]),
                "whaleAdverseScore": float(score["adverse_score"]),
                "whaleAdverse": bool(score["adverse"]),
                "whaleEventCount": int(score["whale_event_count"]),
                "whaleNearestS": float(score["nearest_whale_s"]) if score["nearest_whale_s"] is not None else None,
                "whaleLargestNotional": float(score["largest_whale_notional"]),
                "whaleTopEvent": top_event,
                "whaleEnrichedAt": datetime.now(timezone.utc)
            }

            trades_collection.update_one(
                {"_id": doc_id},
                {"$set": update_fields}
            )

            enriched_count += 1
            if score["whale_event_count"] > 0:
                events_count += 1
            if score["adverse"]:
                adverse_count += 1
                
            print(" ok")
            
            # Save a few examples for output
            if len(examples) < 3 and score["whale_event_count"] > 0:
                examples.append({
                    "tradeId": t["tradeId"],
                    "side": side,
                    "whaleAdverse": score["adverse"],
                    "whaleTopEvent": top_event
                })

        except Exception as e:
            print(f" error: {e}")

        time.sleep(0.2)  # 200ms delay

    # Summary
    detection_rate = events_count / enriched_count if enriched_count > 0 else 0.0
    adverse_rate = adverse_count / enriched_count if enriched_count > 0 else 0.0

    print("\n" + "="*50)
    print("VERIFICATION OUTPUT")
    print("="*50)
    print(f"Total {symbol} trades processed: {total_trades}")
    print(f"Successfully enriched: {enriched_count}")
    print(f"Population Detection Rate: {detection_rate:.1%} ({events_count}/{enriched_count})")
    print(f"Population Adverse Rate:   {adverse_rate:.1%} ({adverse_count}/{enriched_count})")
    
    print("\nExample Enriched Docs (with whales):")
    for ex in examples:
        print(f"  tradeId: {ex['tradeId']}")
        print(f"  side: {ex['side']}")
        print(f"  whaleAdverse: {ex['whaleAdverse']}")
        print(f"  whaleTopEvent: {ex['whaleTopEvent']}")
        print()

    return {
        "total_processed": total_trades,
        "successfully_enriched": enriched_count,
        "detection_rate": detection_rate,
        "adverse_rate": adverse_rate
    }


if __name__ == "__main__":
    users = ["demo-aggressive", "demo-moderate", "demo-disciplined"]
    for sym in ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]:
        thresh = WHALE_THRESHOLDS.get(sym, 250_000.0)
        enrich_symbol(sym, users, whale_notional_usd=thresh)

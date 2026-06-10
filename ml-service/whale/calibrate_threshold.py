"""
calibrate_threshold.py — T2.12 Whale Correlation feature.

Connects to the MongoDB, fetches a stratified sample of demo user BTCUSDT trades,
and measures whale detection rates at different thresholds to recommend a default.
"""

import math
import time
import numpy as np
import pymongo
from pymongo import MongoClient

# Use absolute imports if run as a module, or relative if run within ml-service
try:
    from whale.aggtrades_window import fetch_aggtrades_window
    from whale.whale_score import score_whale_window
except ImportError:
    from aggtrades_window import fetch_aggtrades_window
    from whale_score import score_whale_window

# MongoDB connection
MONGO_URI = "mongodb+srv://deepanshuop_db_user:Fillscore2026@cluster0.ujqvavh.mongodb.net/fillscore?retryWrites=true&w=majority&appName=Cluster0"

def calibrate(symbol: str, user_ids: list[str], sample_size: int = 60) -> dict:
    client = MongoClient(MONGO_URI)
    db = client.get_database("fillscore")
    trades_collection = db.get_collection("trades")

    query = {
        "userId": {"$in": user_ids},
        "symbol": symbol
    }

    all_trades = list(trades_collection.find(query).sort("executedAt", 1))
    
    if not all_trades:
        return {"symbol": symbol, "sampled_n": 0, "per_threshold_rates": {}, "recommended_threshold": None, "recommended_detection_rate": None}

    if len(all_trades) > sample_size:
        step = max(1, len(all_trades) // sample_size)
        sampled_trades = all_trades[::step][:sample_size]
    else:
        sampled_trades = all_trades

    thresholds = [25_000.0, 50_000.0, 100_000.0, 250_000.0, 500_000.0, 1_000_000.0]
    thresh_stats = {t: {"events": 0, "adverse": 0} for t in thresholds}
    
    processed_count = 0

    for i, t in enumerate(sampled_trades):
        executed_at = t["executedAt"]
        ts_ms = int(executed_at.timestamp() * 1000)
        side = t["side"]

        try:
            df = fetch_aggtrades_window(symbol, ts_ms, half_window_s=30)
            if df.empty:
                continue

            processed_count += 1
            for thresh in thresholds:
                score = score_whale_window(df, ts_ms, side, whale_notional_usd=thresh)
                if score["whale_event_count"] > 0:
                    thresh_stats[thresh]["events"] += 1
                if score["adverse"]:
                    thresh_stats[thresh]["adverse"] += 1

        except Exception as e:
            pass
            
        time.sleep(0.25)

    per_threshold_rates = {}
    best_thresh = None
    best_rate = 0.0

    closest_dist = float('inf')
    
    for thresh in thresholds:
        stats = thresh_stats[thresh]
        detection_rate = stats['events'] / processed_count if processed_count > 0 else 0
        per_threshold_rates[thresh] = detection_rate
        
        if 0.15 <= detection_rate <= 0.40:
            dist = 0
        elif detection_rate < 0.15:
            dist = 0.15 - detection_rate
        else:
            dist = detection_rate - 0.40
            
        # Tie-breaker: if distance is same, prefer higher threshold
        if dist < closest_dist or (dist == closest_dist and thresh > (best_thresh or 0)):
            closest_dist = dist
            best_thresh = thresh
            best_rate = detection_rate

    return {
        "symbol": symbol,
        "sampled_n": processed_count,
        "per_threshold_rates": per_threshold_rates,
        "recommended_threshold": best_thresh,
        "recommended_detection_rate": best_rate
    }

def run_calibration():
    users = ["demo-aggressive", "demo-moderate", "demo-disciplined"]
    symbols = ["ETHUSDT", "SOLUSDT", "BNBUSDT"]
    
    for sym in symbols:
        print(f"\nRunning {sym} calibration...")
        res = calibrate(sym, users, sample_size=60)
        print(f"{sym} Results:")
        print(f"  Sampled N: {res['sampled_n']}")
        print(f"  Recommended Threshold: {res['recommended_threshold']} (Rate: {res['recommended_detection_rate']:.1%})")
        print(f"  All Rates:")
        for t, r in res['per_threshold_rates'].items():
            print(f"    {t}: {r:.1%}")

if __name__ == "__main__":
    run_calibration()

import time
import datetime
import pandas as pd
from pymongo import MongoClient

from whale.aggtrades_window import fetch_aggtrades_window
from whale.realistic_fill import compute_realistic_fill, derive_arrival_price

MONGO_URI = "mongodb+srv://deepanshuop_db_user:Fillscore2026@cluster0.ujqvavh.mongodb.net/fillscore?retryWrites=true&w=majority&appName=Cluster0"

def regen_fills(symbol: str, user_ids: list[str]) -> dict:
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    
    trades = list(db.trades.find({
        "userId": {"$in": user_ids},
        "symbol": symbol
    }))
    
    stats = {
        "symbol": symbol,
        "total": len(trades),
        "skipped": 0,
        "market_updated": 0,
        "limit_corrected": 0,
        "market_fallback": 0
    }
    
    print(f"[{symbol}] Found {len(trades)} trades to process.")
    
    for i, trade in enumerate(trades):
        if i % 10 == 0:
            print(f"  [{symbol}] Progress: {i}/{len(trades)}")

        # Idempotency: skip trades already processed by a prior run
        if trade.get("realFillComputed") is not None:
            stats["skipped"] += 1
            continue
            
        trade_ts_ms = int(pd.to_datetime(trade['executedAt']).timestamp() * 1000)
        order_type = trade.get('orderType', 'MARKET')
        
        now = datetime.datetime.utcnow().isoformat()
        
        if order_type == 'LIMIT':
            db.trades.update_one(
                {"_id": trade["_id"]},
                {"$set": {
                    "realFillComputed": False,
                    "arrivalSlippageBps": 0.0,
                    "arrivalPriceProxy": trade.get("executionPrice"),
                    "realFillComputedAt": now
                }}
            )
            stats["limit_corrected"] += 1
            continue
            
        # MARKET order
        df = fetch_aggtrades_window(symbol, trade_ts_ms, half_window_s=30)
        
        derived_arrival = derive_arrival_price(df, trade_ts_ms)
        if derived_arrival is not None:
            arrival_price = derived_arrival
        else:
            arrival_price = trade.get('arrivalPriceProxy')
                
        if arrival_price is None:
            db.trades.update_one(
                {"_id": trade["_id"]},
                {"$set": {
                    "realFillComputed": False,
                    "realFillComputedAt": now
                }}
            )
            stats["market_fallback"] += 1
            continue
            
        real_fill = compute_realistic_fill(
            aggtrades_df=df,
            arrival_price=arrival_price,
            arrival_ts_ms=trade_ts_ms,
            side=trade['side'],
            quantity=trade['quantity'],
            order_type='MARKET',
            exec_window_ms=2000
        )
        
        if real_fill['real_fill_used']:
            db.trades.update_one(
                {"_id": trade["_id"]},
                {"$set": {
                    "executionPrice": real_fill['exec_price'],
                    "arrivalPriceProxy": arrival_price,
                    "arrivalSlippageBps": real_fill['arrival_slippage_bps'],
                    "realFillComputed": True,
                    "realFillComputedAt": now
                }}
            )
            stats["market_updated"] += 1
        else:
            db.trades.update_one(
                {"_id": trade["_id"]},
                {"$set": {
                    "realFillComputed": False,
                    "realFillComputedAt": now
                }}
            )
            stats["market_fallback"] += 1
            
        time.sleep(0.200)
        
    return stats

def main():
    users = ["demo-aggressive", "demo-moderate", "demo-disciplined"]
    symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]
    
    print("Starting REAL-FILL regeneration...")
    
    results = []
    for sym in symbols:
        res = regen_fills(sym, users)
        results.append(res)
        print(f"[{sym}] Result:", res)
        
    print("\n--- FINAL REPORT ---")
    for r in results:
        print(f"{r['symbol']}: Total={r['total']}, Skipped={r['skipped']}, Market Updated={r['market_updated']}, Limit Corrected={r['limit_corrected']}, Market Fallback={r['market_fallback']}")

if __name__ == "__main__":
    main()

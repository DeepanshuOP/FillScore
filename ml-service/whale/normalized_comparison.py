import pandas as pd
from pymongo import MongoClient
import numpy as np

import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")
MONGO_URI = os.getenv("MONGODB_URI")
if not MONGO_URI:
    raise RuntimeError("MONGODB_URI not set")

WHALE_THRESHOLDS = {
    'BTCUSDT': 250_000.0,
    'ETHUSDT': 250_000.0,
    'SOLUSDT': 100_000.0,
    'BNBUSDT': 50_000.0
}

def main():
    client = MongoClient(MONGO_URI)
    db = client.get_database("fillscore")
    trades_collection = db.get_collection("trades")
    
    users = ["demo-aggressive", "demo-moderate", "demo-disciplined"]
    
    trades = list(trades_collection.find({
        "userId": {"$in": users},
        "orderType": "MARKET",
        "whaleEnrichedAt": {"$exists": True}
    }))
    
    print("==================================================")
    print("NORMALIZED WHALE COMPARISON")
    print("==================================================")
    print("Goal: Normalizes the raw USD threshold against each symbol's typical")
    print("large trade size (median of whaleLargestNotional). This gives a")
    print("'multiples of typical trade size' unit that is comparable across symbols.")
    print("It answers: is an adverse rate driven by true market structure or just")
    print("a threshold that is relatively 'easier' to hit on some symbols?")
    print("==================================================\n")
    
    df = pd.DataFrame(trades)
    if df.empty:
        print("No enriched MARKET trades found.")
        return
        
    df['executedAt'] = pd.to_datetime(df['executedAt'])
    df['hour_utc'] = df['executedAt'].dt.hour
    
    symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT']
    
    for sym in symbols:
        sym_df = df[df['symbol'] == sym]
        if sym_df.empty:
            continue
            
        whale_notional_usd = WHALE_THRESHOLDS.get(sym, 250_000.0)
        
        # Approximate typical large-trade size using the median of largest events seen in the window
        largest_notionals = sym_df[sym_df['whaleLargestNotional'] > 0]['whaleLargestNotional'].dropna()
        if largest_notionals.empty:
            median_aggtrade_notional = np.nan
            normalized_threshold = np.nan
        else:
            median_aggtrade_notional = largest_notionals.median()
            normalized_threshold = whale_notional_usd / median_aggtrade_notional
            
        detection_rate = sym_df['whaleEventCount'].apply(lambda x: x > 0 if pd.notnull(x) else False).mean()
        adverse_rate = sym_df['whaleAdverse'].fillna(False).mean()
        
        print(f"[{sym}]")
        print(f"  Whale Threshold USD: ${whale_notional_usd:,.2f}")
        print(f"  Median Window Peak:  ${median_aggtrade_notional:,.2f}")
        print(f"  Normalized Thresh:   {normalized_threshold:.2f}x median peak")
        print(f"  Detection Rate:      {detection_rate*100:.1f}%")
        print(f"  Adverse Rate:        {adverse_rate*100:.1f}%")
        
        print("  Hourly Adverse Rate Breakdown (UTC):")
        # Buckets: 0-5, 6-11, 12-17, 18-23
        bins = [-1, 5, 11, 17, 23]
        labels = ["0-5", "6-11", "12-17", "18-23"]
        # Use copy to avoid settingwithcopy warning
        sym_df = sym_df.copy()
        sym_df['hour_bucket'] = pd.cut(sym_df['hour_utc'], bins=bins, labels=labels)
        
        for bucket in labels:
            bucket_df = sym_df[sym_df['hour_bucket'] == bucket]
            if bucket_df.empty:
                print(f"    {bucket}: No trades")
            else:
                b_adv_rate = bucket_df['whaleAdverse'].fillna(False).mean()
                b_count = len(bucket_df)
                print(f"    {bucket}: {b_adv_rate*100:.1f}%  (n={b_count})")
        print("-" * 50)

if __name__ == "__main__":
    main()

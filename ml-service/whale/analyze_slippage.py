import sys
import numpy as np
import scipy.stats as stats
from pymongo import MongoClient

MONGO_URI = "mongodb+srv://deepanshuop_db_user:Fillscore2026@cluster0.ujqvavh.mongodb.net/fillscore?retryWrites=true&w=majority&appName=Cluster0"

def cohens_d(x, y):
    n1, n2 = len(x), len(y)
    var_x = np.var(x, ddof=1)
    var_y = np.var(y, ddof=1)
    pooled_sd = np.sqrt(((n1 - 1) * var_x + (n2 - 1) * var_y) / (n1 + n2 - 2))
    return (np.mean(x) - np.mean(y)) / pooled_sd

def rank_biserial(x, y, u_stat):
    n1, n2 = len(x), len(y)
    return 1 - (2 * u_stat) / (n1 * n2)

def analyze_group(adverse_vals, non_adverse_vals, group_name):
    print(f"\n{'='*50}\nGroup: {group_name}\n{'='*50}")
    
    n_adv = len(adverse_vals)
    n_non = len(non_adverse_vals)
    
    print(f"Adverse Group     (n={n_adv:4d}): Mean={np.mean(adverse_vals):.2f}, Median={np.median(adverse_vals):.2f}, Std={np.std(adverse_vals, ddof=1):.2f}")
    print(f"Non-Adverse Group (n={n_non:4d}): Mean={np.mean(non_adverse_vals):.2f}, Median={np.median(non_adverse_vals):.2f}, Std={np.std(non_adverse_vals, ddof=1):.2f}")
    
    if n_adv < 15 or n_non < 15:
        print("\n*** WARNING: One or both groups have n < 15. Statistical tests may not be meaningful. ***")
    
    mean_diff = np.mean(adverse_vals) - np.mean(non_adverse_vals)
    print(f"\nDifference in Means (Adverse - Non-Adverse): {mean_diff:.2f} bps")
    
    # Mann-Whitney U test (PRIMARY, robust to skew)
    u_stat, p_val_u = stats.mannwhitneyu(adverse_vals, non_adverse_vals, alternative='two-sided')
    assert 0 <= p_val_u <= 1, "p-value out of bounds"
    rbc = rank_biserial(adverse_vals, non_adverse_vals, u_stat)
    print(f"Mann-Whitney U test (PRIMARY, robust to skew): p-value = {p_val_u:.4f} | Rank-Biserial r = {rbc:.4f}")

    # Welch's t-test (secondary, parametric check)
    t_stat, p_val_t = stats.ttest_ind(adverse_vals, non_adverse_vals, equal_var=False)
    assert 0 <= p_val_t <= 1, "p-value out of bounds"
    d = cohens_d(adverse_vals, non_adverse_vals)
    print(f"Welch's t-test (secondary, parametric check):  p-value = {p_val_t:.4f} | Cohen's d = {d:.4f}")

def main():
    client = MongoClient(MONGO_URI)
    db = client.get_default_database()
    
    users = ["demo-aggressive", "demo-moderate", "demo-disciplined"]
    trades = list(db.trades.find({
        "userId": {"$in": users},
        "orderType": "MARKET",
        "whaleEnrichedAt": {"$exists": True},
        "arrivalSlippageBps": {"$exists": True, "$ne": None}
    }))
    
    print(f"Loaded {len(trades)} enriched trades from MongoDB.")
    
    # Pooled
    adv_pooled = [t['arrivalSlippageBps'] for t in trades if t.get('whaleAdverse') is True]
    non_pooled = [t['arrivalSlippageBps'] for t in trades if t.get('whaleAdverse') is False]
    
    assert len(adv_pooled) > 0, "No adverse trades found"
    assert len(non_pooled) > 0, "No non-adverse trades found"
    
    analyze_group(adv_pooled, non_pooled, "POOLED (ALL SYMBOLS)")
    
    # Per-symbol
    symbols = set(t['symbol'] for t in trades)
    for sym in sorted(symbols):
        adv_sym = [t['arrivalSlippageBps'] for t in trades if t['symbol'] == sym and t.get('whaleAdverse') is True]
        non_sym = [t['arrivalSlippageBps'] for t in trades if t['symbol'] == sym and t.get('whaleAdverse') is False]
        
        if len(adv_sym) == 0 or len(non_sym) == 0:
            print(f"\n{'='*50}\nGroup: {sym}\n{'='*50}")
            print(f"Cannot run analysis for {sym}: missing data in one group (Adverse: {len(adv_sym)}, Non-Adverse: {len(non_sym)})")
            continue
            
        analyze_group(adv_sym, non_sym, sym)

if __name__ == "__main__":
    main()

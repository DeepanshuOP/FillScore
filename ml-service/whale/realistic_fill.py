import pandas as pd
from typing import Optional

def derive_arrival_price(aggtrades_df: pd.DataFrame, arrival_ts_ms: int) -> Optional[float]:
    if aggtrades_df.empty:
        return None
    before_df = aggtrades_df[aggtrades_df['transact_time_ms'] <= arrival_ts_ms]
    if not before_df.empty:
        return float(before_df.iloc[-1]['price'])
    return float(aggtrades_df.iloc[0]['price'])

def compute_realistic_fill(aggtrades_df: pd.DataFrame, arrival_price: float, arrival_ts_ms: int, side: str, quantity: float, order_type: str, exec_window_ms: int = 2000) -> dict:
    if order_type.upper() == 'LIMIT':
        return {
            'exec_price': arrival_price,
            'arrival_slippage_bps': 0.0,
            'real_fill_used': False
        }
        
    if aggtrades_df.empty:
        return {
            'exec_price': arrival_price,
            'arrival_slippage_bps': 0.0,
            'real_fill_used': False
        }
        
    # Filter trades within the execution window
    end_ts = arrival_ts_ms + exec_window_ms
    window_df = aggtrades_df[(aggtrades_df['transact_time_ms'] >= arrival_ts_ms) & (aggtrades_df['transact_time_ms'] <= end_ts)].copy()
    
    if window_df.empty:
        return {
            'exec_price': arrival_price,
            'arrival_slippage_bps': 0.0,
            'real_fill_used': False
        }
        
    # Sort ascending just in case
    window_df = window_df.sort_values('transact_time_ms', ascending=True)
    
    consumed_qty = 0.0
    consumed_notional = 0.0
    
    for _, row in window_df.iterrows():
        rem = quantity - consumed_qty
        if rem <= 0:
            break
            
        take = min(row['quantity'], rem)
        consumed_qty += take
        consumed_notional += take * row['price']
        
    if consumed_qty == 0:
        return {
            'exec_price': arrival_price,
            'arrival_slippage_bps': 0.0,
            'real_fill_used': False
        }
        
    exec_price = consumed_notional / consumed_qty
    
    if side.upper() == 'BUY':
        arrival_slippage_bps = (exec_price / arrival_price - 1) * 10000.0
    else:
        arrival_slippage_bps = (1 - exec_price / arrival_price) * 10000.0
        
    return {
        'exec_price': exec_price,
        'arrival_slippage_bps': arrival_slippage_bps,
        'real_fill_used': True
    }

import pytest
import pandas as pd
from whale.realistic_fill import compute_realistic_fill

@pytest.fixture
def empty_df():
    return pd.DataFrame(columns=['agg_trade_id', 'price', 'quantity', 'transact_time_ms', 'is_buyer_maker'])

@pytest.fixture
def rising_df():
    # Price rises from 100 to 105 over 1000ms
    data = [
        {'agg_trade_id': 1, 'price': 100.0, 'quantity': 1.0, 'transact_time_ms': 1000, 'is_buyer_maker': False},
        {'agg_trade_id': 2, 'price': 101.0, 'quantity': 1.0, 'transact_time_ms': 1200, 'is_buyer_maker': False},
        {'agg_trade_id': 3, 'price': 102.0, 'quantity': 2.0, 'transact_time_ms': 1500, 'is_buyer_maker': False},
        {'agg_trade_id': 4, 'price': 105.0, 'quantity': 5.0, 'transact_time_ms': 2500, 'is_buyer_maker': False}, # Outside window if window=1000, inside if 2000
    ]
    return pd.DataFrame(data)

def test_empty_window(empty_df):
    res = compute_realistic_fill(empty_df, arrival_price=100.0, arrival_ts_ms=1000, side='BUY', quantity=1.0, order_type='MARKET', exec_window_ms=2000)
    assert res['exec_price'] == 100.0
    assert res['arrival_slippage_bps'] == 0.0
    assert res['real_fill_used'] is False

def test_limit_order(rising_df):
    res = compute_realistic_fill(rising_df, arrival_price=100.0, arrival_ts_ms=1000, side='BUY', quantity=1.0, order_type='LIMIT', exec_window_ms=2000)
    assert res['exec_price'] == 100.0
    assert res['arrival_slippage_bps'] == 0.0
    assert res['real_fill_used'] is False

def test_market_buy_small_qty(rising_df):
    # Order quantity 1.5. Consumes trade 1 (qty 1 @ 100) and trade 2 (qty 0.5 @ 101)
    # VWAP = (1*100 + 0.5*101) / 1.5 = 150.5 / 1.5 = 100.3333
    res = compute_realistic_fill(rising_df, arrival_price=100.0, arrival_ts_ms=1000, side='BUY', quantity=1.5, order_type='MARKET', exec_window_ms=2000)
    assert res['real_fill_used'] is True
    assert pytest.approx(res['exec_price'], 0.0001) == 100.333333
    # BUY adverse = (100.3333 / 100 - 1) * 1e4 = 0.003333 * 1e4 = 33.33 bps
    assert pytest.approx(res['arrival_slippage_bps'], 0.01) == 33.33

def test_market_sell_small_qty(rising_df):
    # Same execution prices but it's a SELL, so selling at higher price = good = NEGATIVE adverse slippage
    # exec_price = 100.3333. arrival = 100.0. 
    # (1 - exec/arrival) * 1e4 = (1 - 1.003333) * 1e4 = -33.33 bps
    res = compute_realistic_fill(rising_df, arrival_price=100.0, arrival_ts_ms=1000, side='SELL', quantity=1.5, order_type='MARKET', exec_window_ms=2000)
    assert res['real_fill_used'] is True
    assert pytest.approx(res['exec_price'], 0.0001) == 100.333333
    assert pytest.approx(res['arrival_slippage_bps'], 0.01) == -33.33

def test_market_buy_large_qty(rising_df):
    # Quantity 10. Rising df total qty within 2000ms window [1000, 3000] is 1+1+2+5=9.
    # We consume all 9 available.
    # Total notional = 1*100 + 1*101 + 2*102 + 5*105 = 100 + 101 + 204 + 525 = 930
    # VWAP = 930 / 9 = 103.3333
    res = compute_realistic_fill(rising_df, arrival_price=100.0, arrival_ts_ms=1000, side='BUY', quantity=10.0, order_type='MARKET', exec_window_ms=2000)
    assert res['real_fill_used'] is True
    assert pytest.approx(res['exec_price'], 0.0001) == 103.333333
    assert pytest.approx(res['arrival_slippage_bps'], 0.01) == 333.33

def test_market_window_filter(rising_df):
    # Order quantity 10, but window is 1000ms (so max ts is 2000). 
    # Trade 4 is at 2500, so it's excluded.
    # We only consume trades 1, 2, 3. Total qty = 4. 
    # Notional = 100 + 101 + 204 = 405. VWAP = 405 / 4 = 101.25
    res = compute_realistic_fill(rising_df, arrival_price=100.0, arrival_ts_ms=1000, side='BUY', quantity=10.0, order_type='MARKET', exec_window_ms=1000)
    assert res['real_fill_used'] is True
    assert pytest.approx(res['exec_price'], 0.0001) == 101.25
    assert pytest.approx(res['arrival_slippage_bps'], 0.01) == 125.0

"""Report sections of the real-account validation harness, with hand-computed values."""
import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "validate_real_account.py"


def _mod():
    spec = importlib.util.spec_from_file_location("validate_real_account", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _o(type_, orig, executed, status):
    return {"type": type_, "origQty": orig, "executedQty": executed, "status": status}


def test_order_outcomes_by_type():
    # 7 orders: MARKET 2 filled; LIMIT 1 filled, 1 partly filled (0.5 of 1), 2 cancelled with nothing filled, 1 still open (NEW).
    orders = [_o("MARKET", 1, 1, "FILLED"), _o("MARKET", 0.2, 0.2, "FILLED"),
              _o("LIMIT", 1, 1, "FILLED"), _o("LIMIT", 1, 0.5, "CANCELED"),
              _o("LIMIT", 1, 0, "CANCELED"), _o("LIMIT", 1, 0, "EXPIRED"), _o("LIMIT", 1, 0, "NEW")]
    r = _mod().order_outcomes(orders)
    assert r["total"] == 7
    assert r["MARKET"] == {"total": 2, "filled": 2, "partial": 0, "unfilled": 0, "open": 0}
    assert r["LIMIT"] == {"total": 5, "filled": 1, "partial": 1, "unfilled": 2, "open": 1}


def test_unfilled_cost_counts_orders_below_full_fill():
    # A: fill ratio 0, notional 1000, opportunity 3.0 bps -> 1000 x 3 / 1e4 = 0.30 USD
    # B: fill ratio 0.5, notional 2000, opportunity 1.5 bps -> 2000 x 1.5 / 1e4 = 0.30 USD
    # C: fully filled (ignored). D: never filled, no measurement (no print before arrival): counted as not measured.
    oms = [{"shortfall": {"fillRatio": 0.0, "intendedNotional": 1000.0, "opportunityBps": 3.0}},
           {"shortfall": {"fillRatio": 0.5, "intendedNotional": 2000.0, "opportunityBps": 1.5}},
           {"shortfall": {"fillRatio": 1.0, "intendedNotional": 500.0, "opportunityBps": 0.0}},
           {"shortfall": None, "unmeasuredReason": "no fresh print before the order's arrival time"}]
    unfilled_orders = 3        # the orders collection says 3 orders ended below a full fill: A, B and D
    r = _mod().unfilled_cost(oms, unfilled_orders)
    assert r["measured"] == 2 and r["notMeasured"] == 1
    assert r["totalUsd"] == pytest.approx(0.60, abs=1e-12)
    assert r["medianBps"] == pytest.approx(2.25, abs=1e-12)


SNAP = {"symbol": "BTCUSDT", "fetchedAt": "2024-01-16",
        "standard": {"maker": 0.001, "taker": 0.001, "buyer": 0.0, "seller": 0.0},
        "tax": {"maker": 0.0, "taker": 0.0, "buyer": 0.0, "seller": 0.0},
        "special": {"maker": 0.0, "taker": 0.0, "buyer": 0.0, "seller": 0.0},
        "discount": {"enabledForAccount": True, "enabledForSymbol": True, "asset": "BNB", "rate": 0.75}}


def test_fee_check_against_the_accounts_rates():
    # rate 0.1% for every liquidity and side; with BNB the discount multiplier is 0.75.
    # T1 taker BUY notional 1000, paid 1.00 USDT-equivalent: expected 1000 x 0.001 = 1.00 (matches)
    # T2 maker SELL notional 500, paid 1.00: expected 0.50 (paid above the rate)
    # T3 ETHUSDT has no snapshot: not compared
    # T4 taker BUY notional 1000 paid in BNB 0.75: expected 1000 x 0.001 x 0.75 = 0.75 (matches), counted as a BNB fee
    trades = [
        {"symbol": "BTCUSDT", "side": "BUY", "isMaker": False, "notional": 1000.0, "feeUsd": 1.00, "feeAsset": "USDT"},
        {"symbol": "BTCUSDT", "side": "SELL", "isMaker": True, "notional": 500.0, "feeUsd": 1.00, "feeAsset": "USDT"},
        {"symbol": "ETHUSDT", "side": "BUY", "isMaker": False, "notional": 800.0, "feeUsd": 0.80, "feeAsset": "USDT"},
        {"symbol": "BTCUSDT", "side": "BUY", "isMaker": False, "notional": 1000.0, "feeUsd": 0.75, "feeAsset": "BNB"},
    ]
    r = _mod().fee_check(trades, [SNAP])
    assert r["compared"] == 3 and r["noSnapshot"] == 1
    assert r["paidUsd"] == pytest.approx(2.75, abs=1e-12)
    assert r["expectedUsd"] == pytest.approx(2.25, abs=1e-12)
    assert r["differenceUsd"] == pytest.approx(0.50, abs=1e-12)
    assert r["aboveRate"] == 1 and r["bnbFees"] == 1


def test_fee_check_with_nothing_to_compare_is_insufficient_not_zero():
    r = _mod().fee_check([{"symbol": "ETHUSDT", "side": "BUY", "isMaker": False, "notional": 1.0, "feeUsd": 0.001, "feeAsset": "USDT"}], [])
    assert r["compared"] == 0 and r["paidUsd"] is None and r["expectedUsd"] is None and r["differenceUsd"] is None

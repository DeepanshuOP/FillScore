"""scripts/whale_prefill_study.py: only prints strictly before the fill can make it "adverse" (M2, plan §2).

Hand tape (B = 2024-01-15 14:00 UTC, threshold 100 USD): a buyer-initiated burst of 3 x 50 USD at B-10.0..B-9.0 s
(150 USD, a whale buy before the fill), and a seller-initiated burst of 3 x 60 USD at B+5.0..B+6.0 s (after the fill).
User BUY at B:
  old rule (+-30 s): events = buy burst (-9.5 s) and sell burst (+5.5 s); pressure = (150 e^-0.95 - 180 e^-0.55)/330 < 0
     -> not adverse (the after-fill sell burst outweighs it);
  pre-fill rule: only the buy burst exists -> pressure > 0 -> adverse (it pushed against a buy before the fill).
User SELL at B: old rule adverse (the after-fill sell burst dominates), pre-fill rule not adverse.
"""
import importlib.util
from pathlib import Path

import pytest

from measure.data.aggtrades import AggTradeWindow

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "whale_prefill_study.py"
B = 1_705_327_200_000


def _mod():
    spec = importlib.util.spec_from_file_location("whale_prefill_study", SCRIPT)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


ROWS = [(B - 10_000, 50.0, False), (B - 9_500, 50.0, False), (B - 9_000, 50.0, False),
        (B + 5_000, 60.0, True), (B + 5_500, 60.0, True), (B + 6_000, 60.0, True)]
TAPE = AggTradeWindow.from_rows("XUSDT", [(i + 1, 1.0, n, ts, m) for i, (ts, n, m) in enumerate(ROWS)])


def test_after_fill_bursts_count_only_in_the_old_rule():
    m = _mod()
    buy = m.whale_flags(TAPE, B, "BUY", threshold=100.0)
    assert buy["old"]["adverse"] is False and buy["prefill"]["adverse"] is True
    assert buy["old"]["events"] == 2 and buy["prefill"]["events"] == 1
    sell = m.whale_flags(TAPE, B, "SELL", threshold=100.0)
    assert sell["old"]["adverse"] is True and sell["prefill"]["adverse"] is False


def test_a_print_at_the_fill_millisecond_is_not_before_the_fill():
    m = _mod()
    tape = AggTradeWindow.from_rows("XUSDT", [(1, 1.0, 150.0, B, False)])
    assert m.whale_flags(tape, B, "BUY", threshold=100.0)["prefill"]["events"] == 0


def test_rate_with_interval_is_a_fraction_with_bounds():
    m = _mod()
    r = m.rate([True, False, False, True], seed=1)
    assert r["n"] == 4 and r["rate"] == pytest.approx(0.5)
    assert 0.0 <= r["lo"] <= 0.5 <= r["hi"] <= 1.0

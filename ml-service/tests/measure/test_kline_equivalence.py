"""Kline context equals the aggregate-trade context: 120 seeded random symbol-hours of January 2024 (item 8, widened).

Three layers:
  1. the sampler is pure and seeded: same seed, same cases; hand-checked properties (count, uniqueness, ranges);
  2. the committed result (tests/fixtures/market/kline_equivalence_2024-01.json, produced by scripts/kline_equivalence.py)
     is consistent with the sampler and states maximum absolute differences below tolerance;
  3. when the local caches exist (aggTrades zips in .cache/market/zips and kline zips in .cache/market/klines), the
     comparison is recomputed and must reproduce the committed maxima. CI has no caches, so layer 3 skips there.

Tolerances: sigma is in bps and volume is a base quantity summed over 60 minutes. A kline close is the price of the last
trade of its minute and its volume is the base quantity traded, so the two sources agree to floating-point noise; the
bound 1e-6 bps and 1e-6 relative on volume leaves room for summation order only.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import kline_equivalence as ke  # noqa: E402

RESULT = ROOT / "tests" / "fixtures" / "market" / "kline_equivalence_2024-01.json"
SEED, N = 20260119, 120


def test_sampler_is_seeded_and_valid():
    a, b = ke.sample_cases(SEED, N), ke.sample_cases(SEED, N)
    assert a == b and len(a) == N
    assert ke.sample_cases(SEED + 1, N) != a
    assert len({(c["symbol"], c["day"], c["hour"]) for c in a}) == N          # distinct symbol-hours
    assert {c["symbol"] for c in a} <= set(ke.SYMBOLS)
    for c in a:
        assert c["day"].startswith("2024-01-") and "2024-01-02" <= c["day"] <= "2024-01-30"
        assert 2 <= c["hour"] <= 23                                            # the 60-minute lookback stays inside the day
        day_start = ke.day_start_ms(c["day"])
        assert day_start + c["hour"] * 3_600_000 <= c["t_ms"] < day_start + (c["hour"] + 1) * 3_600_000


def test_day_start_ms_is_utc_midnight():
    # 2024-01-15 00:00:00 UTC = 1705276800 s (hand check: 19737 days after 1970-01-01, 19737 * 86400 = 1705276800)
    assert ke.day_start_ms("2024-01-15") == 1_705_276_800_000


def test_committed_result_matches_the_sampler_and_the_tolerances():
    res = json.loads(RESULT.read_text())
    assert res["seed"] == SEED and res["n_requested"] == N
    cases = ke.sample_cases(SEED, N)
    assert [(c["symbol"], c["day"], c["hour"], c["t_ms"]) for c in cases] == [(r["symbol"], r["day"], r["hour"], r["t_ms"]) for r in res["cases"]]
    assert res["n_compared"] >= 100
    assert res["max_abs_diff_sigma_bps"] <= 1e-6
    assert res["max_rel_diff_volume"] <= 1e-6
    assert res["none_mismatches"] == 0


@pytest.mark.skipif(not ke.caches_present(), reason="local aggTrades and kline caches are not present (CI)")
def test_recomputed_from_the_local_caches_reproduces_the_committed_maxima():
    res = json.loads(RESULT.read_text())
    again = ke.run(SEED, N)
    assert again["n_compared"] == res["n_compared"]
    assert again["max_abs_diff_sigma_bps"] == pytest.approx(res["max_abs_diff_sigma_bps"], abs=1e-12)
    assert again["max_abs_diff_volume"] == pytest.approx(res["max_abs_diff_volume"], abs=1e-9)

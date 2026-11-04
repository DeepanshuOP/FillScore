"""Deterministic counterfactual gate. Fixtures hand-computed (see tests/test_counterfactual.py)."""
import pytest
from agents.verification import (
    ACTIONS, GateItem, materiality_threshold, evaluate, find_contradictions,
    run_gate, summarise,
)
from tests.test_counterfactual import OKX, BIN, S, T
from datetime import datetime


def rec(a, p=None, text="x"):
    return {"action_type": a, "params": p or {}, "rationale_text": text}


def test_actions():
    assert ACTIONS == ("maker_instead_of_taker", "exclude_hours", "venue_shift",
                       "smaller_clips", "none", "general")


def test_materiality():
    assert materiality_threshold(9.70) == pytest.approx(1.00)
    assert materiality_threshold(1100) == pytest.approx(5.50)
    assert materiality_threshold(200) == 1.0
    # material iff strictly greater: 1.00 not, 1.01 yes
    assert not (1.00 > materiality_threshold(9.70))
    assert 1.01 > materiality_threshold(9.70)


def test_okx_gate():
    g = evaluate(rec("exclude_hours", {"hours": [8]}), OKX, "BTCUSDT")
    assert g.status == "passed" and g.cf.effect_usd == pytest.approx(3.10, abs=1e-6)
    g = evaluate(rec("maker_instead_of_taker", {"target_ratio": 0.8}), OKX, "BTCUSDT")
    assert (g.status, g.reason) == ("rejected", "immaterial")
    flat = [{**t, "exchange": "binance"} for t in OKX]
    g = evaluate(rec("maker_instead_of_taker", {"target_ratio": 0.5}), flat, "BTCUSDT")
    assert (g.status, g.reason) == ("rejected", "immaterial")
    g = evaluate(rec("exclude_hours", {"hours": [14]}), OKX, "BTCUSDT")
    assert g.reason == "immaterial"
    g = evaluate(rec("exclude_hours", {"hours": [3]}), OKX, "BTCUSDT")
    assert g.reason == "invalid_params"
    g = evaluate(rec("maker_instead_of_taker", {"target_ratio": 0.65}), OKX, "BTCUSDT")
    assert g.reason == "invalid_params"
    g = evaluate(rec("maker_instead_of_taker", {"target_ratio": 0.5, "x": 1}), OKX, "BTCUSDT")
    assert g.reason == "invalid_params"
    g = evaluate(rec("buy_more"), OKX, "BTCUSDT")
    assert (g.status, g.reason) == ("rejected", "invalid_params")
    g = evaluate(rec("exclude_hours", {"hours": [8, 14, 21]}), OKX, "BTCUSDT")
    assert g.reason == "not_computable:no_trades_outside_hours"
    g = evaluate(rec("general", {"anything": 1}), OKX, "BTCUSDT")
    assert g.status == "observation" and g.cf is None
    g = evaluate(rec("none"), OKX, "BTCUSDT")
    assert g.status == "observation"


def test_combined_gate():
    ts = OKX + BIN  # fees 9.70 + 5.00 = 14.70 -> threshold 1.00; effect 0.571429
    g = evaluate(rec("venue_shift", {"from": "binance", "to": "okx", "symbol": "BTCUSDT"}), ts, "BTCUSDT")
    assert (g.status, g.reason) == ("rejected", "immaterial")
    g = evaluate(rec("venue_shift", {"from": "okx", "to": "binance", "symbol": "ETHUSDT"}), ts, "BTCUSDT")
    assert g.reason == "not_computable:not_on_both_venues"
    g = evaluate(rec("venue_shift", {"from": "kraken", "to": "okx", "symbol": "BTCUSDT"}), ts, "BTCUSDT")
    assert g.reason == "invalid_params"


def scaled():
    return [{**t, "notionalValue": t["notionalValue"] * 100, "feePaid": t["feePaid"] * 100} for t in S]


def test_smaller_clips_gate():
    ts = scaled()  # fees 1100 -> threshold 5.50
    g = evaluate(rec("smaller_clips", {"symbol": "BTCUSDT", "threshold": "median_trade_usd"}), ts, "BTCUSDT")
    assert g.status == "passed"
    assert g.cf.details["threshold_usd"] == pytest.approx(250000)
    assert g.cf.effect_usd == pytest.approx(1330.0, abs=1e-6)
    g = evaluate(rec("smaller_clips", {"symbol": "BTCUSDT", "threshold": "p90_trade_usd"}), ts, "BTCUSDT")
    # p90 = 470000; above s3 only: 30 bps; below 1260/600000 = 21 bps; diff 9; 9*500000/1e4 = 450
    assert g.status == "passed"
    assert g.cf.details["threshold_usd"] == pytest.approx(470000)
    assert g.cf.effect_usd == pytest.approx(450.0, abs=1e-6)
    assert g.cf.n_trades_affected == 1


def mk(a, p, status="passed"):
    return GateItem(a, p, "t", status, None, None)


def test_contradictions():
    vs = {"from": "binance", "to": "okx", "symbol": "BTCUSDT"}
    sw = {"from": "okx", "to": "binance", "symbol": "BTCUSDT"}
    items = run_gate  # noqa
    its = [mk("venue_shift", vs), mk("venue_shift", sw)]
    assert find_contradictions(its) == {0, 1}
    its = [mk("exclude_hours", {"hours": [8]}), mk("exclude_hours", {"hours": [8]})]
    assert find_contradictions(its) == {1}


def mkc(a, p, ids, effect=2.0):
    from agents.counterfactual import CounterfactualResult
    return GateItem(a, p, "t", "passed", None, CounterfactualResult(effect, 1.0, len(ids), "m", {}, ids))


def test_same_action_with_overlapping_affected_ids_is_a_duplicate():
    # 1c.10 F6: [1,2] vs [2,1] (equal sets, different order), [8] vs [8,14], maker 0.5 vs 0.8 share trades
    from agents.verification import mark_contradictions
    cases = [
        (("exclude_hours", {"hours": [1, 2]}, ["a", "b"]), ("exclude_hours", {"hours": [2, 1]}, ["b", "a"])),
        (("exclude_hours", {"hours": [8]}, ["o2"]), ("exclude_hours", {"hours": [8, 14]}, ["o2", "o4"])),
        (("maker_instead_of_taker", {"target_ratio": 0.5}, ["t1"]),
         ("maker_instead_of_taker", {"target_ratio": 0.8}, ["t1", "t2"])),
    ]
    for (a1, p1, i1), (a2, p2, i2) in cases:
        items = [mkc(a1, p1, i1), mkc(a2, p2, i2)]
        assert find_contradictions(items) == {1}
        out = mark_contradictions(items)
        assert [(i.status, i.reason) for i in out] == [("passed", None), ("rejected", "duplicate")]


def test_disjoint_or_different_actions_do_not_conflict():
    from agents.verification import mark_contradictions
    items = [mkc("exclude_hours", {"hours": [8]}, ["a"]), mkc("exclude_hours", {"hours": [9]}, ["b"]),
             mkc("maker_instead_of_taker", {"target_ratio": 0.5}, ["a"])]
    assert [i.status for i in mark_contradictions(items)] == ["passed"] * 3


def test_venue_shift_reversal_stays_a_contradiction():
    from agents.verification import mark_contradictions
    vs = {"from": "binance", "to": "okx", "symbol": "BTCUSDT"}
    sw = {"from": "okx", "to": "binance", "symbol": "BTCUSDT"}
    out = mark_contradictions([mkc("venue_shift", vs, ["a"]), mkc("venue_shift", sw, ["b"])])
    assert [(i.status, i.reason) for i in out] == [("rejected", "contradiction")] * 2


def test_okx_exclude_hours_8_then_8_14_second_is_rejected_duplicate():
    # OKX fixture: [8] -> 3.10 (trades o1? see test_counterfactual); [8,14] -> 4.80 and contains the [8] trades
    out = run_gate([rec("exclude_hours", {"hours": [8]}), rec("exclude_hours", {"hours": [8, 14]})], OKX, "BTCUSDT")
    assert (out[0].status, round(out[0].cf.effect_usd, 6)) == ("passed", 3.10)
    assert (out[1].status, out[1].reason) == ("rejected", "duplicate")


def test_run_gate_marks_and_order():
    ts = scaled()
    p = {"symbol": "BTCUSDT", "threshold": "median_trade_usd"}
    out = run_gate([rec("smaller_clips", p), rec("none"), rec("smaller_clips", p)], ts, "BTCUSDT")
    assert [i.status for i in out] == ["passed", "observation", "rejected"]
    assert out[2].reason == "duplicate"


def test_summarise():
    r1 = [GateItem("a", {}, "t", "passed", None, None),
          GateItem("b", {"k": 1}, "t", "rejected", "immaterial", None),
          GateItem("none", {}, "t", "observation", None, None)]
    r2 = [GateItem("c", {}, "t", "rejected", "invalid_params", None)]
    s = summarise(r1, r2)
    assert s == {"proposed": 3, "passed": 1, "observations": 1,
                 "rejected": [{"action": "b", "params": {"k": 1}, "reason": "immaterial"}],
                 "re_reasoned": 1,
                 "dropped": [{"action": "c", "params": {}, "reason": "invalid_params"}]}
    assert summarise(r1, None)["re_reasoned"] == 0

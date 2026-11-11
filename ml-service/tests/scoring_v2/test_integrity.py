"""C5: canonical JSON and the integrity hash.

Canonical JSON: sorted keys, no spaces, floats via repr, UTF-8, NaN/inf refused.
integrity = sha256(canonical({scoringVersion, versionFileSha256, trades: sorted by tradeId [{tradeId, metricHash}],
                              marketDataSha256: sorted unique}))
"""
import hashlib

import pytest

from scoring_v2.integrity import canonical_json, integrity_hash, metric_hash


def sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def test_canonical_json_literal():
    assert canonical_json({"b": 1, "a": [0.1, "x"], "c": {"z": None, "y": True}}) == '{"a":[0.1,"x"],"b":1,"c":{"y":true,"z":null}}'
    assert canonical_json({"k": 1.0 / 3}) == '{"k":0.3333333333333333}'
    assert canonical_json({"é": "ü"}) == '{"é":"ü"}'


@pytest.mark.parametrize("bad", [float("nan"), float("inf")])
def test_canonical_json_refuses_non_finite(bad):
    with pytest.raises(ValueError):
        canonical_json({"x": bad})


def test_metric_hash_is_sha_of_canonical():
    m = {"version": "1.0.0", "effHalfBps": 0.5}
    assert metric_hash(m) == sha('{"effHalfBps":0.5,"version":"1.0.0"}')


def test_integrity_hash_literal():
    m1, m2 = {"x": 1}, {"x": 2}
    h1, h2 = sha('{"x":1}'), sha('{"x":2}')
    want = sha('{"marketDataSha256":["aa","bb"],"scoringVersion":"v2.0.0","trades":[{"metricHash":"' + h1
               + '","tradeId":"t1"},{"metricHash":"' + h2 + '","tradeId":"t2"}],"versionFileSha256":"ff"}')
    got = integrity_hash("v2.0.0", "ff", [("t2", m2), ("t1", m1)], ["bb", "aa", "bb"])
    assert got == want


def test_order_does_not_matter_but_every_input_does():
    base = integrity_hash("v2.0.0", "ff", [("t1", {"x": 1}), ("t2", {"x": 2})], ["aa", "bb"])
    assert integrity_hash("v2.0.0", "ff", [("t2", {"x": 2}), ("t1", {"x": 1})], ["bb", "aa"]) == base
    assert integrity_hash("v2.0.0", "ff", [("t1", {"x": 1}), ("t2", {"x": 3})], ["aa", "bb"]) != base
    assert integrity_hash("v2.0.0", "ff", [("t1", {"x": 1}), ("t2", {"x": 2})], ["aa", "bc"]) != base
    assert integrity_hash("v2.0.1", "ff", [("t1", {"x": 1}), ("t2", {"x": 2})], ["aa", "bb"]) != base
    assert integrity_hash("v2.0.0", "fe", [("t1", {"x": 1}), ("t2", {"x": 2})], ["aa", "bb"]) != base


def test_duplicate_trade_id_refused():
    with pytest.raises(ValueError):
        integrity_hash("v2.0.0", "ff", [("t1", {"x": 1}), ("t1", {"x": 2})], [])
